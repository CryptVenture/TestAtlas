// test/release/org-placeholder.test.js
//
// Plan 08-05 Task 1 — `scripts/check-org-placeholder.js` greps the repo for
// the literal `<org>` placeholder. The GA release must not ship with any
// `<org>` in active code (excluded dirs: node_modules/.git/.planning/dist/build/
// coverage/.next/.expo).
//
// Tests:
//   1. running the script in this repo exits 0 (zero placeholders remain).
//   2. when a temp file under repo root contains `<org>`, the script exits
//      non-zero and lists the file. (We add then remove the temp file.)

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'check-org-placeholder.js');

function runChecker(extraEnv = {}) {
  return spawnSync('node', [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...extraEnv },
  });
}

test('check-org-placeholder.js: clean repo exits 0', () => {
  const r = runChecker();
  if (r.status !== 0) {
    console.error('stderr:', r.stderr);
    console.error('stdout:', r.stdout);
  }
  assert.equal(r.status, 0, 'check-org-placeholder.js found <org> placeholders in active code');
});

test('check-org-placeholder.js: detects an injected <org> in active code', async (t) => {
  // Write a temp file under repo root (not in excluded dirs) containing `<org>`.
  // Pick a path the checker WILL scan.
  const tmpDir = await mkdtemp(path.join(REPO_ROOT, '.tmp-org-test-'));
  const tmpFile = path.join(tmpDir, 'tainted.md');
  t.after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
  await writeFile(tmpFile, 'Some content with <org> in it.\n', 'utf8');

  const r = runChecker();
  assert.notEqual(r.status, 0, 'expected non-zero exit when <org> is present');
  assert.match(r.stdout + r.stderr, /<org>/, 'expected output to mention <org>');
});
