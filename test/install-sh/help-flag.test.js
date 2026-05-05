// test/install-sh/help-flag.test.js
//
// Plan 12-04 Task 1 (RED). Regression tests for ISSUE-021:
// `install.sh --help` MUST short-circuit with usage output and zero side effects
// (no curl, no _testatlas/ creation in CWD).
//
// POSIX-only — install.sh is /bin/sh; skipped on win32.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFile = promisify(execFileCb);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const INSTALL_SH = path.join(REPO_ROOT, 'install.sh');
const isWindows = process.platform === 'win32';

async function run(args, opts = {}) {
  const env = { ...process.env, ...(opts.env ?? {}), PATH: process.env.PATH };
  try {
    const { stdout, stderr } = await execFile('/bin/sh', [INSTALL_SH, ...args], {
      env,
      cwd: opts.cwd,
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    return {
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

test('install.sh --help exits 0 with usage and no side effects', { skip: isWindows }, async () => {
  const r = await run(['--help']);
  assert.equal(r.exitCode, 0, `expected exit 0; got ${r.exitCode}\nstderr: ${r.stderr}`);
  assert.ok(r.stdout.includes('Usage:'), `stdout must contain "Usage:"\nstdout: ${r.stdout}`);
  assert.ok(
    r.stdout.includes('TESTATLAS_VERIFY_SIGNATURE'),
    'usage must document TESTATLAS_VERIFY_SIGNATURE env var',
  );
  // The installer's network logic must NOT have run.
  assert.ok(
    !/curl: \(/.test(r.stderr) && !/wget: /.test(r.stderr),
    `--help must not invoke curl/wget; stderr was: ${r.stderr}`,
  );
});

test('install.sh -h short flag works', { skip: isWindows }, async () => {
  const r = await run(['-h']);
  assert.equal(r.exitCode, 0, `expected exit 0; stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes('Usage:'), 'stdout must contain "Usage:"');
});

test(
  'install.sh --dry-run prints resolution AND has zero side effects',
  { skip: isWindows },
  async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'install-dryrun-'));
    try {
      const r = await run(['--dry-run'], { cwd: tmp });
      assert.equal(r.exitCode, 0, `expected exit 0; stderr: ${r.stderr}`);
      const has =
        r.stdout.includes('tarball=') || r.stdout.toLowerCase().includes('dry-run');
      assert.ok(
        has,
        `stdout must indicate dry-run resolution; stdout was: ${r.stdout}`,
      );
      // Side-effect-free assertion: no _testatlas/ created in tmp CWD
      let exists = false;
      try {
        await stat(path.join(tmp, '_testatlas'));
        exists = true;
      } catch {}
      assert.equal(exists, false, '<tmp>/_testatlas/ must NOT exist after --dry-run');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  },
);
