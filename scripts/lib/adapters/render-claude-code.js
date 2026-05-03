// scripts/lib/adapters/render-claude-code.js
//
// Claude Code adapter renderer (Plan 06-01 Task 3).
//
// Input  : raw text of a `.testatlas/commands/<name>.md` file (frontmatter +
//          markdown body) and its absolute filesystem path.
// Output : the derived `.claude/commands/atlas-<name>.md` content as a single
//          string, ready for `atomicWrite`.
//
// Output shape:
//   ---
//   description: <copied from source>
//   allowed-tools: <capsToTools(source.capabilities) joined>
//   ---
//
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. Then read this command file. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <source body, with any leading bootstrap-first preamble stripped so
//    BOOTSTRAP_PREAMBLE is byte-exact at the head of the envelope>
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// Determinism guarantees (Pitfall 3 in 06-RESEARCH.md):
//   - No timestamps. No suite-VERSION reads. No absolute paths in output.
//   - Output is a pure function of (sourceText, sourcePath-relative-to-.testatlas/).
//   - Re-rendering identical input produces byte-identical output.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import {
  BOOTSTRAP_PREAMBLE,
  capsToTools,
  serializeFrontmatter,
  wrapInAdapterEnvelope,
} from './_shared.js';

/**
 * Strip the prior bootstrap-first preamble from a source body, if it begins
 * with one. Source command files (Phases 3+4) have a multi-line preamble
 * that's roughly equivalent to BOOTSTRAP_PREAMBLE expanded into prose. We
 * detect it by looking for the canonical opening "Before doing anything else:"
 * sentinel (used by every command file in `.testatlas/commands/`) and skip
 * past the conflict-rules block before the first `## ` heading.
 *
 * Falls back to returning the body unchanged if the sentinel isn't found —
 * this keeps the renderer robust to future command-template changes.
 *
 * @param {string} body
 * @returns {string}
 */
function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  // Skip from start of body up to (but not including) the first `## ` heading
  // line — that's the start of meaningful command content.
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

/**
 * Render a Claude Code adapter file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderClaudeCode({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const tools = capsToTools(fm.capabilities ?? []).join(', ');

  const targetFm = serializeFrontmatter({
    description,
    'allowed-tools': tools,
  });

  // Build envelope body: BOOTSTRAP_PREAMBLE on its own line, blank line,
  // then the source body with any prior preamble stripped.
  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;

  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
