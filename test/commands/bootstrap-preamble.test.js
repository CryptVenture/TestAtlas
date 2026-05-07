// test/commands/bootstrap-preamble.test.js
//
// Plan 14-02 Task 3 — every V2 core command file under
// `.testatlas/commands/core/` MUST:
//   1. Start with the bootstrap-first preamble (cite .testatlas/bootstrap.md)
//   2. Declare required capabilities in YAML frontmatter
//   3. Stay ≤1500 words
//   4. Document post-operation brain update requirements
//
// This test enumerates the directory directly (V1 listCommandFiles is flat
// and excludes subdirs).

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { countWords } from '../../scripts/lib/word-count.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CORE_DIR = path.join(REPO_ROOT, '.testatlas', 'commands', 'core');

async function dirExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listCoreCommands() {
  if (!(await dirExists(CORE_DIR))) return [];
  const entries = await readdir(CORE_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => path.join(CORE_DIR, e.name))
    .sort();
}

const EXPECTED_COMMANDS = new Set([
  'status.md',
  'bootstrap-refresh.md',
  'brain-sync.md',
  'brain-validate.md',
  'brain-query.md',
  'brain-compact.md',
  'brain-export.md',
  'init.md',
]);

test('Test 0: all 8 V2 core commands exist', async () => {
  const files = await listCoreCommands();
  const present = new Set(files.map((f) => path.basename(f)));
  const missing = [...EXPECTED_COMMANDS].filter((c) => !present.has(c));
  assert.deepEqual(missing, [], `missing core commands: ${missing.join(', ')}`);
});

test('Test 1: every V2 core command embeds the bootstrap-first preamble', async () => {
  const files = await listCoreCommands();
  if (files.length === 0) return;
  const failures = [];
  const REQUIRED = [
    'Before doing anything else:',
    '.testatlas/bootstrap.md',
    'If there is a conflict:',
  ];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    for (const phrase of REQUIRED) {
      if (!text.includes(phrase)) failures.push(`${path.basename(f)}: missing "${phrase}"`);
    }
  }
  assert.deepEqual(failures, []);
});

test('Test 2: every V2 core command declares capabilities in frontmatter', async () => {
  const files = await listCoreCommands();
  if (files.length === 0) return;
  const failures = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    if (!text.startsWith('---\n')) {
      failures.push(`${path.basename(f)}: missing frontmatter`);
      continue;
    }
    const end = text.indexOf('\n---', 4);
    const fm = end > 0 ? text.slice(4, end) : '';
    if (!/capabilities:\s*\[/.test(fm) && !/^capabilities:\s*$/m.test(fm)) {
      failures.push(`${path.basename(f)}: frontmatter missing capabilities: declaration`);
    }
  }
  assert.deepEqual(failures, []);
});

test('Test 3: every V2 core command stays ≤1500 words', async () => {
  const files = await listCoreCommands();
  if (files.length === 0) return;
  const failures = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    const n = countWords(text);
    if (n > 1500) failures.push(`${path.basename(f)}: ${n} words > 1500`);
  }
  assert.deepEqual(failures, []);
});

test('Test 4: every V2 core command documents post-operation brain update', async () => {
  const files = await listCoreCommands();
  if (files.length === 0) return;
  const failures = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    if (!/brain[-\s]update|update-brain-after-command|append-event|post-operation/i.test(text)) {
      failures.push(`${path.basename(f)}: missing post-operation brain update documentation`);
    }
  }
  assert.deepEqual(failures, []);
});
