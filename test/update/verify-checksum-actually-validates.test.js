// test/update/verify-checksum-actually-validates.test.js
//
// Plan 12-01 Task 1 (RED). Regression suite asserting that `runUpdate`
// ACTUALLY validates the SHA-256 checksum (ISSUE-017) and ACTUALLY invokes
// cosign (ISSUE-016) when the corresponding flags are set, AND preserves the
// default-opt-in invariant (no cosign / no sidecar fetch when flags absent).
//
// These tests RED until Task 3 (GREEN-B) wires the verification chain into
// update-core.js. They use _testHooks injection on tarballMod and
// updateCoreMod (no real network, no real cosign binary). The downloaded
// tarball is a tiny fixture file we synthesize on disk and pre-compute the
// SHA-256 of for the success-path test.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as tarballMod from '../../scripts/lib/tarball.js';
import * as updateCoreMod from '../../scripts/lib/update-core.js';

const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT_FOR_CONFIG = path.resolve(__dirname2, '..', '..');

let tmp;

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'verify-checksum-'));
  // Phase 18-01 / ISSUE-011: seed gate prerequisites + permissive override.
  await mkdir(path.join(tmp, '.testatlas'), { recursive: true });
  await cp(
    path.join(SUITE_ROOT_FOR_CONFIG, '.testatlas', 'default.config.json'),
    path.join(tmp, '.testatlas', 'default.config.json'),
  );
  await cp(
    path.join(SUITE_ROOT_FOR_CONFIG, '.testatlas', 'config.schema.json'),
    path.join(tmp, '.testatlas', 'config.schema.json'),
  );
  await writeFile(
    path.join(tmp, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );
});

afterEach(async () => {
  for (const k of Object.keys(tarballMod._testHooks)) {
    delete tarballMod._testHooks[k];
  }
  for (const k of Object.keys(updateCoreMod._testHooks)) {
    delete updateCoreMod._testHooks[k];
  }
  await rm(tmp, { recursive: true, force: true });
});

// Common harness: install a tarball-download hook that writes a known body
// to disk + injects a sha-fetch hook returning either the matching or a
// mismatching SHA. The hooks live on tarballMod's _testHooks (downloadTarball
// already supports this seam from Plan 07-03).
async function setupDownloadedTarball(body) {
  // Writes to a synthesized tarball path; the runUpdate flow will call into
  // its tarballDownload hook + extractTarball hook below.
  const fakeBody = Buffer.from(body);
  tarballMod._testHooks.downloadTarball = async (_v, dst) => {
    await writeFile(dst, fakeBody);
    return dst;
  };
  // No-op extract — the post-extract migrations + swap need the staging dir
  // to look real; we short-circuit by injecting an extract that just creates
  // the dir.
  tarballMod._testHooks.extractTarball = async (_tar, dstDir) => {
    // Minimal viable suite-tree shape so post-extract steps can proceed.
    // For checksum-validation tests we don't actually need migrations to
    // run; we accept any error AFTER verification has been attempted.
    await writeFile(path.join(dstDir, '.placeholder'), '');
  };
  return sha256(fakeBody);
}

test('Test A — runUpdate with verifyChecksum:true and matching sidecar SHA succeeds (no halt at verification stage)', async () => {
  const goodSha = await setupDownloadedTarball('hello-world-tarball');
  let shaFetchCalled = false;
  tarballMod._testHooks.fetchExpectedSha = async () => {
    shaFetchCalled = true;
    return goodSha;
  };

  // runUpdate may still fail at later stages (rename of non-existent
  // .testatlas/, migrations etc.) — we only assert that verification
  // didn't halt with TESTATLAS_CHECKSUM_MISMATCH.
  let err = null;
  try {
    await updateCoreMod.runUpdate({
      target: tmp,
      currentVersion: '0.0.1',
      latestVersion: '1.0.0',
      verifyChecksum: true,
      noUpdateCheck: true,
      logger: () => {},
    });
  } catch (e) {
    err = e;
  }
  assert.ok(shaFetchCalled, 'fetchExpectedSha must be invoked when verifyChecksum:true');
  if (err) {
    assert.notEqual(
      err.code,
      'TESTATLAS_CHECKSUM_MISMATCH',
      `expected no checksum mismatch (matching SHA), got ${err.code}: ${err.message}`,
    );
  }
});

test('Test B — runUpdate with verifyChecksum:true and mismatching sidecar SHA halts with TESTATLAS_CHECKSUM_MISMATCH', async () => {
  await setupDownloadedTarball('actual-bytes');
  // Return a SHA that does NOT match the actual body's SHA.
  tarballMod._testHooks.fetchExpectedSha = async () => 'a'.repeat(64);

  await assert.rejects(
    updateCoreMod.runUpdate({
      target: tmp,
      currentVersion: '0.0.1',
      latestVersion: '1.0.0',
      verifyChecksum: true,
      noUpdateCheck: true,
      logger: () => {},
    }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_CHECKSUM_MISMATCH');
      return true;
    },
  );
});

test('Test C — runUpdate with verifyChecksum:true and sidecar fetch failure halts with TESTATLAS_SHA_SIDECAR_UNAVAILABLE', async () => {
  await setupDownloadedTarball('actual-bytes');
  tarballMod._testHooks.fetchExpectedSha = async () => {
    const e = new Error('simulated 404');
    e.code = 'TESTATLAS_SHA_SIDECAR_UNAVAILABLE';
    throw e;
  };

  await assert.rejects(
    updateCoreMod.runUpdate({
      target: tmp,
      currentVersion: '0.0.1',
      latestVersion: '1.0.0',
      verifyChecksum: true,
      noUpdateCheck: true,
      logger: () => {},
    }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_SHA_SIDECAR_UNAVAILABLE');
      return true;
    },
  );
});

test('Test D — DEFAULT-OPT-IN invariant: runUpdate without verifySignature/verifyChecksum invokes neither cosign nor sidecar fetch', async () => {
  await setupDownloadedTarball('any-bytes');
  let cosignCalls = 0;
  let shaFetchCalls = 0;
  let bundleFetchCalls = 0;
  tarballMod._testHooks.verifyCosignAttestation = async () => {
    cosignCalls += 1;
  };
  tarballMod._testHooks.fetchExpectedSha = async () => {
    shaFetchCalls += 1;
    return 'a'.repeat(64);
  };
  tarballMod._testHooks.fetchSigstoreBundle = async () => {
    bundleFetchCalls += 1;
    return null;
  };

  // No verifySignature, no verifyChecksum. runUpdate may still fail at later
  // stages — we only assert the counters remain at zero through the
  // verification-decision point.
  try {
    await updateCoreMod.runUpdate({
      target: tmp,
      currentVersion: '0.0.1',
      latestVersion: '1.0.0',
      noUpdateCheck: true,
      logger: () => {},
    });
  } catch {
    // Ignore later-stage failures (e.g., missing .testatlas/ for the swap).
  }

  assert.equal(
    cosignCalls,
    0,
    'cosign must NOT be invoked when --verify-signature is not set (default opt-in)',
  );
  assert.equal(
    bundleFetchCalls,
    0,
    'sigstore bundle must NOT be fetched when --verify-signature is not set',
  );
  assert.equal(
    shaFetchCalls,
    0,
    'sha sidecar must NOT be fetched when --verify-checksum is not set (default opt-in)',
  );
});
