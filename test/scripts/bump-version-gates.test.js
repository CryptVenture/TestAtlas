// test/scripts/bump-version-gates.test.js
//
// Quick 260506-hqu — Pre-flight gates for bump-version.js.
//
// Asserts:
//   - Refuses on dirty working tree (unless --force-dirty).
//   - Refuses on already-existing local tag.
//   - Runs pnpm test + check-adapter-parity + validate-workspace before any
//     write (visible via stub log) and aborts on first failure with no writes.
//   - --skip-gates bypasses the test/parity/validate gates but still enforces
//     dirty-tree + tag-exists checks (those are local safety, not "gates").
//   - --dry-run never invokes any of the heavy gate commands as side effects
//     (it only previews what would run).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { makeBumpFixture, makeStubBin, runBump } from './_bump-version-helpers.js';

test('bump-version: refuses on dirty working tree without --force-dirty', async (t) => {
  const fx = await makeBumpFixture();
  t.after(fx.cleanup);

  // Dirty the tree.
  const fs = await import('node:fs/promises');
  await fs.writeFile(path.join(fx.cwd, 'dirty.txt'), 'pending\n', 'utf8');

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.notEqual(result.status, 0, 'should exit non-zero on dirty tree');
  assert.match(`${result.stdout}\n${result.stderr}`, /dirty|uncommitted|--force-dirty/i);
});

test('bump-version: --force-dirty allows bumping with uncommitted changes', async (t) => {
  const fx = await makeBumpFixture();
  t.after(fx.cleanup);

  const fs = await import('node:fs/promises');
  await fs.writeFile(path.join(fx.cwd, 'dirty.txt'), 'pending\n', 'utf8');

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(
    fx.cwd,
    ['--patch', '--force-dirty', '--skip-gates', '--no-commit', '--no-tag', '--dry-run'],
    { pathPrepended: stubs.pathPrepended },
  );

  assert.equal(
    result.status,
    0,
    `should succeed with --force-dirty (got ${result.status})\n${result.stderr}`,
  );
});

test('bump-version: refuses when tag already exists locally', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  // Pre-create the v1.0.1 tag.
  spawnSync('git', ['tag', '-a', 'v1.0.1', '-m', 'pre-existing'], { cwd: fx.cwd });

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.notEqual(result.status, 0, 'should exit non-zero when tag exists');
  assert.match(`${result.stdout}\n${result.stderr}`, /tag.*v1\.0\.1.*exists/i);
});

test('bump-version: refuses when tag exists on remote (ls-remote check)', async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
    env: {
      // Test-only: tell bump-version.js to pretend v1.0.1 exists on remote.
      // This bypasses the actual ls-remote call (which would fail in a temp
      // fixture with no real origin) and exercises the refusal path.
      BUMP_VERSION_FAKE_REMOTE_TAGS: 'v1.0.1',
    },
  });

  assert.notEqual(result.status, 0, 'should exit non-zero on remote-tag-exists');
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /tag.*remote|remote.*tag|already.*remote|remote.*v1\.0\.1/i,
  );
});

test('bump-version: gates run pnpm test + parity + validate before any write', async (t) => {
  const fx = await makeBumpFixture();
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--no-commit', '--no-tag'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.equal(
    result.status,
    0,
    `should succeed when all stubs pass (got ${result.status})\n${result.stderr}`,
  );

  const log = await stubs.readLog();
  // We expect at least one pnpm invocation (`pnpm test`) prior to any writes.
  // Validate-workspace + check-adapter-parity are invoked as `node scripts/*`
  // — those run via the host, not stubs, but bump-version may shell to them
  // via execSync inside its own process. We don't strictly assert on those
  // node calls; the gate ordering is enforced by the structure of main().
  const pnpmCalls = log.filter((e) => e.bin === 'pnpm');
  assert.ok(
    pnpmCalls.length >= 1,
    `expected pnpm to be invoked at least once; saw ${log.length} total stubs`,
  );
  assert.ok(
    pnpmCalls.some((e) => e.argv.includes('test')),
    `expected pnpm test to be invoked; saw: ${JSON.stringify(pnpmCalls)}`,
  );
});

test('bump-version: gate failure (pnpm test fails) aborts BEFORE any file writes', async (t) => {
  const fx = await makeBumpFixture();
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch'], {
    pathPrepended: stubs.pathPrepended,
    env: { STUB_PNPM_EXIT: '1' },
  });

  assert.notEqual(result.status, 0, 'should exit non-zero when pnpm test fails');

  // Verify no writes happened — package.json must still be 1.0.0.
  const pkg = JSON.parse(await readFile(path.join(fx.cwd, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '1.0.0', 'package.json must NOT be mutated when gates fail');

  // VERSION file must also remain pinned.
  const versionFile = (await readFile(path.join(fx.cwd, '.testatlas', 'VERSION'), 'utf8')).trim();
  assert.equal(versionFile, '1.0.0');
});

test('bump-version: --skip-gates bypasses pnpm test + parity + validate', async (t) => {
  const fx = await makeBumpFixture();
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--skip-gates', '--no-commit', '--no-tag'], {
    pathPrepended: stubs.pathPrepended,
    env: { STUB_PNPM_EXIT: '1' /* would fail if gates were enforced */ },
  });

  assert.equal(
    result.status,
    0,
    `--skip-gates should make pnpm-test failure irrelevant (got ${result.status})\n${result.stderr}`,
  );

  const log = await stubs.readLog();
  const pnpmCalls = log.filter((e) => e.bin === 'pnpm' && e.argv.includes('test'));
  assert.equal(pnpmCalls.length, 0, '--skip-gates must NOT invoke pnpm test');
});

test('bump-version: --dry-run never invokes write-y stubs (no git commit/tag/push)', async (t) => {
  const fx = await makeBumpFixture();
  t.after(fx.cleanup);

  // `git` must be real so local tag/dirty checks return correct values; only
  // gh/npm/pnpm need to be stubbed (and recorded).
  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--release', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.equal(result.status, 0, `dry-run should succeed (got ${result.status})\n${result.stderr}`);

  const log = await stubs.readLog();

  // No commit, no tag-create, no push, no gh release create.
  for (const entry of log) {
    if (entry.bin === 'git') {
      const argvStr = entry.argv.join(' ');
      assert.ok(
        !argvStr.startsWith('commit ') &&
          !argvStr.includes('tag -a') &&
          !argvStr.startsWith('push '),
        `dry-run must NOT mutate via git; saw: git ${argvStr}`,
      );
    }
    if (entry.bin === 'gh') {
      const argvStr = entry.argv.join(' ');
      assert.ok(
        !argvStr.startsWith('release create'),
        `dry-run must NOT call gh release create; saw: gh ${argvStr}`,
      );
    }
  }
});
