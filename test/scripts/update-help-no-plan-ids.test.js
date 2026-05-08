// test/scripts/update-help-no-plan-ids.test.js
//
// Regression test for ISSUE-036 (closed 2026-05-09): scripts/update.js --help
// previously leaked internal phase-plan IDs ("(Plan 07-04 wires this)" /
// "until 07-04 lands update-check") into user-facing flag descriptions. Pin
// the contract: --help output must not contain any "Plan NN-NN" or "NN-NN
// lands" patterns that would expose internal lifecycle terminology.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const SCRIPT = path.join(repoRoot, 'scripts/update.js');

test('ISSUE-036: update.js --help does not leak internal Plan NN-NN IDs', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 0, `--help exit code (stderr: ${result.stderr})`);
  // The "Plan NN-NN" pattern is the canonical OBD planning identifier
  // (e.g. "Plan 07-04"); it has no business in user-facing CLI help text.
  assert.doesNotMatch(
    result.stdout,
    /Plan \d{2}-\d{2}/,
    'user-facing --help must not cite internal Plan-XX-YY IDs',
  );
  // The bare "NN-NN lands" phrasing was the second leak class.
  assert.doesNotMatch(result.stdout, /\b\d{2}-\d{2} lands\b/);
});
