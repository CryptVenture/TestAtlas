// test/scripts/bump-version-publish-deprecation.test.js
//
// Quick 260506-hqu — --publish is deprecated; emits warning suggesting --release.

import assert from 'node:assert/strict';
import { test } from 'node:test';

const isWindows = process.platform === 'win32';

import { makeBumpFixture, makeStubBin, runBump } from './_bump-version-helpers.js';

test('--publish emits deprecation warning suggesting --release', { skip: isWindows }, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  // dry-run so we don't actually try to npm publish.
  const result = runBump(fx.cwd, ['--patch', '--publish', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });

  // Should still succeed (warning, not error).
  assert.equal(result.status, 0, `dry-run should succeed; got ${result.status}\n${result.stderr}`);

  const out = `${result.stdout}\n${result.stderr}`;
  assert.match(out, /deprecated/i, 'expected --publish to emit "deprecated" warning');
  assert.match(out, /--release/, 'expected the deprecation message to suggest --release');
  assert.match(
    out,
    /OIDC|trusted publishing/i,
    'expected mention of OIDC / Trusted Publishing context',
  );
});

test('--release does not emit the --publish deprecation warning', {
  skip: isWindows,
}, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0' });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--release', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });
  assert.equal(result.status, 0, `should succeed; got ${result.status}\n${result.stderr}`);

  const out = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(
    out,
    /--publish.*deprecated/i,
    '--release should not trigger --publish deprecation',
  );
});
