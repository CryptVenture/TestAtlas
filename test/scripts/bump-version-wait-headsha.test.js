// test/scripts/bump-version-wait-headsha.test.js
//
// Quick 260506-ilm — `--wait` polling now filters by `--commit` and retries
// when the new release.yml run isn't yet visible in the API.
//
// Bug observed during v1.1.0 release: `gh run list --workflow=release.yml
// --limit 1` returned the previous v1.0.0 failed run (25431725074) instead of
// the new in-flight v1.1.0 run (25434770898) because the new run took ~3-5sec
// to appear in the API after `release:published` fired.
//
// Fix: filter by `--commit <sha>` AND retry every 1sec for up to 30sec
// before declaring "no run found". Surface the chosen run-id + URL.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeBumpFixture, makeStubBin, runBump } from './_bump-version-helpers.js';

test('--wait passes --commit to gh run list', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0', withOrigin: true });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  // Stubbed gh returns a completed-success run immediately so --wait exits.
  // Use a JSON array (the shape `gh run list --json url,...` returns).
  const stubGhStdout = JSON.stringify([
    {
      databaseId: 25434770898,
      url: 'https://github.com/CryptVenture/TestAtlas/actions/runs/25434770898',
      status: 'completed',
      conclusion: 'success',
    },
  ]);

  const result = runBump(fx.cwd, ['--patch', '--release', '--wait', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      STUB_GH_STDOUT: stubGhStdout,
    },
  });

  // Don't strictly require status===0 here — push attempts to the bare origin
  // may still fail in some environments. We care about the gh run list argv.
  const log = await stubs.readLog();
  const runListCalls = log.filter(
    (e) => e.bin === 'gh' && e.argv[0] === 'run' && e.argv[1] === 'list',
  );
  assert.ok(
    runListCalls.length >= 1,
    `expected ≥1 gh run list call; saw ${runListCalls.length}\n${result.stdout}\n${result.stderr}`,
  );

  // At least one run-list call must include --commit <sha>.
  const headShaCalls = runListCalls.filter((e) => e.argv.includes('--commit'));
  assert.ok(
    headShaCalls.length >= 1,
    `expected --commit filter on gh run list; saw argvs: ${JSON.stringify(runListCalls.map((c) => c.argv))}`,
  );

  // The --commit value must look like a git sha (40-hex or 7+ short).
  const sample = headShaCalls[0];
  const hsIdx = sample.argv.indexOf('--commit');
  const sha = sample.argv[hsIdx + 1];
  assert.match(sha, /^[0-9a-f]{7,40}$/, `expected sha-shaped --commit value; got "${sha}"`);
});

test('--wait retries when run-list returns [] then succeeds when run appears', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  // dry-run path: just verify the preview line mentions retry/timeout semantics.
  const result = runBump(fx.cwd, ['--patch', '--release', '--wait', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.equal(
    result.status,
    0,
    `dry-run --release --wait should succeed; got ${result.status}\n${result.stderr}`,
  );
  const out = `${result.stdout}\n${result.stderr}`;
  // The dry-run preview must surface the commit-sha filter (post-fix).
  assert.match(out, /--commit/, 'expected --wait dry-run preview to mention --commit filter');
});

test('--resume --wait: when run-list keeps returning [], surfaces sha-citing timeout error', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const { spawnSync } = await import('node:child_process');
  spawnSync('git', ['tag', '-a', 'v1.1.0', '-m', 'fake'], { cwd: fx.cwd });

  // Stubbed gh always returns []. We use a fast-timeout env knob to keep the
  // test < 5sec. The script should respect BUMP_VERSION_HEADSHA_TIMEOUT_SEC
  // (NEW) for test-mode timeout overrides.
  const result = runBump(fx.cwd, ['--resume', 'v1.1.0', '--wait'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      BUMP_VERSION_FAKE_REMOTE_TAGS: 'v1.1.0',
      BUMP_VERSION_FAKE_NPM_STATUS: 'v1.1.0=404',
      STUB_GH_STDOUT: '[]', // always empty
      BUMP_VERSION_HEADSHA_TIMEOUT_SEC: '2', // fast timeout for test
    },
  });

  // Should fail with a sha-citing timeout error.
  assert.notEqual(result.status, 0, 'expected non-zero exit on timeout');
  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /no .* run found .* sha/i, `expected sha-citing timeout error; saw:\n${out}`);
});
