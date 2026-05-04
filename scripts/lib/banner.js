// scripts/lib/banner.js
//
// Quick 260504-pjh — ASCII-art TESTATLAS banner + tagline + version line.
//
// Constraints (verified by test/cli/banner.test.js):
//   - BANNER_LINES.length ≤ 12
//   - every line in BANNER_LINES is ≤ 80 columns
//   - tagline is the canonical project tagline (matches README + package.json
//     description framing)
//   - version line includes the GitHub URL
//
// Design notes:
//   - Banner is hand-crafted block art using the `█` (full block) character,
//     which is a pure printable codepoint (no escape sequences). It renders
//     correctly in every TTY we care about (xterm, iTerm, Windows Terminal,
//     VS Code integrated terminal). When NO_UNICODE is set, we fall back to
//     `#` art with the same shape.
//   - Banner color: magenta (palette.label) — matches the brand accent and
//     stands out from the cyan/info sub-help text.
//   - The banner function is sync; the caller passes `version` (so banner.js
//     never has to read package.json itself).
//
// ESM-only. Plain JS.

import { colorEnabled, isUnicode, palette } from './colors.js';

// 9-line ASCII banner spelling "TESTATLAS" using the `█` block character.
// Each line is ≤ 80 columns. (Width measured below: 67 cols.)
//
// Layout (1 col gap between letters):
//   T  E  S  T  A  T  L  A  S
//   8  6  6  8  6  8  4  6  6   ← per-letter column widths (inc. gap)
//
// We're not chasing perfection — just professional polish.
const BANNER_UNICODE_LINES = [
  '                                                                           ',
  ' ████████ ███████ ███████ ████████  █████  ████████ ██       █████  ███████',
  '    ██    ██      ██         ██    ██   ██    ██    ██      ██   ██ ██     ',
  '    ██    █████   ███████    ██    ███████    ██    ██      ███████ ███████',
  '    ██    ██           ██    ██    ██   ██    ██    ██      ██   ██      ██',
  '    ██    ███████ ███████    ██    ██   ██    ██    ███████ ██   ██ ███████',
];

// ASCII fallback — same 5-row block letters drawn with `#`.
const BANNER_ASCII_LINES = [
  '                                                                           ',
  ' ######## ####### ####### ########  #####  ######## ##       #####  #######',
  '    ##    ##      ##         ##    ##   ##    ##    ##      ##   ## ##     ',
  '    ##    #####   #######    ##    #######    ##    ##      ####### #######',
  '    ##    ##           ##    ##    ##   ##    ##    ##      ##   ##      ##',
  '    ##    ####### #######    ##    ##   ##    ##    ####### ##   ## #######',
];

/**
 * Default exported banner lines — the unicode block-letter art. ASCII art
 * variant lives in `BANNER_ASCII_LINES` (re-exported below for tests).
 */
export const BANNER_LINES = BANNER_UNICODE_LINES;

export { BANNER_ASCII_LINES };

const TAGLINE = 'Agent-agnostic AI product testing & quality intelligence framework';
const REPO_URL = 'https://github.com/CryptVenture/TestAtlas';

/**
 * Render the banner as a multi-line string ending with a trailing newline.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.color]   Apply ANSI color (magenta art, dim version).
 *                                 Defaults to colorEnabled(process.stdout).
 * @param {string}  [opts.version] Version string for the v-line (default '0.0.0').
 * @returns {string}
 */
export function renderBanner(opts = {}) {
  const color = opts.color ?? colorEnabled();
  const version = opts.version ?? '0.0.0';
  const lines = isUnicode() ? BANNER_UNICODE_LINES : BANNER_ASCII_LINES;

  const art = color ? lines.map((l) => palette.label(l)) : [...lines];
  const tagline = color ? palette.info(TAGLINE) : TAGLINE;
  const versionLine = color
    ? palette.dim(`v${version}  •  ${REPO_URL}`)
    : `v${version}  •  ${REPO_URL}`;

  return [...art, '', tagline, '', versionLine, ''].join('\n');
}

/**
 * Write the rendered banner to a writable stream.
 *
 * @param {object} [opts]
 * @param {NodeJS.WritableStream} [opts.stream=process.stdout]
 * @param {boolean} [opts.color]
 * @param {string}  [opts.version]
 */
export function printBanner(opts = {}) {
  const stream = opts.stream ?? process.stdout;
  const color = opts.color ?? colorEnabled(stream);
  stream.write(renderBanner({ color, version: opts.version }));
}
