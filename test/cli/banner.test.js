// test/cli/banner.test.js
//
// Quick 260504-pjh — banner.js layout invariants + render output.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  BANNER_ASCII_LINES,
  BANNER_LINES,
  printBanner,
  renderBanner,
} from '../../scripts/lib/banner.js';

// Build the ANSI-CSI regex via String.fromCharCode to satisfy Biome's
// noControlCharactersInRegex rule (the runtime regex still matches
// ESC `[` — the canonical ANSI CSI introducer).
const ANSI_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[`, 'u');
const TAGLINE = 'Agent-agnostic AI product testing & quality intelligence framework';
const REPO_URL = 'github.com/CryptVenture/TestAtlas';

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

const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'NO_UNICODE'];
let envSnapshot;

beforeEach(() => {
  envSnapshot = {};
  for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envSnapshot[k] === undefined) delete process.env[k];
    else process.env[k] = envSnapshot[k];
  }
});

// ---- layout invariants ------------------------------------------------------

test('banner: BANNER_LINES.length is between 1 and 12 inclusive', () => {
  assert.ok(BANNER_LINES.length >= 1, 'expected at least 1 banner line');
  assert.ok(BANNER_LINES.length <= 12, `expected ≤ 12 banner lines, got ${BANNER_LINES.length}`);
});

test('banner: every line in BANNER_LINES is ≤ 80 columns', () => {
  for (const line of BANNER_LINES) {
    // Compare codepoint length, not byte length — we use multi-byte glyphs.
    const cols = [...line].length;
    assert.ok(cols <= 80, `line exceeds 80 cols (${cols}): ${JSON.stringify(line)}`);
  }
});

test('banner: ASCII fallback lines also ≤ 80 columns', () => {
  for (const line of BANNER_ASCII_LINES) {
    assert.ok(line.length <= 80, `ascii line exceeds 80 cols: ${JSON.stringify(line)}`);
  }
});

// ---- renderBanner -----------------------------------------------------------

test('banner: renderBanner({ color: false, version: "1.2.3" }) contains tagline + version line + repo URL', () => {
  const out = renderBanner({ color: false, version: '1.2.3' });
  assert.match(out, new RegExp(TAGLINE.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')));
  assert.match(out, /v1\.2\.3/);
  assert.match(out, new RegExp(REPO_URL.replace(/\./g, '\\.')));
});

test('banner: renderBanner({ color: false }) emits zero ANSI escape sequences', () => {
  const out = renderBanner({ color: false, version: '0.0.0' });
  assert.doesNotMatch(out, ANSI_RE);
});

test('banner: renderBanner default version is "0.0.0"', () => {
  const out = renderBanner({ color: false });
  assert.match(out, /v0\.0\.0/);
});

test('banner: renderBanner output ends with a trailing newline', () => {
  const out = renderBanner({ color: false, version: '0.0.0' });
  assert.equal(out.endsWith('\n'), true);
});

test('banner: renderBanner with NO_UNICODE produces only ASCII codepoints in art', () => {
  process.env.NO_UNICODE = '1';
  const out = renderBanner({ color: false, version: '0.0.0' });
  // The banner art should appear from BANNER_ASCII_LINES under NO_UNICODE.
  for (const line of BANNER_ASCII_LINES) {
    assert.ok(out.includes(line), `expected ASCII fallback line in output: ${line}`);
  }
});

// ---- printBanner ------------------------------------------------------------

test('banner: printBanner({ stream, color: false, version: "0.0.0" }) writes rendered banner', () => {
  const s = makeStream();
  printBanner({ stream: s, color: false, version: '9.9.9' });
  const out = s.text();
  assert.match(out, /v9\.9\.9/);
  assert.match(out, new RegExp(TAGLINE.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')));
  assert.doesNotMatch(out, ANSI_RE);
});
