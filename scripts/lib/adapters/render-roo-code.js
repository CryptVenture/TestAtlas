// scripts/lib/adapters/render-roo-code.js
//
// Roo Code adapter renderer (concatenated-conventions strategy).
//
// Roo Code concatenates all `.roo/rules/*.md` files into the system prompt
// alphabetically. Shipping 30 separate files would invalidate the prompt-
// cache on every source-command edit; we ship a SINGLE `atlas.md` that
// lists all 30 atlas commands in collapsed form (one short H2 each,
// ≤7 lines body — same shape as Aider's CONVENTIONS.md).
//
// Output path: .roo/rules/atlas.md  (project-local + global)
//
// Output shape:
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/_aggregate" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <one-paragraph orientation>
//
//   ## /atlas-<command-1>
//   ...
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// Per-section line budget HARD-FAIL caps mirror render-aider.js exactly
// (≤7 lines per section, ≤600 chars per line). Aggregate hash is the
// SHA-256/16hex of the concatenation of all 30 source-file hashes.

import { hashContent } from '../content-hash.js';
import { parseFrontmatter } from '../parse-frontmatter.js';
import {
  BOOTSTRAP_PREAMBLE,
  commandBaseNameFromSource,
  sourceRelFromAbs,
  wrapInAdapterEnvelope,
} from './_shared.js';

const MAX_LINES_PER_SECTION = 7;
const MAX_LINE_LENGTH = 600;

const LIFECYCLE_LINE =
  '- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.';

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
 */
function buildSection({ command, description, commandCaps, adapterCaps, sourceRel }) {
  const adapterSet = new Set(adapterCaps);
  const missing = commandCaps.filter((c) => !adapterSet.has(c));

  const desc = compressDescription(description);
  const capsList = commandCaps.length > 0 ? commandCaps.join(', ') : 'file-write';

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
  lines.push('');
  return lines;
}

/**
 * Render the single concatenated atlas.md file for Roo Code.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps?: string[],
 * }} opts
 * @returns {{ rules: string }}
 */
export function renderRooCode({ sources, adapterCaps = [] }) {
  const sorted = [...sources].sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );

  const perSourceHashes = sorted.map((s) => hashContent(s.sourceText));
  const aggregateHash = hashContent(perSourceHashes.join(''));

  const orientation =
    'TestAtlas conventions for Roo Code. Bootstrap rules in `.testatlas/bootstrap.md` win on conflict. ' +
    'To run a command, read its source file at `.testatlas/commands/<command>.md` and follow it exactly.';

  const sectionLines = [];
  for (const src of sorted) {
    const fm = parseFrontmatter(src.sourceText);
    const command = commandBaseNameFromSource(src.sourcePath);
    const description = fm.description ?? '';
    const commandCaps = Array.isArray(fm.capabilities) ? fm.capabilities : [];
    const sourceRel = sourceRelFromAbs(src.sourcePath);

    const section = buildSection({ command, description, commandCaps, adapterCaps, sourceRel });
    if (section.length > MAX_LINES_PER_SECTION) {
      throw new Error(
        `render-roo-code: section for "atlas-${command}" is ${section.length} lines, max ${MAX_LINES_PER_SECTION}. ` +
          'Trim the source description (collapse to one short sentence) or refactor.',
      );
    }
    const overlong = section.find((line) => line.length > MAX_LINE_LENGTH);
    if (overlong !== undefined) {
      throw new Error(
        `render-roo-code: section for "atlas-${command}" has a line exceeding the ${MAX_LINE_LENGTH}-char ` +
          `cap (got ${overlong.length} chars); trim the description. Offending line begins: "${overlong.slice(0, 80)}…"`,
      );
    }
    sectionLines.push(...section);
  }

  while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1] === '') {
    sectionLines.pop();
  }

  const envelopeBody = [BOOTSTRAP_PREAMBLE, '', orientation, '', ...sectionLines].join('\n');

  const aggregateSourceText = perSourceHashes.join('');
  const rules = wrapInAdapterEnvelope({
    sourcePath: '.testatlas/commands/_aggregate',
    sourceText: aggregateSourceText,
    body: envelopeBody,
  });

  if (!rules.includes(`hash="${aggregateHash}"`)) {
    throw new Error(
      `render-roo-code: aggregate hash invariant violated (expected ${aggregateHash} in marker)`,
    );
  }

  return { rules };
}
