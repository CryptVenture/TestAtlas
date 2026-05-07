// scripts/lib/adapters/render-aider.js
//
// Plan 06-04 Task 2: Aider adapter renderer (concatenated-conventions strategy).
//
// Aider's prompt-injection model concatenates every loaded `read:` file into
// every request. Shipping 30 separate command files would 30× the prompt-cache
// invalidation surface and break Aider's chat economics. The shipped product is:
//   - SINGLE `CONVENTIONS.md` (≤200 lines, 30 H2 sections @ ≤7 lines each)
//   - Companion `.aider.conf.yml` snippet that user merges into their config
//
// Output shape of CONVENTIONS.md:
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/_aggregate" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <one-paragraph orientation>
//
//   ## /atlas-<command-1>
//
//   <≤5 lines of body>
//
//   ## /atlas-<command-2>
//   ...
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// Per-section line budget (HARD-FAIL on overage):
//   line 1 : `## /atlas-<command>`
//   line 2 : (blank)
//   line 3 : `<one-line description>. Read \`.testatlas/commands/<command>.md\` for full instructions.`
//   line 4 : `- Required capabilities: <list>.`
//   line 5 : `- DEGRADED: <missing-caps>; do NOT fabricate, mark findings confidence: needs-validation.`  (conditional)
//   line 6 : `- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.`
//   line 7 : (blank separator before next H2)
//
// The hash is the SHA-256/16hex of the concatenation of all 30 source-file
// hashes (in sorted order — same order as listCommandFiles). Any change to
// any source command bumps the aggregate hash, so the parity gate (and any
// downstream caching layer) detects drift on a single file mutation.
//
// Aider declares only [shell, file-write]. 13 of 30 source commands need
// capabilities Aider lacks (browser / MCP / web-fetch); those sections embed
// the condensed DEGRADED line. The full canonical degradation prose is
// shipped via .testatlas/bootstrap.md §4 (which Aider reads first per
// .aider.conf.yml's `read:` order) — the in-section line is a reference, not
// the full block, because the 7-line cap forbids it.
//
// Pitfall 5 (06-RESEARCH.md): the renderer hard-fails (throws) when any
// section's rendered line count exceeds 7. This is the build-time guardrail
// that prevents future command-source growth from silently breaking Aider's
// prompt-cache budget. The error message names the offending command + the
// observed line count so the fix is obvious.

import { hashContent } from '../content-hash.js';
import { parseFrontmatter } from '../parse-frontmatter.js';
import {
  BOOTSTRAP_PREAMBLE,
  commandBaseNameFromSource,
  sourceRelFromAbs,
  wrapInAdapterEnvelope,
} from './_shared.js';

const MAX_LINES_PER_SECTION = 7;
// Per-line length cap. Real source descriptions can run 200–300 chars; the
// degraded-capability sections add a `Required capabilities` clause that can
// push individual lines higher. 600 chars is generous enough for legitimate
// Aider content while still flagging pathological growth (a description
// rewritten as a multi-paragraph essay). Enforced alongside the line-count
// cap so the renderer hard-fails on either kind of overage.
const MAX_LINE_LENGTH = 600;

const LIFECYCLE_LINE =
  '- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.';

// V2-aware command name + sourceRel derivation moved to ./_shared.js
// (commandBaseNameFromSource, sourceRelFromAbs).

/**
 * Collapse horizontal whitespace in a description while preserving line
 * breaks. Multi-line descriptions stay multi-line (consuming budget); single
 * long lines stay one line. The per-section line cap ultimately decides
 * whether the description fits — see buildSection / MAX_LINES_PER_SECTION.
 *
 * @param {string} desc
 * @returns {string}
 */
function compressDescription(desc) {
  return String(desc)
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .trim();
}

/**
 * Build a single H2 section for one command. Returns the section as an array
 * of lines (no terminators); the caller joins on '\n' and verifies the line
 * count against MAX_LINES_PER_SECTION.
 *
 * @param {{
 *   command: string,
 *   description: string,
 *   commandCaps: string[],
 *   adapterCaps: string[],
 * }} args
 * @returns {string[]}
 */
function buildSection({ command, description, commandCaps, adapterCaps, sourceRel }) {
  const adapterSet = new Set(adapterCaps);
  const missing = commandCaps.filter((c) => !adapterSet.has(c));

  const desc = compressDescription(description);
  const capsList = commandCaps.length > 0 ? commandCaps.join(', ') : 'file-write';

  // sourceRel is the canonical path for the "read this file" pointer. For
  // V1 flat commands it's `.testatlas/commands/<base>.md`; for V2 categorized
  // it's `.testatlas/commands/<category>/<base>.md`.
  const lines = [
    `## /atlas-${command}`,
    '',
    `${desc} Read \`${sourceRel}\` for full instructions.`,
    `- Required capabilities: ${capsList}.`,
  ];
  if (missing.length > 0) {
    lines.push(
      `- DEGRADED: ${missing.join('/')} unavailable; Do NOT fabricate, mark findings confidence: needs-validation.`,
    );
  }
  lines.push(LIFECYCLE_LINE);
  // Trailing blank line — the separator before the next H2. Counted in the
  // per-section budget; this is intentional so the FILE preserves visual
  // section spacing while every section fits ≤7 lines including its trailer.
  lines.push('');
  return lines;
}

/**
 * Render the full CONVENTIONS.md + .aider.conf.yml pair.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps?: string[],
 * }} opts
 * @returns {{ conventions: string, conf: string }}
 */
export function renderAider({ sources, adapterCaps = [] }) {
  // Sort sources by full sourcePath for deterministic output that matches
  // listCommandFiles' default-string sort (which is the order the test, the
  // parity gate, and the assemble-adapter runner all use).
  const sorted = [...sources].sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );

  // Compute per-source hashes (used as the input to the aggregate hash and
  // exposed nowhere else — the aggregate hash is what the marker carries).
  const perSourceHashes = sorted.map((s) => hashContent(s.sourceText));
  const aggregateHash = hashContent(perSourceHashes.join(''));

  // Emit a one-paragraph orientation between BOOTSTRAP_PREAMBLE and the first H2.
  const orientation =
    'TestAtlas conventions for Aider. Bootstrap rules in `.testatlas/bootstrap.md` win on conflict. ' +
    'To run a command, read its source file at `.testatlas/commands/<command>.md` and follow it exactly.';

  // Build all sections; verify each fits the 7-line budget. Hard-fail on overage.
  /** @type {string[]} */
  const sectionLines = [];
  for (let i = 0; i < sorted.length; i++) {
    const src = sorted[i];
    const fm = parseFrontmatter(src.sourceText);
    const command = commandBaseNameFromSource(src.sourcePath);
    const description = fm.description ?? '';
    const commandCaps = Array.isArray(fm.capabilities) ? fm.capabilities : [];

    const sourceRel = sourceRelFromAbs(src.sourcePath);
    const section = buildSection({ command, description, commandCaps, adapterCaps, sourceRel });
    if (section.length > MAX_LINES_PER_SECTION) {
      throw new Error(
        `render-aider: section for "atlas-${command}" is ${section.length} lines, max ${MAX_LINES_PER_SECTION}. ` +
          'Trim the source description (collapse to one short sentence) or refactor.',
      );
    }
    const overlong = section.find((line) => line.length > MAX_LINE_LENGTH);
    if (overlong !== undefined) {
      throw new Error(
        `render-aider: section for "atlas-${command}" has a line exceeding the ${MAX_LINE_LENGTH}-char ` +
          `cap (got ${overlong.length} chars); trim the description. Offending line begins: "${overlong.slice(0, 80)}…"`,
      );
    }
    sectionLines.push(...section);
  }

  // Drop trailing blank line so the closing END marker hugs the last section.
  while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1] === '') {
    sectionLines.pop();
  }

  // Body inside envelope: BOOTSTRAP_PREAMBLE → blank → orientation → blank → sections.
  const envelopeBody = [BOOTSTRAP_PREAMBLE, '', orientation, '', ...sectionLines].join('\n');

  // wrapInAdapterEnvelope hashes the sourceText we pass; we want the AGGREGATE
  // hash, so we synthesize a sourceText whose hashContent equals our aggregate.
  // The simplest way: pass a sourceText whose canonical form hashes to our
  // aggregate. Since hashContent(perSourceHashes.join('')) === aggregateHash,
  // we just pass perSourceHashes.join('') as the sourceText input.
  const aggregateSourceText = perSourceHashes.join('');
  const conventions = wrapInAdapterEnvelope({
    sourcePath: '.testatlas/commands/_aggregate',
    sourceText: aggregateSourceText,
    body: envelopeBody,
  });

  // Verify the marker hash matches what we expect (defensive — catches
  // accidental drift between hashContent's contract and our reconstruction).
  if (!conventions.includes(`hash="${aggregateHash}"`)) {
    throw new Error(
      `render-aider: aggregate hash invariant violated (expected ${aggregateHash} in marker)`,
    );
  }

  const conf = [
    '# TestAtlas Aider integration — merge this into your .aider.conf.yml.',
    'read:',
    '  - .testatlas/bootstrap.md',
    '  - CONVENTIONS.md',
    '',
  ].join('\n');

  return { conventions, conf };
}
