// test/commands/adapter-flat-discovery.test.js
//
// Phase 16 Plan 16-01 Task 1 (RED gate): the discovery gate that was missing
// in Phase 14 Wave 5. For every per-command-file adapter, asserts:
//
//   A) zero subdirectories under the adapter's commands root (flatness invariant)
//   B) the flat-root file set matches the union of every source command rendered
//      via `commandBaseNameFromSource(sourcePath)`
//
// Per `prd/reports/v2-adapter-slash-command-discovery.md` §"Testing Strategy"
// (the verbatim source for this test). The PER_COMMAND_FILE_ADAPTERS list is
// derived programmatically from `adapter-capabilities.json` so a 14th
// per-command-file adapter would automatically be checked.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { commandBaseNameFromSource } from '../../scripts/lib/adapters/_shared.js';
import {
  listCategorizedCommandFiles,
  listCommandFiles,
} from '../../scripts/lib/list-command-files.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

/**
 * Resolve the per-adapter commands-root directory (relative to the adapter's
 * outputDir) from `adapter-capabilities.json`. For per-command-file adapters
 * the outputPattern includes `{command}` and the leading directory portion of
 * that pattern is the commands root. We also pull the file extension from the
 * pattern's tail so the new test stays in lockstep with the JSON when the
 * pattern (e.g. `.prompt.md` vs `.md`) changes.
 *
 * @param {{ outputPattern: string }} adapter
 * @returns {{ commandsDirRel: string, ext: string }}
 */
function resolvePerAdapterShape(adapter) {
  const pattern = adapter.outputPattern;
  // Pattern like ".claude/commands/atlas-{command}.md" or "prompts/atlas-{command}.md".
  const idx = pattern.indexOf('{command}');
  if (idx === -1) {
    throw new Error(`adapter ${adapter.name}: outputPattern lacks {command}: ${pattern}`);
  }
  const commandsDirRel = path.dirname(pattern.slice(0, idx));
  const ext = pattern.slice(idx + '{command}'.length);
  return { commandsDirRel, ext };
}

const capsPath = path.join(repoRoot, '.testatlas', 'adapters', 'adapter-capabilities.json');
const capsRaw = await readFile(capsPath, 'utf8');
const caps = JSON.parse(capsRaw);
const PER_COMMAND_FILE_ADAPTERS = caps.adapters
  .filter((a) => a.renderStrategy === 'per-command-file')
  .map((a) => {
    const { commandsDirRel, ext } = resolvePerAdapterShape(a);
    return {
      name: a.name,
      commandsDir: path.join(a.outputDir, commandsDirRel),
      ext,
    };
  });

assert.ok(
  PER_COMMAND_FILE_ADAPTERS.length >= 13,
  `expected ≥13 per-command-file adapters; got ${PER_COMMAND_FILE_ADAPTERS.length}`,
);

for (const adapter of PER_COMMAND_FILE_ADAPTERS) {
  test(`Flat discovery: ${adapter.name} has zero subdirectories under commands root`, async () => {
    const dir = path.join(repoRoot, adapter.commandsDir);
    const entries = await readdir(dir, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    assert.deepEqual(
      subdirs,
      [],
      `${adapter.name}: expected zero subdirs at ${dir}, got [${subdirs.join(', ')}]`,
    );
  });

  test(`Flat discovery: ${adapter.name} contains every source command at flat root`, async () => {
    const flat = await listCommandFiles({ cwd: repoRoot });
    const cat = await listCategorizedCommandFiles({ cwd: repoRoot });
    const expectedNames = new Set([
      ...flat.map((p) => `atlas-${commandBaseNameFromSource(p)}${adapter.ext}`),
      ...cat.map((c) => `atlas-${commandBaseNameFromSource(c.absPath)}${adapter.ext}`),
    ]);
    const dir = path.join(repoRoot, adapter.commandsDir);
    const entries = await readdir(dir, { withFileTypes: true });
    const filenames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    assert.deepEqual(
      [...filenames].sort(),
      [...expectedNames].sort(),
      `${adapter.name}: flat-root file set must match expected ${expectedNames.size} commands`,
    );
  });
}
