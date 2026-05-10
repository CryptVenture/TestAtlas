// test/scripts/bump-version-version-sync.test.js
//
// Quick 260506-jsc — bump-version.js MUST sync install.sh's `VERSION="..."`
// line in addition to package.json / .testatlas/VERSION / adapter-capabilities
// / mcp-server-manifest.
//
// Origin of bug: after bootstrap-publish of v1.1.0 (Trusted Publishing 404'd),
// install.sh on main carried `VERSION="1.0.0"` + v1.1.0 sha256 — a sha
// mismatch that would have failed the curl-pipe install for any user. Required
// a manual follow-up commit (3872428). Root cause: the version-sync logic in
// bump-version.js never touched install.sh.
//
// Contract:
//   - --dry-run preview MUST list install.sh in the change set.
//   - Real run MUST rewrite the `^VERSION="..."$` line to the new version.
//   - TARBALL_SHA256 line MUST be left untouched (release.yml owns that sync).
//   - When install.sh is absent (consumer fixture), bump-version logs SKIPPED
//     and continues without error.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const isWindows = process.platform === 'win32';

import { makeBumpFixture, runBump } from './_bump-version-helpers.js';

const SAMPLE_INSTALL_SH = `#!/bin/sh
# install.sh — POSIX install for TestAtlas.
set -eu

VERSION="1.0.0"
TARBALL_SHA256="REPLACE_AT_RELEASE"
TARBALL_URL="https://example.test/-/testatlas-\${VERSION}.tgz"

_main() { :; }
_main "$@"
`;

test('bump-version --patch --dry-run lists install.sh in the change set', {
  skip: isWindows,
}, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  await writeFile(path.join(fx.cwd, 'install.sh'), SAMPLE_INSTALL_SH, 'utf8');

  const r = runBump(fx.cwd, ['--patch', '--dry-run', '--skip-gates', '--force-dirty']);
  assert.equal(r.status, 0, `bump-version dry-run failed:\n${r.stderr}`);

  const out = `${r.stdout}\n${r.stderr}`;
  assert.match(
    out,
    /install\.sh.*VERSION/i,
    `expected install.sh in dry-run change set; got:\n${out}`,
  );
});

test('bump-version --patch (real run) rewrites install.sh VERSION line and leaves TARBALL_SHA256 untouched', {
  skip: isWindows,
}, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  await writeFile(path.join(fx.cwd, 'install.sh'), SAMPLE_INSTALL_SH, 'utf8');

  const r = runBump(fx.cwd, [
    '--patch',
    '--no-tag',
    '--no-commit',
    '--skip-gates',
    '--force-dirty',
  ]);
  assert.equal(r.status, 0, `bump-version failed:\n${r.stdout}\n${r.stderr}`);

  const updated = await readFile(path.join(fx.cwd, 'install.sh'), 'utf8');
  // Version bumped to 1.0.1.
  assert.match(updated, /^VERSION="1\.0\.1"$/m, `VERSION not bumped:\n${updated}`);
  // Sha left untouched.
  assert.match(
    updated,
    /^TARBALL_SHA256="REPLACE_AT_RELEASE"$/m,
    `TARBALL_SHA256 must NOT be touched by bump-version (release.yml owns it):\n${updated}`,
  );
});

test('bump-version skips install.sh sync when file is absent (consumer fixture)', {
  skip: isWindows,
}, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  // No install.sh in fixture.
  const r = runBump(fx.cwd, ['--patch', '--dry-run', '--skip-gates']);
  assert.equal(r.status, 0, `bump-version should not refuse on missing install.sh:\n${r.stderr}`);
  // Should not assert "install.sh: VERSION:" anywhere; absence is silent or SKIPPED.
});
