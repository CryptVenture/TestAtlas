// test/cli/install-sh-banner.test.js
//
// Quick 260506-h9q — assert that `sh install.sh --help` renders the
// TESTATLAS block-art banner via POSIX `printf` (no Node call), with the
// same NO_COLOR / NO_UNICODE gating that the JS entry-points honor.
//
// We use `--help` (an existing short-circuit dispatch in install.sh) so
// the test never triggers a network fetch, npm install, or filesystem
// write. Banner must appear BEFORE the usage block.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { BANNER_ASCII_LINES, BANNER_LINES } from '../../scripts/lib/banner.js';

const SUITE_ROOT = path.resolve(import.meta.dirname, '..', '..');
const INSTALL_SH = path.join(SUITE_ROOT, 'install.sh');
const ANSI_ESC = String.fromCharCode(0x1b);
const isWindows = process.platform === 'win32';

function runHelp(env = {}) {
  return spawnSync('sh', [INSTALL_SH, '--help'], {
    cwd: SUITE_ROOT,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
}

test('install.sh --help: renders the TESTATLAS block-art banner', { skip: isWindows }, () => {
  const r = runHelp({ NO_COLOR: '1' });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr=${r.stderr}`);
  // Accept either Unicode (█) or ASCII (#) art — install.sh's _banner()
  // function selects between embedded `_b1..._b5` Unicode and ASCII
  // variants based on the same isUnicode() heuristic.
  const countHits = (lines) => {
    let n = 0;
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      if (r.stdout.includes(line)) n++;
    }
    return n;
  };
  const unicodeHits = countHits(BANNER_LINES);
  const asciiHits = countHits(BANNER_ASCII_LINES);
  assert.ok(
    unicodeHits >= 4 || asciiHits >= 4,
    `expected ≥4 banner art lines in install.sh --help; got unicode=${unicodeHits} ascii=${asciiHits}\nstdout=${r.stdout}`,
  );
});

test('install.sh --help: NO_COLOR=1 → zero ANSI escape sequences', { skip: isWindows }, () => {
  const r = runHelp({ NO_COLOR: '1' });
  assert.equal(r.status, 0);
  assert.equal(
    r.stdout.includes(ANSI_ESC),
    false,
    `expected no ANSI escapes under NO_COLOR=1; stdout=${JSON.stringify(r.stdout)}`,
  );
});

test('install.sh --help: NO_UNICODE=1 → ASCII `#` fallback (not `█`)', {
  skip: isWindows,
}, () => {
  const r = runHelp({ NO_COLOR: '1', NO_UNICODE: '1' });
  assert.equal(r.status, 0);
  let hits = 0;
  for (const line of BANNER_ASCII_LINES) {
    if (line.trim().length === 0) continue;
    if (r.stdout.includes(line)) hits++;
  }
  assert.ok(hits >= 4, `expected ≥4 ASCII fallback lines; got ${hits}`);
  assert.equal(r.stdout.includes('█'), false, 'expected no `█` glyphs under NO_UNICODE=1');
});
