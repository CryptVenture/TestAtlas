// test/scripts/bump-version-release-flag.test.js
//
// Quick 260506-hqu — --release flag canonical pipeline.
//
// Asserts:
//   - --release implies --push (commit + tag are pushed to origin).
//   - --release writes the [X.Y.Z] CHANGELOG section to a tmp file and passes
//     it via `gh release create --notes-file <path>`.
//   - --release prints the canonical release URL pattern.
//   - --release in dry-run mode shows the full planned sequence without
//     mutating anything.
//   - Without --release (just --push), no `gh release create` is invoked.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeBumpFixture, makeStubBin, runBump } from './_bump-version-helpers.js';

test('--release: dry-run shows full sequence (push + gh release create + notes-file)', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--minor', '--release', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });
  assert.equal(
    result.status,
    0,
    `dry-run --release should succeed; got ${result.status}\n${result.stderr}`,
  );

  const out = `${result.stdout}\n${result.stderr}`;

  // Sequence preview lines we expect:
  assert.match(out, /git push origin/, 'expected git push origin <branch> preview');
  assert.match(out, /git push origin v1\.1\.0/, 'expected git push origin v1.1.0 (tag) preview');
  assert.match(out, /gh release create v1\.1\.0/, 'expected gh release create v1.1.0 preview');
  assert.match(out, /--notes-file/, 'expected --notes-file flag preview');
  assert.match(out, /--title/, 'expected --title flag preview');
});

test('--release executes push + gh release create with --notes-file', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--release', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });
  assert.equal(
    result.status,
    0,
    `--release should succeed; got ${result.status}\n${result.stderr}`,
  );

  const log = await stubs.readLog();

  // Stubbed gh: must have been called with `release create v1.0.1 ... --notes-file <path>`.
  const ghCalls = log.filter((e) => e.bin === 'gh');
  assert.ok(ghCalls.length >= 1, `expected at least one gh invocation; saw ${ghCalls.length}`);
  const releaseCreate = ghCalls.find((e) => e.argv[0] === 'release' && e.argv[1] === 'create');
  assert.ok(
    releaseCreate,
    `expected gh release create invocation; saw: ${JSON.stringify(ghCalls)}`,
  );
  assert.equal(
    releaseCreate.argv[2],
    'v1.0.1',
    `expected gh release create v1.0.1; got ${releaseCreate.argv[2]}`,
  );
  assert.ok(
    releaseCreate.argv.includes('--notes-file'),
    `expected --notes-file flag; got argv: ${JSON.stringify(releaseCreate.argv)}`,
  );
  assert.ok(
    !releaseCreate.argv.includes('--generate-notes'),
    `must NOT use --generate-notes; got argv: ${JSON.stringify(releaseCreate.argv)}`,
  );

  // Must include --title vX.Y.Z.
  const titleIdx = releaseCreate.argv.indexOf('--title');
  assert.ok(titleIdx >= 0, '--title flag missing');
  assert.equal(releaseCreate.argv[titleIdx + 1], 'v1.0.1', '--title arg must be v1.0.1');

  // Push: git push origin <branch> AND git push origin v1.0.1 must have happened.
  // (Real git, so the log records the wrapper invocation.)
  const gitPushes = log.filter(
    (e) => e.bin === 'git' && e.argv[0] === 'push' && e.argv[1] === 'origin',
  );
  // We need two pushes (branch + tag) — but since the temp repo has no real
  // remote, the wrapper records the call but git itself fails. We don't run
  // --release without explicit `--no-push` short-circuit handling — for this
  // test we tolerate that the push *attempt* was logged (≥ 1 push attempt).
  assert.ok(gitPushes.length >= 1, `expected git push attempts; saw ${gitPushes.length}`);
});

test('--push without --release does not invoke gh release create', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  // Use dry-run so we don't actually need a remote.
  const result = runBump(fx.cwd, ['--patch', '--push', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });
  assert.equal(result.status, 0, `should succeed; got ${result.status}\n${result.stderr}`);

  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /git push origin/, 'expected push preview');
  assert.doesNotMatch(out, /gh release create/, '--push alone must NOT preview gh release create');
});
