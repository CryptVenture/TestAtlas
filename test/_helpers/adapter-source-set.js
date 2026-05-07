// test/_helpers/adapter-source-set.js
//
// Phase 16 Plan 16-01: shared helper used by per-adapter shape tests
// (test/adapter-<name>.test.js). The 13 per-command-file adapters now render
// every source command (V1 flat + V2 categorized) FLAT at the adapter
// commands root with `commandBaseNameFromSource(sourcePath)` as the unique
// identifier. This module returns:
//   - `expectedFlatNames(ext)`: Set of expected flat-root filenames the
//     adapter must contain (e.g. `atlas-bootstrap.md`, `atlas-council-domain-review.md`)
//   - `flatNameToSource(ext)`: Map of `atlas-<flatName>.<ext>` →
//     { sourcePath, sourceRel } so per-adapter Test 3 can validate marker
//     source + hash without hand-coding the V1↔V2 mapping.
//
// Spec: prd/reports/v2-adapter-slash-command-discovery.md Option A.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { commandBaseNameFromSource } from '../../scripts/lib/adapters/_shared.js';
import {
  listCategorizedCommandFiles,
  listCommandFiles,
} from '../../scripts/lib/list-command-files.js';

/**
 * Build the (V1 + V2) source set the per-adapter shape tests must verify.
 *
 * @param {{ cwd: string, ext: string }} args
 *   `ext` is the adapter's per-command file extension (e.g. `.md`, `.mdc`,
 *   `.toml`, `.prompt.md`). The expected filename for each source is
 *   `atlas-${commandBaseNameFromSource(sourcePath)}${ext}`.
 * @returns {Promise<{
 *   total: number,
 *   expectedNames: Set<string>,
 *   flatNameToSource: Map<string, { sourcePath: string, sourceRel: string, sourceText: string }>,
 * }>}
 */
export async function buildAdapterSourceSet({ cwd, ext }) {
  const flat = await listCommandFiles({ cwd });
  const cat = await listCategorizedCommandFiles({ cwd });

  /** @type {{ sourcePath: string, sourceRel: string }[]} */
  const sources = [
    ...flat.map((sp) => ({
      sourcePath: sp,
      // V1 flat marker source: `commands/<name>.md`
      sourceRel: `commands/${path.basename(sp)}`,
    })),
    ...cat.map((c) => ({
      sourcePath: c.absPath,
      // V2 categorized marker source: `commands/<category>/<name>.md`
      sourceRel: `commands/${c.category}/${path.basename(c.absPath)}`,
    })),
  ];

  const expectedNames = new Set();
  /** @type {Map<string, { sourcePath: string, sourceRel: string, sourceText: string }>} */
  const flatNameToSource = new Map();

  for (const s of sources) {
    const flatName = `atlas-${commandBaseNameFromSource(s.sourcePath)}${ext}`;
    expectedNames.add(flatName);
    const sourceText = await readFile(s.sourcePath, 'utf8');
    flatNameToSource.set(flatName, {
      sourcePath: s.sourcePath,
      sourceRel: s.sourceRel,
      sourceText,
    });
  }

  return {
    total: sources.length,
    expectedNames,
    flatNameToSource,
  };
}
