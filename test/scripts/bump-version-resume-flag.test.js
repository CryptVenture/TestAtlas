// test/scripts/bump-version-resume-flag.test.js
//
// Quick 260506-ilm — `--resume <tag>` flag for half-state release recovery.
//
// Asserts:
//   - Tag missing on origin → exits 1 with clear error
//   - Already-published version → exits 1 ("Already published. … nothing to resume.")
//   - Unpublished version + existing tag + GH release → state-detection summary
//     + `[dry-run] Would run: gh workflow run release.yml -f dry-run=false --ref <tag>`,
//     exit 0, no workflow trigger
//   - `--resume … --wait --dry-run` → adds `[dry-run] Would poll: gh run list ...`
//   - `--resume + --minor` → exits 2 with combination-refusal error
//
// Mocking:
//   - `BUMP_VERSION_FAKE_REMOTE_TAGS` env var (already supported) supplies which
//     tags `git ls-remote --tags origin <tag>` should report as present.
//   - `BUMP_VERSION_FAKE_NPM_STATUS` env var (NEW) supplies the registry HTTP
//     status the script should report when probing
//     `https://registry.npmjs.org/@webventures/testatlas/<version>`. Format:
//     `<version>=<status>` newline-separated. Default = 404 (unpublished) for
//     any version not listed.
//   - `gh` stub via STUB_GH_STDOUT/STUB_GH_EXIT controls `gh release view` +
//     `gh workflow run` results.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeBumpFixture, makeStubBin, runBump } from './_bump-version-helpers.js';

test('--resume v9.9.9 against missing tag → exits 1 with "not found on origin"', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--resume', 'v9.9.9', '--dry-run'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      BUMP_VERSION_FAKE_REMOTE_TAGS: '', // no tags exist
      BUMP_VERSION_FAKE_NPM_STATUS: 'v9.9.9=404',
    },
  });

  assert.equal(
    result.status,
    1,
    `expected exit 1; got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /v9\.9\.9 not found on origin/i, 'expected "not found on origin" error');
});

test('--resume v1.0.0 against an already-published version → exits 1 ("Already published")', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--resume', 'v1.0.0', '--dry-run'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      BUMP_VERSION_FAKE_REMOTE_TAGS: 'v1.0.0',
      BUMP_VERSION_FAKE_NPM_STATUS: 'v1.0.0=200',
      STUB_GH_STDOUT: '{"tagName":"v1.0.0"}', // gh release view succeeds
    },
  });

  assert.equal(
    result.status,
    1,
    `expected exit 1; got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /already published/i, 'expected "Already published" error');
  assert.match(out, /nothing to resume/i, 'expected "nothing to resume" message');
});

test('--resume v1.1.0 dry-run against unpublished version → state summary + planned workflow_dispatch', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  // Create a local tag so `git rev-parse v1.1.0^{}` resolves; bump-version
  // should still consult origin for "exists" but use local rev-parse for sha.
  const { spawnSync } = await import('node:child_process');
  spawnSync('git', ['tag', '-a', 'v1.1.0', '-m', 'fake'], { cwd: fx.cwd });

  const result = runBump(fx.cwd, ['--resume', 'v1.1.0', '--dry-run'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      BUMP_VERSION_FAKE_REMOTE_TAGS: 'v1.1.0',
      BUMP_VERSION_FAKE_NPM_STATUS: 'v1.1.0=404',
      STUB_GH_STDOUT: '{"tagName":"v1.1.0","assets":[]}',
    },
  });

  assert.equal(
    result.status,
    0,
    `expected exit 0; got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /resume mode/i, 'expected "Resume mode" header');
  assert.match(out, /state detection/i, 'expected state-detection section');
  assert.match(out, /tag exists/i, 'expected tag-exists check');
  assert.match(out, /not published/i, 'expected npm-not-published check');
  assert.match(
    out,
    /\[dry-run\] Would run: gh workflow run release\.yml -f dry-run=false --ref v1\.1\.0/,
    'expected workflow_dispatch dry-run preview',
  );
  // Must NOT have actually triggered:
  const log = await stubs.readLog();
  const ghTriggers = log.filter(
    (e) => e.bin === 'gh' && e.argv[0] === 'workflow' && e.argv[1] === 'run',
  );
  assert.equal(ghTriggers.length, 0, `dry-run must not trigger workflow; saw ${ghTriggers.length}`);
});

test('--resume v1.1.0 --wait --dry-run → adds "Would poll: gh run list" preview', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const { spawnSync } = await import('node:child_process');
  spawnSync('git', ['tag', '-a', 'v1.1.0', '-m', 'fake'], { cwd: fx.cwd });

  const result = runBump(fx.cwd, ['--resume', 'v1.1.0', '--wait', '--dry-run'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      BUMP_VERSION_FAKE_REMOTE_TAGS: 'v1.1.0',
      BUMP_VERSION_FAKE_NPM_STATUS: 'v1.1.0=404',
      STUB_GH_STDOUT: '{"tagName":"v1.1.0","assets":[]}',
    },
  });

  assert.equal(
    result.status,
    0,
    `expected exit 0; got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(
    out,
    /\[dry-run\] Would poll: gh run list .*--commit/,
    'expected --wait dry-run to preview head-sha-filtered poll',
  );
});

test('--resume + --minor → exits 2 with combination-refusal error', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--resume', 'v1.1.0', '--minor', '--dry-run'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.equal(
    result.status,
    2,
    `expected exit 2; got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /--resume cannot be combined with/i, 'expected combination-refusal error');
});

test('--resume invalid-tag-format → exits 2 with semver-tag validation error', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--resume', 'not-a-version', '--dry-run'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.equal(
    result.status,
    2,
    `expected exit 2; got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /invalid.*tag.*format|must match.*v\d/i, 'expected semver-tag format error');
});
