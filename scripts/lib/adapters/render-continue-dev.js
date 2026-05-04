// scripts/lib/adapters/render-continue-dev.js
//
// Adapter renderer for Continue.dev (https://continue.dev).
//
// Continue auto-discovers prompts at:
//   project: .continue/prompts/<name>.prompt.md
//   global:  ~/.continue/prompts/<name>.prompt.md
// and slash-invokes them as /atlas-<name> in Chat / Plan / Agent modes.
//
// Format: markdown with YAML frontmatter:
//   name: atlas-<command>
//   description: <copied from source>
//   invokable: true            ← surfaces in slash-command picker
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body).
// Output : derived `.continue/prompts/atlas-<name>.prompt.md` content as a string.

import path from 'node:path';
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

function commandBaseName(sourcePath) {
  const file = path.basename(sourcePath);
  return file.endsWith('.md') ? file.slice(0, -3) : file;
}

/**
 * Render a Continue.dev prompt file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderContinueDev({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const cmdName = commandBaseName(sourcePath);

  const targetFm = serializeFrontmatter({
    name: `atlas-${cmdName}`,
    description,
    invokable: 'true',
  });

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
