// test/commands/lifecycle-grep.test.js
//
// CMD-05: every command file's prose mentions all 5 lifecycle file names
// verbatim. Empty-dir tolerant.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { LIFECYCLE_FILES, listCommandFiles } from '../../scripts/lib/list-command-files.js';

test('CMD-05: every command mentions all 5 lifecycle files verbatim', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const lf of LIFECYCLE_FILES) {
      if (!text.includes(lf)) {
        failures.push(`${path.basename(file)}: missing "${lf}"`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
