// test/scripts/assemble-adapter-help.test.js
//
// Plan 12-04 Task 1 (RED). Regression test for ISSUE-022:
// `node scripts/assemble-adapter.js --help` MUST exit 0 with usage output
// without throwing a TDZ ReferenceError.

import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'assemble-adapter.js');

test('assemble-adapter.js --help exits 0 without TDZ', async () => {
  let exitCode = 0;
  let stdout = '';
  let stderr = '';
  try {
    const r = await execFile(process.execPath, [SCRIPT, '--help'], { timeout: 10000 });
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (err) {
    exitCode = typeof err.code === 'number' ? err.code : 1;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }
  assert.equal(exitCode, 0, `expected exit 0; stderr: ${stderr}`);
  assert.ok(stdout.length > 0, 'stdout must be non-empty');
  assert.ok(stdout.includes('Usage:'), `stdout must include "Usage:"; stdout: ${stdout}`);
  assert.ok(
    !stderr.includes('ReferenceError'),
    `stderr must not include ReferenceError; stderr: ${stderr}`,
  );
  assert.ok(
    !stderr.includes('before initialization'),
    `stderr must not include TDZ message; stderr: ${stderr}`,
  );
});

test('assemble-adapter.js -h short flag works', async () => {
  let exitCode = 0;
  let stdout = '';
  try {
    const r = await execFile(process.execPath, [SCRIPT, '-h'], { timeout: 10000 });
    stdout = r.stdout;
  } catch (err) {
    exitCode = typeof err.code === 'number' ? err.code : 1;
    stdout = err.stdout ?? '';
  }
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('Usage:'));
});
