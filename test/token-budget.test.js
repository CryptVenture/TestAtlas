// Tests for Phase 1 — BOOT-04 (token-budget gate).
// Covers: word-count helper correctness; check-token-budget.js exit codes
// and output; CI workflow integration; bootstrap.md ≤3000 words (when present).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countWords, firstNWords } from '../scripts/lib/word-count.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/check-token-budget.js');

// ---- countWords basics ----
test('countWords: empty string returns 0', () => {
  assert.equal(countWords(''), 0);
});

test('countWords: collapses tabs/newlines/multiple spaces', () => {
  assert.equal(countWords('  one   two\tthree\nfour '), 4);
});

test('countWords: filters empty splits from triple newlines', () => {
  assert.equal(countWords('one\n\n\ntwo'), 2);
});

test('countWords: treats Unicode whitespace as splitter (\\s+)', () => {
  assert.equal(countWords('hello world'), 2);
});

// ---- firstNWords basics ----
test('firstNWords: returns first n tokens joined by single space', () => {
  assert.equal(firstNWords('one two three four five', 3), 'one two three');
});

test('firstNWords: returns full text when n exceeds available', () => {
  assert.equal(firstNWords('one two', 5), 'one two');
});

// ---- check-token-budget.js: pass case ----
test('check-token-budget.js: exits 0 with OK on a file under budget', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-pass-'));
  const fixture = path.join(dir, 'small.md');
  await writeFile(fixture, 'one two three four five\n', 'utf8');

  const res = spawnSync('node', [scriptPath, fixture, '10'], { encoding: 'utf8' });
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr: ${res.stderr}`);
  assert.match(res.stdout, /OK:/);
  assert.match(res.stdout, /5 words/);
});

// ---- check-token-budget.js: fail case ----
test('check-token-budget.js: exits 1 with FAIL on a file over budget', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-fail-'));
  const fixture = path.join(dir, 'big.md');
  // 50 words; budget will be 10; overage = 40.
  await writeFile(fixture, `${'word '.repeat(50).trim()}\n`, 'utf8');

  const res = spawnSync('node', [scriptPath, fixture, '10'], { encoding: 'utf8' });
  assert.equal(res.status, 1, `expected exit 1, got ${res.status}; stdout: ${res.stdout}`);
  assert.match(res.stderr, /FAIL:/);
  assert.match(res.stderr, /50 words/);
  assert.match(res.stderr, /by 40/);
});

// ---- check-token-budget.js: argv guard ----
test('check-token-budget.js: exits 2 on missing arguments', () => {
  const res = spawnSync('node', [scriptPath], { encoding: 'utf8' });
  assert.equal(res.status, 2, `expected exit 2, got ${res.status}`);
  assert.match(res.stderr, /usage:/i);
});

test('check-token-budget.js: exits 2 on non-numeric maxWords', () => {
  const res = spawnSync('node', [scriptPath, 'README.md', 'banana'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /invalid maxWords|invalid max/i);
});

// ---- bootstrap.md ≤ 3000 words (only meaningful once 01-02 lands) ----
test('check-token-budget.js: bootstrap.md is under the 3000-word budget', async () => {
  const bootstrap = path.join(repoRoot, '.testatlas/bootstrap.md');
  try {
    await access(bootstrap);
  } catch {
    // Plan 01-02 has not yet authored bootstrap.md. Skip until it lands.
    // (node:test does not have t.skip semantics; emit a clear pass-with-note.)
    console.warn('skip: .testatlas/bootstrap.md not yet present (Plan 01-02 owns it)');
    return;
  }
  const res = spawnSync('node', [scriptPath, bootstrap, '3000'], { encoding: 'utf8' });
  assert.equal(res.status, 0, `bootstrap.md exceeds budget: ${res.stderr}`);
});

// ---- CI workflow integration ----
test('CI workflow ci.yml has a token-budget job that runs the script with 3000', async () => {
  const yml = await readFile(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  // Job header.
  assert.match(yml, /^\s*token-budget:\s*$/m, 'ci.yml must declare a `token-budget:` job');
  // Runner.
  assert.match(yml, /runs-on:\s*ubuntu-latest/, 'token-budget job should run on ubuntu-latest');
  // Script invocation with file + budget.
  assert.match(
    yml,
    /node\s+scripts\/check-token-budget\.js\s+\.testatlas\/bootstrap\.md\s+3000/,
    'ci.yml must invoke check-token-budget.js with `.testatlas/bootstrap.md 3000`',
  );
});
