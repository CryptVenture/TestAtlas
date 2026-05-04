// test/commands/preamble.test.js
//
// CMD-02: every command file embeds the PRD §38 verbatim preamble.
// Empty-dir tolerant.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const PREAMBLE_OPENERS = ['Before doing anything else:', 'If there is a conflict:'];

test('CMD-02: every command embeds the §38 verbatim preamble openers', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const opener of PREAMBLE_OPENERS) {
      if (!text.includes(opener)) {
        failures.push(`${path.basename(file)}: missing "${opener}"`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('CMD-02: every command preamble cites bootstrap.md path', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (!text.includes('.testatlas/bootstrap.md')) {
      failures.push(`${path.basename(file)}: must cite .testatlas/bootstrap.md`);
    }
  }
  assert.deepEqual(failures, []);
});
