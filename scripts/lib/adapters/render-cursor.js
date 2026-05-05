// scripts/lib/adapters/render-cursor.js
//
// Plan 06-04 Task 1: Cursor adapter renderer (flat MDC).
//
// Input  : raw text of `.testatlas/commands/<name>.md` and its absolute path.
// Output : the derived `.cursor/rules/atlas-<name>.mdc` content as a string.
//
// Output shape (locked, byte-stable):
//   ---
//   description: <copied from source>
//   globs:
//   alwaysApply: false
//   ---
//
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <source body, with leading bootstrap-first preamble stripped>
//
//   ## Capability Degradation                  ← injected ONLY when commandCaps ⊄ adapterCaps
//   ...
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// Cursor 2026 contract (06-RESEARCH.md §Q1.4 + Pitfall 2):
//   - We ship FLAT `.cursor/rules/<name>.mdc` files. The folder format
//     announced in Cursor 2.2 mid-2026 is non-functional, so flat MDC is the
//     verified-working format. A future TestAtlas release adds a folder
//     variant if Cursor 2.3+ ships it working.
//   - Frontmatter is locked: description / globs:<empty> / alwaysApply: false.
//     globs is empty because TestAtlas commands aren't file-scoped — users
//     invoke them via @atlas-<command> mention or manual rule attach.
//   - Cursor's declared capabilities are [browser, shell, web-fetch, MCP,
//     file-write] (Cursor shipped MCP support in 2025; as of May 2026 it
//     covers all command-required capabilities). No degradation block is
//     injected for any command.
//
// Determinism guarantees (Pitfall 3): no timestamps, no version reads, no
// absolute paths. Output is a pure function of (sourceText, sourcePath, adapterCaps).

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { renderDegradationBlock } from './_capability-degradation.js';
import { BOOTSTRAP_PREAMBLE, wrapInAdapterEnvelope } from './_shared.js';

/**
 * Strip the prior bootstrap-first preamble from a source body, if it begins
 * with one. Same contract as render-claude-code.js / render-generic.js etc.
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
 * Emit the locked Cursor MDC frontmatter block. We don't use shared
 * serializeFrontmatter() because that helper emits `key: ` with a trailing
 * space when the value is empty-string, but Cursor's MDC parser expects
 * `globs:` with NO trailing whitespace (and we want a stable byte output).
 *
 * @param {string} description
 * @returns {string}
 */
function serializeCursorFrontmatter(description) {
  return ['---', `description: ${description}`, 'globs:', 'alwaysApply: false', '---', ''].join(
    '\n',
  );
}

/**
 * Render a Cursor flat-MDC rule file from a source command's text.
 *
 * @param {{
 *   sourceText: string,
 *   sourcePath: string,
 *   adapterCaps?: string[],
 * }} opts
 * @returns {string}
 */
export function renderCursor({ sourceText, sourcePath, adapterCaps = [] }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const targetFm = serializeCursorFrontmatter(description);

  const cleanedBody = stripExistingPreamble(body);
  const commandCaps = Array.isArray(fm.capabilities) ? fm.capabilities : [];
  const degradation = renderDegradationBlock({ commandCaps, adapterCaps });

  // Body inside envelope: BOOTSTRAP_PREAMBLE → blank → cleaned source body →
  // (optional) degradation block. Degradation is appended only when this
  // command's capabilities exceed the adapter's; otherwise it's empty.
  const trimmedBody = cleanedBody.trimEnd();
  const envelopeBody = degradation
    ? `${BOOTSTRAP_PREAMBLE}\n\n${trimmedBody}\n\n${degradation.trimEnd()}`
    : `${BOOTSTRAP_PREAMBLE}\n\n${trimmedBody}`;

  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
