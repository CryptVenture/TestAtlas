// test/bin-testatlas-validate-apply-suggestions.test.js
//
// Quick 260506-vaq: CLI plumbing for `--apply-suggestions`.
//
// Ensures BOTH entry-points (`bin/testatlas.js validate` and
// `scripts/validate-workspace.js`) parse the flag, document it in --help,
// and imply `--auto-heal` so the autoheal loop runs at all when only
// `--apply-suggestions` is passed.

import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(REPO_ROOT, 'bin', 'testatlas.js');
const VALIDATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-workspace.js');
const FIXTURE_SRC = path.join(
  REPO_ROOT,
  'test',
  'fixtures',
  'workspaces',
  'broken-orphan-evidence',
);

/**
 * Build a tmp workspace + suite tree, then mutate the fixture's parent issue
 * to add a dangling EVIDENCE-999 ref so HEAL-05 has eligible work.
 */
async function makeFixture() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'cli-apply-suggestions-'));
  await cp(FIXTURE_SRC, path.join(tmp, '_testatlas'), { recursive: true });
  await cp(path.join(REPO_ROOT, '.testatlas'), path.join(tmp, '.testatlas'), { recursive: true });
  // Inject a dangling EVIDENCE-999 ref so HEAL-05 has work to do.
  const issuePath = path.join(tmp, '_testatlas', 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  issue.evidence = [...(issue.evidence ?? []), 'EVIDENCE-999'];
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
  return { cwd: tmp, cleanup: () => rm(tmp, { recursive: true, force: true }) };
}

async function runNode(cmd, args, cwd) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    const res = await execFile('node', [cmd, ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
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

// ─── Help text — both entry-points ───────────────────────────────────────────

test('bin/testatlas.js validate --help mentions --apply-suggestions', async () => {
  const { stdout } = await runNode(BIN, ['validate', '--help'], REPO_ROOT);
  assert.match(stdout, /--apply-suggestions/, 'help must list --apply-suggestions');
  assert.match(
    stdout,
    /HEAL-05[\s\S]*HEAL-06|HEAL-06[\s\S]*HEAL-05/,
    'help must mention HEAL-05 and HEAL-06',
  );
});

test('scripts/validate-workspace.js --help mentions --apply-suggestions', async () => {
  const { stdout } = await runNode(VALIDATE_SCRIPT, ['--help'], REPO_ROOT);
  assert.match(stdout, /--apply-suggestions/, 'help must list --apply-suggestions');
  assert.match(
    stdout,
    /Implies --auto-heal/,
    'help must note --apply-suggestions implies --auto-heal',
  );
});

// ─── Implies --auto-heal: bin/testatlas.js path ──────────────────────────────

test('bin validate --apply-suggestions (alone) activates autoheal — healed section present', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);

  const { stdout, exitCode } = await runNode(
    BIN,
    ['validate', '--target', fix.cwd, '--json', '--apply-suggestions'],
    REPO_ROOT,
  );
  assert.equal(exitCode, 0, `expected exit 0; stdout was:\n${stdout}`);
  // JSON output must include an `autoHeal` section because --apply-suggestions
  // implied --auto-heal. (renderJsonReport names the section `autoHeal`.)
  const json = JSON.parse(stdout);
  assert.ok(json.autoHeal, 'autoHeal section present in JSON output');
  // HEAL-05 should have applied at least once (we seeded a dangling ref).
  const heal05 = (json.autoHeal.applied ?? []).filter((a) => a.healId === 'HEAL-05');
  assert.ok(heal05.length >= 1, `expected HEAL-05; got ${JSON.stringify(json.autoHeal)}`);
});

// ─── Implies --auto-heal: scripts/validate-workspace.js path ─────────────────

test('scripts/validate-workspace.js --apply-suggestions (alone) activates autoheal', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);

  const { stdout, exitCode } = await runNode(
    VALIDATE_SCRIPT,
    ['--cwd', fix.cwd, '--apply-suggestions'],
    REPO_ROOT,
  );
  // markdown report contains a "Applied" header when autoheal ran.
  assert.equal(exitCode, 0, `expected exit 0; stdout was:\n${stdout}`);
  assert.match(stdout, /^### Applied \(\d+\)/m, 'expected Applied header in stdout');
  assert.match(stdout, /HEAL-05/, 'expected at least one HEAL-05 row');
});

// ─── Both flags absent: NEVER-heal map still produces skipped entries ────────

test('bin validate (no flags) — NEVER-heal map produces skipped entries (regression)', async (t) => {
  const fix = await makeFixture();
  t.after(fix.cleanup);

  const { stdout } = await runNode(
    BIN,
    ['validate', '--target', fix.cwd, '--auto-heal', '--json'],
    REPO_ROOT,
  );
  const json = JSON.parse(stdout);
  // HEAL-05 must NOT have run (no --apply-suggestions). The NEVER-heal map
  // canonical refusal text must be present.
  const heal05 = (json.autoHeal?.applied ?? []).filter((a) => a.healId === 'HEAL-05');
  assert.equal(heal05.length, 0, 'HEAL-05 must not run without --apply-suggestions');
  const skip = (json.autoHeal?.skipped ?? []).find(
    (s) => s.code === 'TESTATLAS_MISSING_EVIDENCE_REF',
  );
  assert.ok(
    skip,
    `NEVER-heal skipped entry must be present; autoHeal=${JSON.stringify(json.autoHeal)}`,
  );
  assert.match(skip.reason, /--apply-suggestions/);
});
