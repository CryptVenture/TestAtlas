// test/commands/test-critical-flows.test.js
//
// Plan 14-07 Task 2 — test-critical-flows.md identifies highest-value flows
// based on product risk, executes them, and produces a RUN-<timestamp> report.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'test', 'test-critical-flows.md');

test('test-critical-flows.md exists with bootstrap-first preamble', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /^---\n/);
  assert.match(text, /^command: test-critical-flows$/m);
  assert.match(text, /Before doing anything else:/);
  assert.match(text, /Read `\.testatlas\/bootstrap\.md`\./);
});

test('test-critical-flows.md cites the four risk-based prioritisation inputs', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /02_test_strategy\.md/, 'must cite 02_test_strategy.md');
  assert.match(text, /tests\/matrix\.json/, 'must cite tests/matrix.json');
  assert.match(text, /domain priority/i, 'must cite domain priority');
  assert.match(text, /issue severity/i, 'must cite issue severity');
});

test('test-critical-flows.md commits to producing RUN-<timestamp> report', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /RUN-<timestamp>|RUN-\{timestamp\}/);
});

test('test-critical-flows.md updates flow docs, evidence index, issues, and brain events', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /flow doc/i);
  assert.match(text, /evidence/i);
  assert.match(text, /issue/i);
  assert.match(text, /brain event|brain-after-command|update-brain/i);
});

test('test-critical-flows.md word count ≤1800', async () => {
  const text = await readFile(FILE, 'utf8');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 1800, `test-critical-flows.md words=${words} > 1800 budget`);
});
