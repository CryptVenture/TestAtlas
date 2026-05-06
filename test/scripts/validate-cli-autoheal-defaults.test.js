// test/scripts/validate-cli-autoheal-defaults.test.js
//
// Quick task quick-260506-nj2 (GAP 1). CLI-layer regression for the
// --auto-heal default-apply flip:
//   - `--help` text reflects new --auto-heal/--dry-run/--apply wording.
//   - `--auto-heal --apply` (user-explicit) emits the one-line deprecation note.
//   - `--auto-heal --dry-run` does NOT emit the deprecation note.
//   - `--apply` alone (without --auto-heal) is a silent no-op.
//
// We spawn the CLI as a subprocess and assert on stdout/stderr text. Exit
// codes are not asserted for the workspace-running scenarios (the fixture
// workspace may flag findings — what matters is the deprecation banner is or
// is not printed BEFORE the validation run begins).

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
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-workspace.js');
const FIXTURE_SRC = path.join(REPO_ROOT, 'test', 'fixtures', 'workspaces', '_base-good');

/**
 * Build a minimal cwd fixture: a temp dir containing both `_testatlas/`
 * (copy of `_base-good`) and `.testatlas/` (suite tree) so config + schema
 * loaders resolve. Mirrors `makeValidationFixture` in test/_helpers.js.
 */
async function makeFixture() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'cli-nj2-'));
  await cp(FIXTURE_SRC, path.join(tmp, '_testatlas'), { recursive: true });
  await cp(path.join(REPO_ROOT, '.testatlas'), path.join(tmp, '.testatlas'), { recursive: true });
  return {
    cwd: tmp,
    cleanup: () => rm(tmp, { recursive: true, force: true }),
  };
}

/**
 * Run the CLI and capture {exitCode, stdout, stderr} regardless of exit code.
 * Important: the workspace may legitimately fail validation — that's not what
 * we're testing here.
 */
async function runCli(args, env) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    const r = await execFile(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, ...(env ?? {}) },
      timeout: 30000,
    });
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (err) {
    exitCode = typeof err.code === 'number' ? err.code : 1;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }
  return { exitCode, stdout, stderr };
}

test('--help reflects new --auto-heal / --dry-run / --apply wording', async () => {
  const r = await runCli(['--help']);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /Writes by default/);
  assert.match(r.stdout, /Preview mode/);
  assert.match(r.stdout, /\(deprecated:/);
});

test('--auto-heal --apply emits the one-line deprecation note on stderr', async (t) => {
  const fx = await makeFixture();
  t.after(fx.cleanup);
  const r = await runCli(['--auto-heal', '--apply', '--cwd', fx.cwd]);
  assert.match(
    r.stderr,
    /--apply is now redundant when --auto-heal is set/,
    `expected deprecation note on stderr; got: ${r.stderr}`,
  );
});

test('--auto-heal --dry-run does NOT emit the deprecation note (--apply not passed)', async (t) => {
  const fx = await makeFixture();
  t.after(fx.cleanup);
  const r = await runCli(['--auto-heal', '--dry-run', '--cwd', fx.cwd]);
  assert.ok(
    !/--apply is now redundant/.test(r.stderr),
    `expected NO deprecation note; got stderr: ${r.stderr}`,
  );
});

test('--apply without --auto-heal is a silent no-op (no deprecation note)', async (t) => {
  const fx = await makeFixture();
  t.after(fx.cleanup);
  const r = await runCli(['--apply', '--cwd', fx.cwd]);
  assert.ok(
    !/--apply is now redundant/.test(r.stderr),
    `expected NO deprecation note when --auto-heal absent; got stderr: ${r.stderr}`,
  );
});
