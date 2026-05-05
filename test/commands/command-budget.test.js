// test/commands/command-budget.test.js
//
// CMD-03: scripts/check-command-budgets.js exits 0 when commands dir is empty
// or missing, exits 1 when any file exceeds 1800 words, exits 0 otherwise.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/check-command-budgets.js');
const FIXTURES = path.join(REPO_ROOT, 'test/fixtures/commands');

function run(cwd) {
  return spawnSync('node', [SCRIPT, cwd], { encoding: 'utf8' });
}

test('check-command-budgets: exits 0 when commands dir does not exist', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'ta-budget-'));
  const result = run(tmp);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no command files/i);
});

test('check-command-budgets: exits 0 when commands dir exists but is empty', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'ta-budget-'));
  await mkdir(path.join(tmp, '.testatlas/commands'), { recursive: true });
  const result = run(tmp);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no command files/i);
});

test('check-command-budgets: exits 1 when over-budget fixture is present', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'ta-budget-'));
  const cmdsDir = path.join(tmp, '.testatlas/commands');
  await mkdir(cmdsDir, { recursive: true });
  await copyFile(path.join(FIXTURES, 'over-budget.md'), path.join(cmdsDir, 'over-budget.md'));
  const result = run(tmp);
  assert.equal(result.status, 1);
  // FAIL message goes to stderr (inherited stdio) so we cannot capture text;
  // the exit code is the contract.
});

test('check-command-budgets: exits 0 with under-budget fixture', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'ta-budget-'));
  const cmdsDir = path.join(tmp, '.testatlas/commands');
  await mkdir(cmdsDir, { recursive: true });
  await copyFile(path.join(FIXTURES, 'minimal-valid.md'), path.join(cmdsDir, 'minimal-valid.md'));
  const result = run(tmp);
  assert.equal(result.status, 0);
});

test('check-command-budgets: live repo state — exit 0 (Wave-0: no command files yet) OR all under budget', async () => {
  const result = run(REPO_ROOT);
  // Either 0 (no commands yet) or 0 (all under budget). 1 indicates real overage.
  assert.equal(result.status, 0);
});

test('CMD-03: every shipped command file is under the 1800-word budget', async () => {
  const files = await listCommandFiles({ cwd: REPO_ROOT });
  if (files.length === 0) return; // Wave-0 short-circuit
  // The CI gate will catch over-budget; this test is a redundancy.
  for (const file of files) {
    const result = spawnSync(
      'node',
      [path.join(REPO_ROOT, 'scripts/check-token-budget.js'), file, '1800'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${file} exceeded the 1800-word budget`);
  }
});
