// test/install/install-core-validate-script.test.js
//
// Quick 260504-r3q Task 2. Coverage for the new `copyValidatorScripts` step
// inside `runInit` — the validator runtime + lib closure must land at
// <target>/.testatlas/scripts/ with manifest entries (type:'suite'), and a
// missing source file must cause a silent skip (not an install failure).

import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit, SUITE_SCRIPTS_TO_COPY } from '../../scripts/lib/install-core.js';
import { loadAndValidateManifest } from '../../scripts/lib/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const QUIET = () => {};

async function withTmp(t, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-validate-copy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

test('install-core(validator-copy): every SUITE_SCRIPTS_TO_COPY entry lands at <target>/.testatlas/<src-rel>', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      logger: QUIET,
    });
    assert.equal(result.status, 'installed');

    for (const srcRel of SUITE_SCRIPTS_TO_COPY) {
      const dst = path.join(target, '.testatlas', srcRel);
      const st = await stat(dst).catch(() => null);
      assert.ok(st?.isFile(), `expected ${srcRel} to be copied to ${dst}`);
    }

    // The validator's lib/validate/ directory must contain at least one
    // check-*.js (dynamic copy step). The check enumerates whatever is on
    // disk at copy time so we don't pin the count, but at minimum the
    // canonical-files check must be present.
    const checkPath = path.join(
      target,
      '.testatlas',
      'scripts',
      'lib',
      'validate',
      'check-canonical-files.js',
    );
    const st = await stat(checkPath).catch(() => null);
    assert.ok(st?.isFile(), `expected check-canonical-files.js at ${checkPath}`);
  });
});

test('install-core(validator-copy): every copied file is manifest-tracked under type:"suite"', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      logger: QUIET,
    });
    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });

    // Every static closure entry must be present with type:'suite'.
    for (const srcRel of SUITE_SCRIPTS_TO_COPY) {
      // Manifest paths are POSIX; the destination is .testatlas/<srcRel>.
      const expectedPath = `.testatlas/${srcRel}`;
      const entry = manifest.files.find((f) => f.path === expectedPath);
      assert.ok(
        entry,
        `expected manifest entry for ${expectedPath}; got: ${manifest.files
          .map((f) => f.path)
          .filter((p) => p.includes('/scripts/'))
          .join(', ')}`,
      );
      assert.equal(
        entry.type,
        'suite',
        `expected type:'suite' for ${expectedPath}, got '${entry.type}'`,
      );
    }

    // At least one check-*.js entry must be tracked too (dynamic copy step).
    const checkEntry = manifest.files.find(
      (f) =>
        f.path === '.testatlas/scripts/lib/validate/check-canonical-files.js' && f.type === 'suite',
    );
    assert.ok(checkEntry, 'expected manifest entry for check-canonical-files.js with type:"suite"');
  });
});

test('install-core(validator-copy): missing source file is silently skipped (feature-check guard)', async (t) => {
  // Stage a fixture suiteRoot by cloning the real repo's `.testatlas/`,
  // `scripts/`, and `package.json` into a temp dir, then deleting one of the
  // closure sources. Pointing runInit at this fixture exercises the
  // feature-check guard without mutating the live repo (which would corrupt
  // sibling tests running in parallel via node:test's file-level concurrency).
  const fixture = await mkdtemp(path.join(tmpdir(), 'testatlas-r3q-fixture-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));

  for (const dir of ['.testatlas', 'scripts']) {
    await cp(path.join(REPO_ROOT, dir), path.join(fixture, dir), { recursive: true });
  }
  await cp(path.join(REPO_ROOT, 'package.json'), path.join(fixture, 'package.json'));

  // Hide one closure source — markers.js — from the fixture suite. It's only
  // used by the validator runtime, so removing it from the fixture doesn't
  // affect anything else `runInit` reads.
  await unlink(path.join(fixture, 'scripts', 'lib', 'markers.js'));

  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: fixture,
      adapters: ['claude-code'],
      logger: QUIET,
    });
    assert.equal(result.status, 'installed', 'install must succeed despite missing closure file');

    // Other closure files must still be copied (e.g. the entry).
    const present = path.join(target, '.testatlas', 'scripts', 'validate-workspace.js');
    const st = await stat(present).catch(() => null);
    assert.ok(st?.isFile(), 'remaining closure files must still be copied');

    // The missing source must NOT have produced a manifest entry.
    const manifest = await loadAndValidateManifest(target, { cwd: fixture });
    const orphan = manifest.files.find((f) => f.path === '.testatlas/scripts/lib/markers.js');
    assert.equal(orphan, undefined, 'missing source must not have a manifest entry');
  });
});
