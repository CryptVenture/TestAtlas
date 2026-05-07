// test/commands/maintain-validate-artifacts.test.js
//
// Plan 14-07 Task 2 — maintain-validate-artifacts.md runs comprehensive
// artifact validation beyond validate-workspace.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(
  REPO_ROOT,
  '.testatlas',
  'commands',
  'maintain',
  'maintain-validate-artifacts.md',
);

test('maintain-validate-artifacts.md exists with bootstrap-first preamble', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /^---\n/);
  assert.match(text, /^command: maintain-validate-artifacts$/m);
  assert.match(text, /Before doing anything else:/);
  assert.match(text, /Read `\.testatlas\/bootstrap\.md`\./);
});

test('maintain-validate-artifacts.md cites brain JSON consistency', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /brain.{0,30}(JSON|consistency|validation)/i);
});

test('maintain-validate-artifacts.md cites schema compliance', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /schema.{0,40}compl|schema.{0,40}valid/i);
});

test('maintain-validate-artifacts.md cites orphaned evidence and dangling references', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /orphan/i);
  assert.match(text, /dangling|broken (ref|link)|missing reference/i);
});

test('maintain-validate-artifacts.md cites markdown/JSON sync status', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /markdown.{0,20}JSON|JSON.{0,20}markdown|sync/i);
});

test('maintain-validate-artifacts.md word count ≤1800', async () => {
  const text = await readFile(FILE, 'utf8');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 1800, `maintain-validate-artifacts.md words=${words} > 1800 budget`);
});
