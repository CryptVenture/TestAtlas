// scripts/lib/adapters/render-github-copilot.js
//
// Adapter renderer for GitHub Copilot (Visual Studio / VS Code chat prompts).
//
// GitHub Copilot prompts live at:
//   project: .github/prompts/<name>.prompt.md
// (No documented global filesystem path — user-level instructions are
// settings-only via `github.copilot.chat.codeGeneration.instructions`.)
//
// Format: markdown with YAML frontmatter:
//   mode: agent              ← runs as an autonomous agent (not chat)
//   description: <from source>
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body).
// Output : derived `.github/prompts/atlas-<name>.prompt.md` content as a string.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, serializeFrontmatter, wrapInAdapterEnvelope } from './_shared.js';

function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

/**
 * Render a GitHub Copilot prompt file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderGithubCopilot({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';

  const targetFm = serializeFrontmatter({
    mode: 'agent',
    description,
  });

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
