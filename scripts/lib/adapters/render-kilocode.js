// scripts/lib/adapters/render-kilocode.js
//
// Plan 06-03 Task 3: KiloCode adapter renderer.
//
// Input  : raw text of `.testatlas/commands/<name>.md` and its absolute path.
// Output : the derived `.kilo/agents/atlas-<name>.md` content as a string.
//
// Output shape:
//   ---
//   description: <copied from source>
//   mode: primary
//   permission:
//     edit:
//       "_testatlas/**": allow
//       ".testatlas/**": deny
//       "*": ask
//     bash: <allow if source has 'shell' capability, deny otherwise>
//   ---
//
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <source body, with leading bootstrap-first preamble stripped>
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// KiloCode contract (06-RESEARCH.md §Q1.3 + Open Question 4):
//   - 2026 unified agents model: `.kilo/agents/<name>.md` (legacy
//     `.kilocodemodes` is deprecated; we don't emit it).
//   - `mode: primary` — every TestAtlas command is user-selectable from
//     KiloCode's agent picker.
//   - The `permission` block is the load-bearing safety contract: it locks
//     edits in the workspace tree (_testatlas/**) but DENIES edits in the
//     suite tree (.testatlas/**), enforcing TestAtlas's two-tree invariant
//     even when the user inadvertently asks the agent to mutate the suite.
//   - permission.bash flips `allow`/`deny` based on the source command's
//     declared `shell` capability. Honest declaration: if the source doesn't
//     need shell, KiloCode shouldn't grant it.
//   - The shared serializeFrontmatter() emits only flat key:value/inline-array
//     pairs; the nested `permission.edit.<glob>: <verb>` shape is unique to
//     this renderer, so we hand-roll a deterministic nested emitter below.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, wrapInAdapterEnvelope } from './_shared.js';

/**
 * Strip the prior bootstrap-first preamble from a source body, if it begins
 * with one. Same contract as render-claude-code.js.
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
 * Emit the KiloCode YAML frontmatter block with the locked nested
 * `permission` shape. Key order is fixed for determinism: description →
 * mode → permission (edit → bash). The `edit` map order is fixed:
 * "_testatlas/**" → ".testatlas/**" → "*". This order has semantic meaning
 * (workspace allow first, suite-tree deny second, catch-all last) and is
 * asserted by test/adapter-kilocode.test.js.
 *
 * @param {{ description: string, bash: 'allow' | 'deny' }} fm
 * @returns {string}
 */
function serializeKilocodeFrontmatter({ description, bash }) {
  return [
    '---',
    `description: ${description}`,
    'mode: primary',
    'permission:',
    '  edit:',
    '    "_testatlas/**": allow',
    '    ".testatlas/**": deny',
    '    "*": ask',
    `  bash: ${bash}`,
    '---',
    '',
  ].join('\n');
}

/**
 * Render a KiloCode adapter file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderKilocode({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const caps = Array.isArray(fm.capabilities) ? fm.capabilities : [];
  const bash = caps.includes('shell') ? 'allow' : 'deny';

  const targetFm = serializeKilocodeFrontmatter({ description, bash });

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
