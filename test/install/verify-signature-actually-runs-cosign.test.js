// test/install/verify-signature-actually-runs-cosign.test.js
//
// Plan 12-01 Task 1 (RED). Regression suite asserting that the npx-flow
// kernels (`runInit`, `runAddAdapter`) ACTUALLY invoke
// `cosign verify-blob-attestation` against the npm-cached tarball when
// `verifySignature: true` is passed (ISSUE-016 — silent no-op fix), and that
// the documented sentinel error codes are thrown when the cached tarball
// can't be resolved or when cosign is missing on PATH.
//
// These tests RED until Task 4 (GREEN-C) wires the verification chain into
// install-core.js + add-adapter-core.js. They use module-level _testHooks
// for spy injection (no real network, no real cosign binary, no real npm
// cache walk).

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import * as addAdapterCore from '../../scripts/lib/add-adapter-core.js';
import * as installCore from '../../scripts/lib/install-core.js';
import * as tarballMod from '../../scripts/lib/tarball.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

let tmp;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'verify-sig-actually-runs-'));
});

afterEach(async () => {
  // Reset hooks so per-test injection doesn't bleed.
  for (const k of Object.keys(tarballMod._testHooks)) {
    delete tarballMod._testHooks[k];
  }
  if (installCore._testHooks) {
    for (const k of Object.keys(installCore._testHooks)) {
      delete installCore._testHooks[k];
    }
  }
  if (addAdapterCore._testHooks) {
    for (const k of Object.keys(addAdapterCore._testHooks)) {
      delete addAdapterCore._testHooks[k];
    }
  }
  await rm(tmp, { recursive: true, force: true });
});

test('Test A — runInit with verifySignature:true invokes cosign verify-blob-attestation against the resolved cached tarball', async () => {
  // Inject spy hooks. Production code must call these via the module-level
  // _testHooks objects.
  let cosignCalledWith = null;
  let bundleFetchedFor = null;
  tarballMod._testHooks.verifyCosignAttestation = async (tarballPath, bundlePath) => {
    cosignCalledWith = { tarballPath, bundlePath };
  };
  tarballMod._testHooks.fetchSigstoreBundle = async (version, outPath) => {
    bundleFetchedFor = { version, outPath };
    return outPath;
  };

  const fakeCachedTarball = path.join(tmp, 'cached-testatlas-1.0.0.tgz');
  await writeFile(fakeCachedTarball, 'fake-tarball-bytes');

  installCore._testHooks ??= {};
  installCore._testHooks.resolveCachedTarball = async () => fakeCachedTarball;
  installCore._testHooks.probeCosign = async () => true;

  await installCore.runInit({
    target: tmp,
    suiteRoot: REPO_ROOT,
    verifySignature: true,
    dryRun: true,
    logger: () => {},
  });

  assert.ok(cosignCalledWith, 'verifyCosignAttestation must be invoked when verifySignature:true');
  assert.equal(
    cosignCalledWith.tarballPath,
    fakeCachedTarball,
    'tarball path passed to cosign must be the resolved cached tarball',
  );
  assert.match(
    cosignCalledWith.tarballPath,
    /testatlas.*\.tgz$/,
    'tarball path should look like a real testatlas .tgz',
  );
  assert.ok(
    bundleFetchedFor,
    'fetchSigstoreBundle must be invoked to obtain the .sigstore.json sidecar',
  );
});

test('Test B — runInit with verifySignature:true and unresolvable cached tarball halts with TESTATLAS_INIT_TARBALL_UNAVAILABLE', async () => {
  installCore._testHooks ??= {};
  installCore._testHooks.resolveCachedTarball = async () => null;
  installCore._testHooks.probeCosign = async () => true;

  await assert.rejects(
    installCore.runInit({
      target: tmp,
      suiteRoot: REPO_ROOT,
      verifySignature: true,
      dryRun: true,
      logger: () => {},
    }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_INIT_TARBALL_UNAVAILABLE');
      return true;
    },
  );
});

test('Test C — runInit with verifySignature:true and probeCosign returning false halts with TESTATLAS_COSIGN_NOT_FOUND', async () => {
  installCore._testHooks ??= {};
  installCore._testHooks.probeCosign = async () => false;
  // Even if cached-tarball would resolve, the probe should gate first.
  installCore._testHooks.resolveCachedTarball = async () => path.join(tmp, 'fake.tgz');

  await assert.rejects(
    installCore.runInit({
      target: tmp,
      suiteRoot: REPO_ROOT,
      verifySignature: true,
      dryRun: true,
      logger: () => {},
    }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_COSIGN_NOT_FOUND');
      return true;
    },
  );
});

test('Test E1 — runAddAdapter with verifySignature:true invokes cosign verify-blob-attestation', async () => {
  let cosignCalledWith = null;
  tarballMod._testHooks.verifyCosignAttestation = async (tarballPath, bundlePath) => {
    cosignCalledWith = { tarballPath, bundlePath };
  };
  tarballMod._testHooks.fetchSigstoreBundle = async (_v, outPath) => outPath;

  const fakeCachedTarball = path.join(tmp, 'cached-testatlas-1.0.0.tgz');
  await writeFile(fakeCachedTarball, 'fake-tarball-bytes');

  addAdapterCore._testHooks ??= {};
  addAdapterCore._testHooks.resolveCachedTarball = async () => fakeCachedTarball;
  addAdapterCore._testHooks.probeCosign = async () => true;

  // runAddAdapter normally requires an existing manifest. With verifySignature
  // the kernel should run cosign FIRST (defense-in-depth) and only then fall
  // through to the manifest-load path; we don't get past dry-run path because
  // there's no manifest. Test asserts cosign was invoked regardless.
  try {
    await addAdapterCore.runAddAdapter({
      target: tmp,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      verifySignature: true,
      dryRun: true,
      logger: () => {},
    });
  } catch {
    // Manifest-missing error is acceptable for THIS assertion — we only care
    // that cosign was invoked. If implementation places cosign AFTER the
    // manifest-load, this test still has a clear failure mode (cosignCalledWith
    // remains null and the assert below fails).
  }

  assert.ok(
    cosignCalledWith,
    'runAddAdapter must invoke verifyCosignAttestation when verifySignature:true',
  );
  assert.equal(cosignCalledWith.tarballPath, fakeCachedTarball);
});

test('Test E2 — runAddAdapter with verifySignature:true and unresolvable cached tarball halts with TESTATLAS_INIT_TARBALL_UNAVAILABLE', async () => {
  addAdapterCore._testHooks ??= {};
  addAdapterCore._testHooks.resolveCachedTarball = async () => null;
  addAdapterCore._testHooks.probeCosign = async () => true;

  await assert.rejects(
    addAdapterCore.runAddAdapter({
      target: tmp,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      verifySignature: true,
      dryRun: true,
      logger: () => {},
    }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_INIT_TARBALL_UNAVAILABLE');
      return true;
    },
  );
});
