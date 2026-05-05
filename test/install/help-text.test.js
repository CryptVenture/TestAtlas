// test/install/help-text.test.js
//
// Quick 260505-quk Task 2 / ISSUE-007: regression guard against the
// install.js help-flag description claiming `all 7 adapters` when the
// canonical ALL_ADAPTERS roster is 18.
//
// Asserts:
//   1. `node install.js --help` does NOT contain the substring `7 adapters`.
//   2. `node install.js --help` contains the substring matching the live
//      `${ALL_ADAPTERS.length} adapters` count (currently 18 — derived
//      from scripts/lib/install-core.js so the test stays correct if
//      the roster ever grows or shrinks).
//   3. `node bin/testatlas.js init --help` (the primary CLI surface)
//      also reflects the live count and never says `7 adapters` — locks
//      that path against a future regression.
//   4. The help text is built from the dynamic source (no hard-coded `18`
//      in the option description). Verified by reading install.js and
//      asserting it references `ALL_ADAPTERS` in the relevant block.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { ALL_ADAPTERS } from '../../scripts/lib/install-core.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const INSTALL_JS = path.join(REPO_ROOT, 'install.js');
const TESTATLAS_BIN = path.join(REPO_ROOT, 'bin', 'testatlas.js');

function runHelp(scriptArgs) {
  const result = spawnSync('node', scriptArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  assert.equal(result.status, 0, `--help should exit 0; got ${result.status}: ${result.stderr}`);
  return result.stdout;
}

test('install.js --help does not contain stale `7 adapters` substring', () => {
  const out = runHelp([INSTALL_JS, '--help']);
  assert.ok(
    !out.includes('7 adapters'),
    'install.js --help still emits the stale "7 adapters" string. Update the --all-adapters option description to derive the count from ALL_ADAPTERS.length (scripts/lib/install-core.js).',
  );
});

test('install.js --help reports live ALL_ADAPTERS.length adapter count', () => {
  const out = runHelp([INSTALL_JS, '--help']);
  const expected = `${ALL_ADAPTERS.length} adapters`;
  assert.ok(
    out.includes(expected),
    `install.js --help should contain "${expected}" (derived from ALL_ADAPTERS.length). Got:\n${out}`,
  );
});

test('bin/testatlas.js init --help does not contain stale `7 adapters` substring', () => {
  const out = runHelp([TESTATLAS_BIN, 'init', '--help']);
  assert.ok(
    !out.includes('7 adapters'),
    'bin/testatlas.js init --help still emits the stale "7 adapters" string.',
  );
});

test('bin/testatlas.js init --help reports live ALL_ADAPTERS.length adapter count', () => {
  const out = runHelp([TESTATLAS_BIN, 'init', '--help']);
  const expected = `${ALL_ADAPTERS.length} adapters`;
  assert.ok(
    out.includes(expected),
    `bin/testatlas.js init --help should contain "${expected}" (derived from ALL_ADAPTERS.length). Got:\n${out}`,
  );
});

test('install.js --all-adapters option description references ALL_ADAPTERS', async () => {
  const source = await readFile(INSTALL_JS, 'utf8');
  assert.ok(
    source.includes('ALL_ADAPTERS'),
    'install.js should import and reference ALL_ADAPTERS so the help-text count cannot drift from scripts/lib/install-core.js.',
  );
});
