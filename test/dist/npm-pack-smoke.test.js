// test/dist/npm-pack-smoke.test.js
//
// Plan 07-05 Task 1 — DIST-02 npm-pack smoke test.
//
// Asserts:
//   - `npm pack --dry-run --json` succeeds.
//   - The reported file set contains every entry promised by package.json
//     `files` (bin/, install.js, install.sh, scripts/, .testatlas/) plus
//     LICENSE/README.md/CHANGELOG.md.
//   - package.json metadata is publish-ready (name, version, bin, engines,
//     no `private: true`).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PKG_JSON_PATH = path.join(REPO_ROOT, 'package.json');

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpmPack() {
  // --ignore-scripts: skip `prepare` (simple-git-hooks installer) which
  // pollutes stdout with `[INFO] ...` lines and prevents JSON parsing.
  // On Windows, `npm` is `npm.cmd` — spawnSync('npm') returns null status.
  const r = spawnSync(NPM_BIN, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    shell: process.platform === 'win32',
  });
  return r;
}

// npm 10/11 emits diagnostic prefix lines like `[INFO] Successfully packed`
// to stdout BEFORE the JSON payload, even with `--ignore-scripts`. The JSON
// payload is always a single array `[ {...} ]` whose opening `[` sits on its
// own line (or is immediately followed by `\n` / whitespace). We scan stdout
// line by line until we hit the first line whose content is exactly `[` or
// `{`, then JSON.parse from that offset to the end. This skips log prefixes
// like `[INFO] ...` which start with `[` but are not valid JSON.
function parseNpmPackJson(stdout) {
  const lines = stdout.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t === '[' || t === '{') break;
    offset += line.length + 1; // +1 for the consumed newline
  }
  const slice = stdout.slice(offset);
  return JSON.parse(slice);
}

test('npm pack --dry-run --json: exits 0', () => {
  const r = runNpmPack();
  if (r.status !== 0) {
    console.error('npm pack stderr:', r.stderr);
    console.error('npm pack stdout:', r.stdout);
  }
  assert.equal(r.status, 0, 'npm pack --dry-run failed');
});

test('npm pack: reports expected file set', () => {
  const r = runNpmPack();
  assert.equal(r.status, 0);
  // npm pack --json may emit non-JSON warnings on stderr; stdout is the JSON.
  const arr = parseNpmPackJson(r.stdout);
  assert.ok(Array.isArray(arr) && arr.length === 1, 'expected single-package JSON array');
  const pkg = arr[0];
  const files = pkg.files.map((f) => f.path);

  const expected = [
    'bin/testatlas.js',
    'install.js',
    'install.sh',
    'scripts/uninstall.js',
    'scripts/update.js',
    'scripts/lib/install-core.js',
    'package.json',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
  ];
  for (const want of expected) {
    assert.ok(
      files.includes(want),
      `npm pack file list missing: ${want}\nGot: ${files.slice(0, 30).join(', ')}...`,
    );
  }
});

test('npm pack: includes at least some .testatlas/ files', () => {
  const r = runNpmPack();
  assert.equal(r.status, 0);
  const arr = parseNpmPackJson(r.stdout);
  const files = arr[0].files.map((f) => f.path);
  const hasTestAtlas = files.some((f) => f.startsWith('.testatlas/'));
  assert.ok(hasTestAtlas, 'expected at least one .testatlas/ file in npm pack output');
});

test('package.json: name === "testatlas"', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.equal(pkg.name, 'testatlas');
});

test('package.json: version matches semver core (^\\d+\\.\\d+\\.\\d+)', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[-+].+)?$/, `bad version: ${pkg.version}`);
});

test('package.json: bin.testatlas === "./bin/testatlas.js"', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.equal(pkg.bin.testatlas, './bin/testatlas.js');
});

test('package.json: private flag absent (or false)', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.ok(pkg.private !== true, 'package.json must not have private: true to publish');
});

test('package.json: engines.node === ">=20.11.0"', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.equal(pkg.engines.node, '>=20.11.0');
});

test('package.json: publishConfig.access === "public"', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.ok(pkg.publishConfig, 'missing publishConfig');
  assert.equal(pkg.publishConfig.access, 'public');
});

test('package.json: publishConfig.provenance === true', async () => {
  const pkg = JSON.parse(await readFile(PKG_JSON_PATH, 'utf8'));
  assert.ok(pkg.publishConfig, 'missing publishConfig');
  assert.equal(pkg.publishConfig.provenance, true);
});
