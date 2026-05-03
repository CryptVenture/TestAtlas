// scripts/lib/adapters/render-generic.js
//
// Plan 06-03 Task 1: Generic (paste-able) adapter renderer.
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body)
//          and its absolute filesystem path.
// Output : the derived `prompts/atlas-<name>.md` content as a single string.
//
// Output shape:
//   <!-- TestAtlas command: atlas-<name>. Paste .testatlas/bootstrap.md first; description: <fm.description> -->
//
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. Then read this command file. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <source body, with leading bootstrap-first preamble stripped>
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// Generic adapter contract (06-RESEARCH.md §Q1.6):
//   - NO YAML frontmatter — just an HTML-comment description.
//   - Capabilities = all 5 (declared in adapter-capabilities.json) — the agent
//     receiving the paste decides what it can actually do; no degradation
//     prose is emitted from the renderer.
//   - The README explicitly tells the user to paste `.testatlas/bootstrap.md`
//     BEFORE pasting any individual prompt; the HTML comment reinforces it
//     in-band as a soft reminder.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, wrapInAdapterEnvelope } from './_shared.js';

/**
 * Strip the prior bootstrap-first preamble from a source body, if it begins
 * with one. Same contract as render-claude-code.js: detect the canonical
 * "Before doing anything else:" sentinel and skip past the conflict-rules
 * block before the first `## ` heading.
 *
 * @param {string} body
 * @returns {string}
 */
function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

/**
 * Derive the command base name (e.g. "init") from the absolute source path.
 *
 * @param {string} sourcePath
 * @returns {string}
 */
function commandBaseName(sourcePath) {
  const idx = sourcePath.lastIndexOf('/');
  const file = idx === -1 ? sourcePath : sourcePath.slice(idx + 1);
  return file.endsWith('.md') ? file.slice(0, -3) : file;
}

/**
 * Render a Generic paste-able prompt file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderGeneric({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const cmdName = commandBaseName(sourcePath);

  // Soft, paste-friendly HTML comment — humans read it; agents ignore it.
  const headerComment = `<!-- TestAtlas command: atlas-${cmdName}. Paste .testatlas/bootstrap.md first; description: ${description} -->`;

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${headerComment}\n\n${envelope}`;
}
