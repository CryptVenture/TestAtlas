// scripts/lib/colors.js
//
// Quick 260504-pjh — semantic color palette + tagged status helpers.
//
// All output respects:
//   - NO_COLOR (env-var presence; empty string still disables per
//     https://no-color.org)
//   - FORCE_COLOR='0'
//   - non-TTY streams (stream.isTTY === false)
//   - NO_UNICODE (forces ASCII fallback symbols)
//
// ESM-only. Plain JS. No build step. No chalk. picocolors-only.

import pc from 'picocolors';

/**
 * Decide whether color output is permitted on the given stream right now.
 * Re-evaluates env on every call so tests can mutate process.env between
 * assertions.
 *
 * @param {NodeJS.WritableStream & { isTTY?: boolean }} [stream=process.stdout]
 * @returns {boolean}
 */
export function colorEnabled(stream = process.stdout) {
  // NO_COLOR: presence check (https://no-color.org — any value, including '').
  if (process.env.NO_COLOR != null) return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (stream && stream.isTTY === false) return false;
  return true;
}

/**
 * Decide whether unicode glyphs are safe in current terminal. Falls back to
 * ASCII bracket-tags on Windows legacy cmd.exe and when NO_UNICODE is set.
 *
 * @returns {boolean}
 */
export function isUnicode() {
  if (process.env.NO_UNICODE != null) return false;
  if (process.platform === 'win32' && !process.env.WT_SESSION && !process.env.TERM_PROGRAM) {
    return false;
  }
  return true;
}

/**
 * Wrap a picocolors fn so it only colorizes when color is currently enabled
 * for stdout. Lazy: re-checks on every call so tests can flip env between
 * invocations.
 *
 * @param {(s: string) => string} fn
 */
function lazy(fn) {
  return (s) => (colorEnabled() ? fn(String(s)) : String(s));
}

/**
 * Semantic palette. Each entry is a function (s: string) => string that
 * applies the color when colorEnabled() is true, else returns the input
 * unchanged.
 */
export const palette = {
  ok: lazy(pc.green),
  warn: lazy(pc.yellow),
  err: lazy(pc.red),
  info: lazy(pc.cyan),
  dim: lazy(pc.dim),
  bold: lazy(pc.bold),
  label: lazy(pc.magenta),
};

const UNICODE_SYMBOLS = Object.freeze({
  ok: '✓', // ✓
  err: '✗', // ✗
  warn: '⚠', // ⚠
  info: 'ℹ', // ℹ
});

const ASCII_SYMBOLS = Object.freeze({
  ok: '[OK]',
  err: '[ERR]',
  warn: '[!]',
  info: '[i]',
});

/**
 * Return the symbol for a kind. Unicode glyph when available, ASCII bracket
 * fallback otherwise.
 *
 * @param {'ok'|'warn'|'err'|'info'} kind
 * @returns {string}
 */
export function symbol(kind) {
  const table = isUnicode() ? UNICODE_SYMBOLS : ASCII_SYMBOLS;
  return table[kind] ?? '';
}

/**
 * Internal: write a tagged line `<colored-symbol> <msg>\n` to a stream.
 *
 * @param {'ok'|'warn'|'err'|'info'} kind
 * @param {string} msg
 * @param {NodeJS.WritableStream} stream
 */
function writeTagged(kind, msg, stream) {
  const sym = symbol(kind);
  const colored = palette[kind](sym);
  stream.write(`${colored} ${msg}\n`);
}

/**
 * @param {string} msg
 * @param {NodeJS.WritableStream} [stream=process.stdout]
 */
export function success(msg, stream = process.stdout) {
  writeTagged('ok', msg, stream);
}

/**
 * @param {string} msg
 * @param {NodeJS.WritableStream} [stream=process.stdout]
 */
export function warning(msg, stream = process.stdout) {
  writeTagged('warn', msg, stream);
}

/**
 * @param {string} msg
 * @param {NodeJS.WritableStream} [stream=process.stderr]
 */
export function error(msg, stream = process.stderr) {
  writeTagged('err', msg, stream);
}

/**
 * @param {string} msg
 * @param {NodeJS.WritableStream} [stream=process.stdout]
 */
export function info(msg, stream = process.stdout) {
  writeTagged('info', msg, stream);
}

/**
 * Step counter prefix `[n/total] msg`.
 *
 * @param {number} n
 * @param {number} total
 * @param {string} msg
 * @param {NodeJS.WritableStream} [stream=process.stdout]
 */
export function step(n, total, msg, stream = process.stdout) {
  const tag = palette.dim(`[${n}/${total}]`);
  stream.write(`${tag} ${msg}\n`);
}
