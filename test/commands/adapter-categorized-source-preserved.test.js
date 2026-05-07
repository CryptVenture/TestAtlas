// test/commands/adapter-categorized-source-preserved.test.js
//
// Phase 16 Plan 16-01 Task 1: source-of-truth invariant. The categorized
// source layout at `.testatlas/commands/<category>/` MUST stay byte-for-byte
// during the flatten-at-render fix. Per `prd/reports/v2-adapter-slash-command
// -discovery.md` §"Backward Compatibility" — the categorized source is
// preserved for organizational clarity; only adapter-render flattens.

import { strict as assert } from 'node:assert';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { V2_COMMAND_CATEGORIES } from '../../scripts/lib/list-command-files.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

// V2 categories that are populated as of Phase 16. The remaining categories
// (`test`, `report`, `maintain`, `brain`) carry small or evolving sets, so we
// only require non-emptiness on the always-populated ones plus assert the
// directory itself exists for every category.
const POPULATED_CATEGORIES = ['core', 'explore', 'council', 'brain', 'maintain', 'report', 'test'];

for (const cat of V2_COMMAND_CATEGORIES) {
  test(`Source preserved: .testatlas/commands/${cat}/ exists`, async () => {
    const dir = path.join(repoRoot, '.testatlas', 'commands', cat);
    // readdir throws ENOENT if the directory was moved/deleted — the source
    // layout invariant. Calling readdir is the assertion.
    await readdir(dir);
  });
}

test('Source preserved: populated V2 categories contain at least one .md (excluding README.md)', async () => {
  for (const cat of POPULATED_CATEGORIES) {
    const dir = path.join(repoRoot, '.testatlas', 'commands', cat);
    const entries = await readdir(dir, { withFileTypes: true });
    const mdFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md',
    );
    assert.ok(
      mdFiles.length > 0,
      `source category ${cat}/ must contain at least one .md file (excluding README.md); got ${mdFiles.length}`,
    );
  }
});
