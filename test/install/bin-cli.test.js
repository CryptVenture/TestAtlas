// test/install/bin-cli.test.js
//
// Plan 07-01 Task 2 — bin/testatlas.js commander v14 CLI tests.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'testatlas.js');
const INSTALL_JS = path.join(REPO_ROOT, 'install.js');

/**
 * Run a node CLI script, capturing stdout, stderr, and exit code.
 * @param {string[]} args
 */
function runNode(scriptPath, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-bincli-'));
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

test('bin-cli: --version prints package.json version (0.1.0-pre)', async () => {
  const r = await runNode(BIN, ['--version']);
  assert.equal(r.code, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+(-[\w.-]+)?$/);
  // Currently 0.1.0-pre per Plan 07-01.
  assert.equal(r.stdout.trim(), '0.1.0-pre');
});

test('bin-cli: --help lists subcommands init/update/uninstall', async () => {
  const r = await runNode(BIN, ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /\binit\b/);
  assert.match(r.stdout, /\bupdate\b/);
  assert.match(r.stdout, /\buninstall\b/);
});

test('bin-cli: init --help shows the locked option set', async () => {
  const r = await runNode(BIN, ['init', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--all-adapters/);
  assert.match(r.stdout, /--force/);
  assert.match(r.stdout, /--no-update-check/);
  assert.match(r.stdout, /--target <dir>/);
  assert.match(r.stdout, /--dry-run/);
});

test('bin-cli: init --target <tmp> --dry-run does not write', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--target', dir, '--dry-run']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /dry-run/i);
    // No .testatlas/ written.
    await assert.rejects(
      () => stat(path.join(dir, '.testatlas')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('bin-cli: init --target <tmp> writes the suite tree + manifest, exits 0', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--target', dir]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    await stat(path.join(dir, '.testatlas', 'bootstrap.md'));
    await stat(path.join(dir, '.testatlas', '.install-manifest.json'));
  });
});

test('bin-cli: update --help lists --target/--force-reinstall/--dry-run/--no-update-check', async () => {
  const r = await runNode(BIN, ['update', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--target/);
  assert.match(r.stdout, /--force-reinstall/);
  assert.match(r.stdout, /--dry-run/);
  assert.match(r.stdout, /--no-update-check/);
});

test('bin-cli: update against unchanged target reports up-to-date', async () => {
  // No --latest-version → kernel infers latest=current → "already up to date".
  // We don't pass --target so it falls back to cwd; that's fine since the
  // up-to-date short-circuit returns BEFORE any disk mutation.
  const r = await runNode(BIN, ['update']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /up to date/i);
});

test('bin-cli: uninstall --help lists --target/--purge/--force-untracked/--dry-run', async () => {
  const r = await runNode(BIN, ['uninstall', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--target/);
  assert.match(r.stdout, /--purge/);
  assert.match(r.stdout, /--force-untracked/);
  assert.match(r.stdout, /--dry-run/);
});

test('bin-cli: uninstall against missing manifest exits non-zero', async (t) => {
  // No init was run on this tmp; manifest is absent.
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['uninstall', '--target', dir]);
    // Without --force-untracked, refuses (non-zero).
    assert.notEqual(r.code, 0, `expected non-zero on missing manifest; stderr=${r.stderr}`);
    assert.match(`${r.stdout}\n${r.stderr}`, /Manifest missing or invalid|--force-untracked/i);
  });
});

test('install.js (git-clone path): node install.js <tmp> writes the suite tree', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(INSTALL_JS, [dir]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    await stat(path.join(dir, '.testatlas', 'bootstrap.md'));
    await stat(path.join(dir, '.testatlas', '.install-manifest.json'));
  });
});

test('install.js: --dry-run produces no writes', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(INSTALL_JS, [dir, '--dry-run']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    await assert.rejects(
      () => stat(path.join(dir, '.testatlas')),
      (err) => err.code === 'ENOENT',
    );
  });
});
