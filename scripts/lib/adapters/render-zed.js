// scripts/lib/adapters/render-zed.js
//
// Zed adapter renderer (concatenated-conventions strategy).
//
// Zed reads project rules from a `.rules` file at the repo root (no extension).
// The file is markdown despite the missing `.md` extension. Zed has no
// file-installable global rules path (the Rules Library is settings-managed
// via Zed's UI), so this adapter is project-local only.
//
// Output path: .rules  (project-local; no global)
//
// Output shape mirrors roo-code/aider exactly: BOOTSTRAP_PREAMBLE +
// orientation + 30 collapsed H2 sections (≤7 lines each, ≤200 lines total).
// Aggregate hash is the SHA-256/16hex of the concatenation of all 30
// source-file hashes.

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
 * Render the single concatenated `.rules` file for Zed.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps?: string[],
 * }} opts
 * @returns {{ rules: string }}
 */
export function renderZed({ sources, adapterCaps = [] }) {
  const sorted = [...sources].sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );

  const perSourceHashes = sorted.map((s) => hashContent(s.sourceText));
  const aggregateHash = hashContent(perSourceHashes.join(''));

  const orientation =
    'TestAtlas conventions for Zed. Bootstrap rules in `.testatlas/bootstrap.md` win on conflict. ' +
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
        `render-zed: section for "atlas-${command}" is ${section.length} lines, max ${MAX_LINES_PER_SECTION}. ` +
          'Trim the source description (collapse to one short sentence) or refactor.',
      );
    }
    const overlong = section.find((line) => line.length > MAX_LINE_LENGTH);
    if (overlong !== undefined) {
      throw new Error(
        `render-zed: section for "atlas-${command}" has a line exceeding the ${MAX_LINE_LENGTH}-char ` +
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
      `render-zed: aggregate hash invariant violated (expected ${aggregateHash} in marker)`,
    );
  }

  return { rules };
}
