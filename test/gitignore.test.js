// Tests for Phase 0 .gitignore.
// Covers gap: gov-07-gitignore.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('.gitignore ignores node_modules, _testatlas/, .testatlas.backup-*, and .planning/', async () => {
  const gitignore = await readFile(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.ok(gitignore.length > 0, '.gitignore should not be empty');

  // node_modules — Node dep tree.
  assert.match(gitignore, /(?:^|\n)node_modules\/?/m, '.gitignore must ignore node_modules');

  // _testatlas/ — runtime workspace; must never end up inside the suite repo.
  assert.match(gitignore, /(?:^|\n)_testatlas\/?/m, '.gitignore must ignore _testatlas/');

  // .testatlas.backup-* — update backup directories.
  assert.match(
    gitignore,
    /(?:^|\n)\.testatlas\.backup-\*\/?/m,
    '.gitignore must ignore .testatlas.backup-*',
  );

  // .planning/ — OBD planning artifacts.
  assert.match(gitignore, /(?:^|\n)\.planning\/?/m, '.gitignore must ignore .planning/');
});
