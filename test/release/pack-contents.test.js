// test/release/pack-contents.test.js
//
// Plan 08-05 Task 2 — `npm pack --dry-run --json` smoke test for the v1.0.0
// tarball contents. Asserts:
//   1. examples/ is NOT in the tarball.
//   2. .planning/, .github/, test/, node_modules/, coverage/, dist/ are NOT
//      in the tarball.
//   3. bin/, install.js, install.sh, scripts/, .testatlas/, package.json,
//      README.md, LICENSE, CHANGELOG.md ARE in the tarball.
//   4. unpacked tarball size < 1MB (Pitfall 1 warning sign).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpmPack() {
  // On Windows, `npm` is `npm.cmd` — spawnSync('npm') returns null status.
  return spawnSync(NPM_BIN, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    shell: process.platform === 'win32',
  });
}

// npm 10/11 emits diagnostic prefix lines like `[INFO] Successfully packed`
// to stdout BEFORE the JSON payload, even with `--ignore-scripts`. Scan line
// by line until the first line that is exactly `[` or `{`, then JSON.parse
// from that offset. This skips log prefixes like `[INFO] ...` which start
// with `[` but are not valid JSON.
function parseNpmPackJson(stdout) {
  const lines = stdout.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t === '[' || t === '{') break;
    offset += line.length + 1; // +1 for the consumed newline
  }
  return JSON.parse(stdout.slice(offset));
}

test('npm pack: examples/ is NOT in the tarball', () => {
  const r = runNpmPack();
  assert.equal(r.status, 0, `npm pack failed: ${r.stderr}`);
  const arr = parseNpmPackJson(r.stdout);
  const files = arr[0].files.map((f) => f.path);
  const offenders = files.filter((f) => f.startsWith('examples/'));
  assert.equal(
    offenders.length,
    0,
    `tarball must NOT include examples/ — found ${offenders.length}: ${offenders.slice(0, 5).join(', ')}`,
  );
});

test('npm pack: planning/github/test/coverage/dist excluded', () => {
  const r = runNpmPack();
  assert.equal(r.status, 0);
  const arr = parseNpmPackJson(r.stdout);
  const files = arr[0].files.map((f) => f.path);
  const forbidden = ['.planning/', '.github/', 'test/', 'node_modules/', 'coverage/', 'dist/'];
  for (const prefix of forbidden) {
    const offenders = files.filter((f) => f.startsWith(prefix));
    assert.equal(
      offenders.length,
      0,
      `tarball must NOT include ${prefix} — found ${offenders.slice(0, 3).join(', ')}`,
    );
  }
});

test('npm pack: required files ARE in the tarball', () => {
  const r = runNpmPack();
  assert.equal(r.status, 0);
  const arr = parseNpmPackJson(r.stdout);
  const files = arr[0].files.map((f) => f.path);
  const required = [
    'bin/testatlas.js',
    'install.js',
    'install.sh',
    'package.json',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
  ];
  for (const f of required) {
    assert.ok(files.includes(f), `tarball missing required file: ${f}`);
  }
  // Prefix-includes for directory whitelist members.
  for (const prefix of ['scripts/', '.testatlas/']) {
    assert.ok(
      files.some((f) => f.startsWith(prefix)),
      `tarball missing files under ${prefix}`,
    );
  }
});

test('npm pack: compressed tarball size < 1MB (Pitfall 1 — examples not shipped)', () => {
  // Per RESEARCH §Pitfall 1: a >1MB compressed tarball almost certainly means
  // examples/ leaked in. .testatlas/ + scripts/ + bin/ + 4 docs compress to
  // well under 1MB; if this fires, run `npm pack --dry-run --json` and
  // inspect the file list for unexpected directories.
  const r = runNpmPack();
  assert.equal(r.status, 0);
  const arr = parseNpmPackJson(r.stdout);
  const compressed = arr[0].size || 0;
  const ONE_MB = 1024 * 1024;
  assert.ok(
    compressed < ONE_MB,
    `tarball compressed size ${compressed} bytes exceeds 1MB warning threshold (examples/ leak?)`,
  );
});

test('npm pack: unpacked size < 5MB (sanity)', () => {
  // Even with all 7 adapter trees + 30 commands + 19 schemas + templates the
  // unpacked tree is ~2MB. 5MB is a generous ceiling that catches obvious
  // regressions (e.g. test/ leaking, examples/ leaking, node_modules/ leaking).
  const r = runNpmPack();
  assert.equal(r.status, 0);
  const arr = parseNpmPackJson(r.stdout);
  const unpacked = arr[0].unpackedSize || 0;
  const FIVE_MB = 5 * 1024 * 1024;
  assert.ok(
    unpacked < FIVE_MB,
    `tarball unpacked size ${unpacked} bytes exceeds 5MB sanity threshold`,
  );
});
