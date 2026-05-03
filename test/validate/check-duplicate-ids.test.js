// test/validate/check-duplicate-ids.test.js
//
// Plan 05-03 (Wave 2). Unit tests for check-duplicate-ids (PRD §33 #7).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { check } from '../../scripts/lib/validate/check-duplicate-ids.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeValidationFixture } from '../_helpers.js';

async function loadCtx(scenario) {
  const fx = await makeValidationFixture(scenario);
  const files = await walkWorkspace(fx.wsDir);
  return { ctx: { wsDir: fx.wsDir, files }, cleanup: fx.cleanup };
}

test('check-duplicate-ids: _base-good → status pass, zero findings', async () => {
  const { ctx, cleanup } = await loadCtx('_base-good');
  try {
    const result = await check(ctx);
    assert.equal(result.id, 'check-duplicate-ids');
    assert.equal(result.prdRule, 7);
    assert.equal(result.status, 'pass', JSON.stringify(result.findings, null, 2));
  } finally {
    await cleanup();
  }
});

test('check-duplicate-ids: broken-duplicate-id (two ISSUE-001-* files) → fail with TESTATLAS_DUPLICATE_ID listing both paths; fixable=null', async () => {
  const { ctx, cleanup } = await loadCtx('broken-duplicate-id');
  try {
    const result = await check(ctx);
    assert.equal(result.status, 'fail');
    const dup = result.findings.find((f) => f.code === 'TESTATLAS_DUPLICATE_ID');
    assert.ok(dup, 'expected TESTATLAS_DUPLICATE_ID finding');
    assert.equal(dup.severity, 'error');
    assert.equal(dup.fixable, null);
    // Message must list both paths/slugs.
    assert.match(dup.message, /ISSUE-001/);
    assert.match(dup.message, /foo/);
    assert.match(dup.message, /bar/);
    // fixDescription must say manual review required.
    assert.match(dup.fixDescription ?? '', /manual|cannot determine|original/i);
  } finally {
    await cleanup();
  }
});
