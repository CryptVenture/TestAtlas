// test/cli/install-js-banner.test.js
//
// Quick 260506-h9q — assert that `node install.js --help` (the git-clone
// install path) renders the TESTATLAS block-art banner with the same
// NO_COLOR / NO_UNICODE gating semantics that the npx path
// (bin/testatlas.js) already honors.
//
// We exercise the binary via spawnSync('node', ['install.js', '--help'])
// rather than importing modules directly, so the assertions cover the
// real entry-point wiring (commander's `addHelpText('beforeAll', ...)`
// hook is what we want to validate, not just `renderBanner` in isolation).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { BANNER_ASCII_LINES, BANNER_LINES } from '../../scripts/lib/banner.js';

const SUITE_ROOT = path.resolve(import.meta.dirname, '..', '..');
const INSTALL_JS = path.join(SUITE_ROOT, 'install.js');
const ANSI_ESC = String.fromCharCode(0x1b);

function runHelp(env = {}) {
  return spawnSync('node', [INSTALL_JS, '--help'], {
    cwd: SUITE_ROOT,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
}

test('install.js --help: renders the TESTATLAS block-art banner', () => {
  const r = runHelp({ NO_COLOR: '1' });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr=${r.stderr}`);
  // 8-of-9 lines (the leading blank line is whitespace-only, so we skip it).
  // Accept either the Unicode block art (`█`) or the ASCII fallback (`#`) —
  // `isUnicode()` in scripts/lib/colors.js returns false on Windows runners
  // without WT_SESSION/TERM_PROGRAM (the github-hosted runner default), so
  // the renderer emits ASCII there. This test verifies a banner is rendered,
  // not which variant; the dedicated NO_UNICODE=1 test below pins the
  // ASCII-fallback contract explicitly.
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
    `expected ≥4 banner art lines in --help; got unicode=${unicodeHits} ascii=${asciiHits}\nstdout=${r.stdout}`,
  );
});

test('install.js --help: NO_COLOR=1 → zero ANSI escape sequences in stdout', () => {
  const r = runHelp({ NO_COLOR: '1' });
  assert.equal(r.status, 0);
  assert.equal(
    r.stdout.includes(ANSI_ESC),
    false,
    `expected no ANSI escapes under NO_COLOR=1; stdout=${JSON.stringify(r.stdout)}`,
  );
});

test('install.js --help: NO_UNICODE=1 → renders `#` art (not `█` blocks)', () => {
  const r = runHelp({ NO_COLOR: '1', NO_UNICODE: '1' });
  assert.equal(r.status, 0);
  // Should contain ASCII fallback lines.
  let hits = 0;
  for (const line of BANNER_ASCII_LINES) {
    if (line.trim().length === 0) continue;
    if (r.stdout.includes(line)) hits++;
  }
  assert.ok(hits >= 4, `expected ≥4 ASCII fallback art lines under NO_UNICODE=1; got ${hits}`);
  // And NOT the `█` block character.
  assert.equal(r.stdout.includes('█'), false, 'expected no `█` glyphs under NO_UNICODE=1');
});
