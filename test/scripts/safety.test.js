// test/scripts/safety.test.js
//
// Plan 11-04 Task 1 (RED). Unit tests for the assertCapability helper
// (scripts/lib/safety.js). At RED time the module does not yet exist; tests
// fail with `assert.fail('module not on disk')`. Task 2 makes them GREEN.

import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadHelper() {
  try {
    return await import('../../scripts/lib/safety.js');
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('scripts/lib/safety.js not yet on disk — Task 2 must create it');
    }
    throw err;
  }
}

test('safety: default config — destructive-fs denied', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({}, 'destructive-fs');
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? '', /safeMode|destructive/i);
});

test('safety: safeMode:false alone — destructive-fs still denied', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({ safeMode: false }, 'destructive-fs');
  assert.equal(r.allowed, false);
});

test('safety: safeMode:false + allowDestructiveActions:true — destructive-fs allowed', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({ safeMode: false, allowDestructiveActions: true }, 'destructive-fs');
  assert.equal(r.allowed, true);
});

test('safety: safeMode:false + allowDestructiveActions:true — spawn allowed', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({ safeMode: false, allowDestructiveActions: true }, 'spawn');
  assert.equal(r.allowed, true);
});

test('safety: safeMode:false + allowProductionTesting:true — production-network allowed', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability(
    { safeMode: false, allowProductionTesting: true },
    'production-network',
  );
  assert.equal(r.allowed, true);
});

test('safety: safeMode:false + allowProductionTesting:true — destructive-fs denied (different flag)', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({ safeMode: false, allowProductionTesting: true }, 'destructive-fs');
  assert.equal(r.allowed, false);
});

test('safety: safeMode:true is master kill switch — overrides all permissions', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({ safeMode: true, allowDestructiveActions: true }, 'destructive-fs');
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? '', /safeMode/i);
});

test('safety: unknown action — denied, reason mentions unknown', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability({ safeMode: false }, 'unknown-action');
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? '', /unknown|action/i);
});

test('safety: null config — denied', async () => {
  const { assertCapability } = await loadHelper();
  const r = assertCapability(null, 'destructive-fs');
  assert.equal(r.allowed, false);
});

test('safety: fetch-write — gated on allowProductionTesting', async () => {
  const { assertCapability } = await loadHelper();
  // gated on allowProductionTesting (write-side network)
  const denied = assertCapability(
    { safeMode: false, allowDestructiveActions: true },
    'fetch-write',
  );
  assert.equal(denied.allowed, false);
  const allowed = assertCapability(
    { safeMode: false, allowProductionTesting: true },
    'fetch-write',
  );
  assert.equal(allowed.allowed, true);
});

test('safety: destructive-git — gated on allowDestructiveActions', async () => {
  const { assertCapability } = await loadHelper();
  const denied = assertCapability(
    { safeMode: false, allowProductionTesting: true },
    'destructive-git',
  );
  assert.equal(denied.allowed, false);
  const allowed = assertCapability(
    { safeMode: false, allowDestructiveActions: true },
    'destructive-git',
  );
  assert.equal(allowed.allowed, true);
});

test('safety: requireCapability throws CAPABILITY_DENIED on denial', async () => {
  const { requireCapability } = await loadHelper();
  assert.throws(
    () => requireCapability({}, 'destructive-fs'),
    (err) => {
      return err.code === 'CAPABILITY_DENIED' && err.action === 'destructive-fs';
    },
  );
});

test('safety: requireCapability is a no-op when allowed', async () => {
  const { requireCapability } = await loadHelper();
  assert.doesNotThrow(() =>
    requireCapability({ safeMode: false, allowDestructiveActions: true }, 'destructive-fs'),
  );
});
