// test/cli/update-js-banner.test.js
//
// Quick 260506-h9q — assert that `node scripts/update.js --help` renders
// the TESTATLAS block-art banner. Same NO_COLOR / NO_UNICODE semantics
// as install.js + bin/testatlas.js.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { BANNER_ASCII_LINES, BANNER_LINES } from '../../scripts/lib/banner.js';

const SUITE_ROOT = path.resolve(import.meta.dirname, '..', '..');
const UPDATE_JS = path.join(SUITE_ROOT, 'scripts', 'update.js');
const ANSI_ESC = String.fromCharCode(0x1b);

function runHelp(env = {}) {
  return spawnSync('node', [UPDATE_JS, '--help'], {
    cwd: SUITE_ROOT,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
}

test('update.js --help: renders the TESTATLAS block-art banner', () => {
  const r = runHelp({ NO_COLOR: '1' });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr=${r.stderr}`);
  let hits = 0;
  for (const line of BANNER_LINES) {
    if (line.trim().length === 0) continue;
    if (r.stdout.includes(line)) hits++;
  }
  assert.ok(hits >= 4, `expected ≥4 banner art lines in --help; got ${hits}`);
});

test('update.js --help: NO_COLOR=1 → zero ANSI escape sequences', () => {
  const r = runHelp({ NO_COLOR: '1' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.includes(ANSI_ESC), false);
});

test('update.js --help: NO_UNICODE=1 → ASCII `#` fallback (not `█`)', () => {
  const r = runHelp({ NO_COLOR: '1', NO_UNICODE: '1' });
  assert.equal(r.status, 0);
  let hits = 0;
  for (const line of BANNER_ASCII_LINES) {
    if (line.trim().length === 0) continue;
    if (r.stdout.includes(line)) hits++;
  }
  assert.ok(hits >= 4, `expected ≥4 ASCII fallback lines; got ${hits}`);
  assert.equal(r.stdout.includes('█'), false);
});
