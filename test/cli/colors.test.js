// test/cli/colors.test.js
//
// Quick 260504-pjh — colors.js semantic palette + tagged helpers.
//
// Test invariants:
//   - colorEnabled() respects NO_COLOR (any value), FORCE_COLOR='0', non-TTY.
//   - tagged helpers (success/warning/error/info) emit
//     `<symbol> <msg>\n` to the supplied stream.
//   - When color is disabled, output contains NO ANSI escape sequences.
//   - When NO_UNICODE is set, symbol() returns ASCII bracket fallbacks.
//   - step(n, total, msg) emits `[n/total] msg`.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  colorEnabled,
  error,
  info,
  isUnicode,
  palette,
  step,
  success,
  symbol,
  warning,
} from '../../scripts/lib/colors.js';

// Build the ANSI-CSI regex from a String.fromCharCode escape so Biome's
// noControlCharactersInRegex rule isn't triggered (the underlying byte is
// still ESC `[`, i.e. the standard ANSI CSI introducer).
const ANSI_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[`, 'u');

/** Build a fresh capturing stream for each test. */
function makeStream() {
  return {
    isTTY: false,
    chunks: [],
    write(s) {
      this.chunks.push(s);
      return true;
    },
    text() {
      return this.chunks.join('');
    },
  };
}

/**
 * Snapshot env vars we mutate, so each test can restore them cleanly.
 * Node 22's `node:test` runs files in parallel by default but tests within
 * a file are sequential — env mutation across tests in this file is safe.
 */
const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'NO_UNICODE'];
let envSnapshot;

beforeEach(() => {
  envSnapshot = {};
  for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];
  // Default to "color enabled" in tests by clearing env.
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
});

// ---- colorEnabled ---------------------------------------------------------

test('colors: colorEnabled() returns false when NO_COLOR is set (any value)', () => {
  process.env.NO_COLOR = '1';
  assert.equal(colorEnabled({ isTTY: true }), false);
  process.env.NO_COLOR = '';
  assert.equal(colorEnabled({ isTTY: true }), false);
});

test('colors: colorEnabled() returns false when FORCE_COLOR=0', () => {
  process.env.FORCE_COLOR = '0';
  assert.equal(colorEnabled({ isTTY: true }), false);
});

test('colors: colorEnabled() returns false when stream.isTTY === false', () => {
  assert.equal(colorEnabled({ isTTY: false }), false);
});

test('colors: colorEnabled() returns true when isTTY=true and no disabling env', () => {
  assert.equal(colorEnabled({ isTTY: true }), true);
});

// ---- tagged helpers --------------------------------------------------------

test('colors: success() writes `<sym> <msg>\\n` to the supplied stream', () => {
  process.env.NO_COLOR = '1';
  const s = makeStream();
  success('hello', s);
  assert.equal(s.text(), `${symbol('ok')} hello\n`);
});

test('colors: warning() writes `<sym> <msg>\\n`', () => {
  process.env.NO_COLOR = '1';
  const s = makeStream();
  warning('careful', s);
  assert.equal(s.text(), `${symbol('warn')} careful\n`);
});

test('colors: error() writes `<sym> <msg>\\n` to supplied stream', () => {
  process.env.NO_COLOR = '1';
  const s = makeStream();
  error('boom', s);
  assert.equal(s.text(), `${symbol('err')} boom\n`);
});

test('colors: info() writes `<sym> <msg>\\n`', () => {
  process.env.NO_COLOR = '1';
  const s = makeStream();
  info('fyi', s);
  assert.equal(s.text(), `${symbol('info')} fyi\n`);
});

// ---- ANSI suppression under NO_COLOR ---------------------------------------

test('colors: NO_COLOR=1 → captured output has zero ANSI escapes', () => {
  process.env.NO_COLOR = '1';
  const s = makeStream();
  success('a', s);
  warning('b', s);
  error('c', s);
  info('d', s);
  step(1, 3, 'e', s);
  const out = s.text();
  assert.doesNotMatch(out, ANSI_RE, `expected no ANSI; got ${JSON.stringify(out)}`);
});

// ---- symbol() / unicode fallback -------------------------------------------

test('colors: NO_UNICODE=1 → ASCII bracket symbols', () => {
  process.env.NO_UNICODE = '1';
  assert.equal(symbol('ok'), '[OK]');
  assert.equal(symbol('err'), '[ERR]');
  assert.equal(symbol('warn'), '[!]');
  assert.equal(symbol('info'), '[i]');
});

test('colors: default → unicode glyph symbols', () => {
  delete process.env.NO_UNICODE;
  // We're not on win32 cmd in CI — assert glyphs.
  if (process.platform === 'win32' && !process.env.WT_SESSION && !process.env.TERM_PROGRAM) {
    // Skip; this environment legitimately falls back to ASCII.
    return;
  }
  assert.equal(symbol('ok'), '✓');
  assert.equal(symbol('err'), '✗');
  assert.equal(symbol('warn'), '⚠');
  assert.equal(symbol('info'), 'ℹ');
});

test('colors: isUnicode() honors NO_UNICODE env', () => {
  process.env.NO_UNICODE = '1';
  assert.equal(isUnicode(), false);
  delete process.env.NO_UNICODE;
  if (process.platform === 'win32' && !process.env.WT_SESSION && !process.env.TERM_PROGRAM) {
    assert.equal(isUnicode(), false);
  } else {
    assert.equal(isUnicode(), true);
  }
});

// ---- step ------------------------------------------------------------------

test('colors: step(2, 5, "msg") output contains "[2/5]" and "msg" (uncolored when NO_COLOR=1)', () => {
  process.env.NO_COLOR = '1';
  const s = makeStream();
  step(2, 5, 'doing thing', s);
  const out = s.text();
  assert.match(out, /\[2\/5\]/);
  assert.match(out, /doing thing/);
  assert.doesNotMatch(out, ANSI_RE);
});

// ---- palette ---------------------------------------------------------------

test('colors: palette getters return identity strings when color disabled', () => {
  process.env.NO_COLOR = '1';
  assert.equal(palette.ok('x'), 'x');
  assert.equal(palette.warn('y'), 'y');
  assert.equal(palette.err('z'), 'z');
  assert.equal(palette.info('q'), 'q');
  assert.equal(palette.dim('d'), 'd');
  assert.equal(palette.bold('b'), 'b');
  assert.equal(palette.label('m'), 'm');
});
