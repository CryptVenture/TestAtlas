// test/install-sh/install-sh-shellcheck.test.js
//
// Plan 07-02 Task 1. Static-quality gates for install.sh:
//   - shellcheck-clean (when shellcheck on PATH; skipped otherwise)
//   - sentinel last line `_main "$@"` (partial-pipe protection)
//   - no bashisms (`[[`, `function `, `${...[@]}`, `pipefail`)
//   - <= 250 line count budget (raised from 200 in Plan 12-04 to accommodate
//     the _print_usage helper + --help/--dry-run short-circuit blocks for
//     ISSUE-021 — keeps install.sh comfortably under the still-generous budget)
//   - explicit `set -eu` and `# shellcheck shell=sh` directive
//   - shebang is /bin/sh (NOT /bin/bash)
//
// Skipped on Windows entirely (install.sh is POSIX-only by design).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');
const INSTALL_SH = path.join(REPO_ROOT, 'install.sh');

const isWindows = process.platform === 'win32';

function hasShellcheck() {
  const r = spawnSync('which', ['shellcheck'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

test('install.sh: shellcheck install.sh exits 0', { skip: isWindows }, (t) => {
  if (!hasShellcheck()) {
    t.skip('shellcheck not on PATH');
    return;
  }
  const r = spawnSync('shellcheck', [INSTALL_SH], { encoding: 'utf8' });
  assert.equal(
    r.status,
    0,
    `shellcheck failed (exit ${r.status}):\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`,
  );
});

test('install.sh: last line is exactly `_main "$@"` (partial-pipe sentinel)', async () => {
  const buf = await readFile(INSTALL_SH, 'utf8');
  // Trailing newline tolerated; collapse to non-empty trimmed lines.
  const lines = buf.split('\n');
  // Drop trailing blank lines.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const last = lines[lines.length - 1];
  assert.equal(
    last,
    '_main "$@"',
    `last non-blank line is ${JSON.stringify(last)}, expected '_main "$@"'`,
  );
});

test('install.sh: contains no bashisms', async () => {
  const buf = await readFile(INSTALL_SH, 'utf8');
  // Strip comment lines so we don't trip over examples in commentary.
  const code = buf
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  // `[[`-style test
  assert.ok(!/\[\[/.test(code), 'must not use [[ ... ]] (bash-only)');
  // `function name() { ... }` keyword form
  assert.ok(!/\bfunction\s+\w+\s*\(/.test(code), "must not use 'function' keyword");
  // arr[@] array-expansion
  // biome-ignore lint/suspicious/noTemplateCurlyInString: regex source string explains the bashism we forbid
  assert.ok(!/\$\{[A-Za-z_][A-Za-z0-9_]*\[@\]\}/.test(code), 'must not use ${arr[@]} arrays');
  // set -o pipefail
  assert.ok(!/pipefail/.test(code), 'must not use pipefail (bash-only)');
});

test('install.sh: line count <= 250', async () => {
  const buf = await readFile(INSTALL_SH, 'utf8');
  const lineCount = buf.split('\n').length;
  assert.ok(lineCount <= 250, `install.sh has ${lineCount} lines, budget is 250`);
});

test('install.sh: uses set -eu (NOT set -euo pipefail)', async () => {
  const buf = await readFile(INSTALL_SH, 'utf8');
  assert.match(buf, /^set -eu\s*$/m, 'expected `set -eu` line near top');
});

test('install.sh: shebang is /bin/sh', async () => {
  const buf = await readFile(INSTALL_SH, 'utf8');
  const firstLine = buf.split('\n')[0];
  assert.equal(firstLine, '#!/bin/sh', `shebang must be /bin/sh, got ${JSON.stringify(firstLine)}`);
});

test('install.sh: declares `# shellcheck shell=sh` directive', async () => {
  const buf = await readFile(INSTALL_SH, 'utf8');
  assert.match(buf, /^# shellcheck shell=sh\s*$/m, 'must declare shellcheck shell=sh directive');
});

test('install.sh: file is executable (mode bits include +x)', { skip: isWindows }, async () => {
  const st = await stat(INSTALL_SH);
  // Owner-execute bit
  assert.ok(st.mode & 0o100, `install.sh mode ${st.mode.toString(8)} missing owner-execute`);
});
