// test/commands/command-files.test.js
//
// CMD-01 + CMD-02: structural per-command tests. Empty-dir tolerant — passes
// vacuously today (Wave-0); flips RED→GREEN as Plans 03-02/03-03 author the
// 9 dogfood-loop command files.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const REQUIRED_H2 = [
  '## Required First Reads',
  '## Required Actions',
  '## Outputs',
  '## Lifecycle',
  '## Stop Conditions',
];

test('CMD-01: every command file has H1 matching its filename', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const name = path.basename(file, '.md');
    const expected = `# TestAtlas Command: ${name}`;
    if (!text.includes(expected)) {
      failures.push(`${file}: missing H1 "${expected}"`);
    }
  }
  assert.deepEqual(failures, []);
});

test('CMD-02: every command file has the 5 required H2 sections', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const h2 of REQUIRED_H2) {
      if (!text.includes(h2)) {
        failures.push(`${path.basename(file)}: missing "${h2}"`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
