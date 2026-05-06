// test/scripts/bin-testatlas-validate-autoheal-defaults.test.js
//
// Regression test for the v1.2.4 fix.
//
// Background (user-reported on 2026-05-06): users running `npx
// @webventures/testatlas validate --auto-heal` saw "Would apply (N)" in
// the report — meaning autoheal ran in preview mode despite v1.2.0's
// "Gap 1" default-flip from preview→apply. Root cause: the Gap-1 fix
// landed only in `scripts/validate-workspace.js`'s `runCli`, but the npx
// CLI dispatches via `bin/testatlas.js validate` → `validateWorkspace()`
// directly, bypassing `runCli` and therefore the default-flip.
//
// The v1.2.4 fix mirrors the default-flip into `bin/testatlas.js`'s
// validate action. This test file exercises the bin entry-point directly
// to ensure the flip stays applied there.
//
// Coverage:
//   1. `bin validate --auto-heal` (alone) → apply=true; report header
//      reads "Applied (N)" not "Would apply (N)".
//   2. `bin validate --auto-heal --dry-run` → apply=false; report reads
//      "Would apply (N)" + "Preview only" subtitle.
//   3. `bin validate --auto-heal --apply` → apply=true; stderr deprecation
//      note is emitted exactly once.
//   4. `bin validate --apply` (no --auto-heal) → apply=true is benign
//      no-op (no autoheal phase runs at all).
//   5. `bin validate --help` text mentions --auto-heal as the canonical
//      heal command and --dry-run as preview.

import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'testatlas.js');
const FIXTURE_SRC = path.join(REPO_ROOT, 'test', 'fixtures', 'workspaces', 'broken-count-mismatch');

async function makeFixture() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'bin-validate-'));
  await cp(FIXTURE_SRC, path.join(tmp, '_testatlas'), { recursive: true });
  await cp(path.join(REPO_ROOT, '.testatlas'), path.join(tmp, '.testatlas'), { recursive: true });
  return { cwd: tmp, cleanup: () => rm(tmp, { recursive: true, force: true }) };
}

async function runBin(args, cwd) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    const res = await execFile('node', [BIN, ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      // Don't inherit env — the test workspace is self-contained.
    });
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err) {
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    exitCode = typeof err.code === 'number' ? err.code : 1;
  }
  return { exitCode, stdout, stderr };
}

test('bin validate --help mentions --auto-heal as canonical heal + --dry-run for preview', async () => {
  const { stdout } = await runBin(['validate', '--help'], REPO_ROOT);
  assert.match(
    stdout,
    /--auto-heal[^\n]*Writes by default/i,
    'help must say --auto-heal writes by default',
  );
  assert.match(stdout, /--dry-run[^\n]*Preview/i, 'help must mention --dry-run as preview');
  assert.match(stdout, /--apply[^\n]*deprecated/i, 'help must mark --apply deprecated');
});

test('bin validate --auto-heal (bare) APPLIES heals — header reads "Applied", not "Would apply"', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);
  const { stdout } = await runBin(['validate', '--auto-heal'], fix.cwd);
  // The reporter header branches on apply: "Applied" when true, "Would apply"
  // when false. This is the canonical signal that the default-flip worked.
  assert.match(stdout, /^### Applied \(\d+\)/m, `expected "Applied (N)" header; got:\n${stdout}`);
  assert.doesNotMatch(
    stdout,
    /^### Would apply \(/m,
    'must NOT see "Would apply" — that was the v1.2.0–v1.2.3 bug',
  );
  assert.doesNotMatch(stdout, /Preview only — re-run/, 'preview-only subtitle must not appear');
});

test('bin validate --auto-heal --dry-run PREVIEWS — header reads "Would apply"', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);
  const { stdout } = await runBin(['validate', '--auto-heal', '--dry-run'], fix.cwd);
  assert.match(
    stdout,
    /^### Would apply \(\d+\)/m,
    'expected "Would apply (N)" header in dry-run mode',
  );
  assert.match(stdout, /Preview only — re-run/, 'preview-only subtitle must appear');
});

test('bin validate --auto-heal --apply emits one-time stderr deprecation note', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);
  const { stderr } = await runBin(['validate', '--auto-heal', '--apply'], fix.cwd);
  assert.match(
    stderr,
    /--apply is now redundant when --auto-heal is set/,
    'expected deprecation note on stderr',
  );
  // Exactly once.
  const occurrences = stderr.split(/--apply is now redundant when --auto-heal is set/).length - 1;
  assert.equal(occurrences, 1, `expected exactly 1 deprecation note; got ${occurrences}`);
});

test('bin validate --apply (no --auto-heal) does NOT emit deprecation note', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);
  const { stderr } = await runBin(['validate', '--apply'], fix.cwd);
  assert.doesNotMatch(
    stderr,
    /--apply is now redundant/,
    'deprecation note must only fire when --auto-heal is also set',
  );
});
