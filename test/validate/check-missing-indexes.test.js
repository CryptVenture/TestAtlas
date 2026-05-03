// test/validate/check-missing-indexes.test.js
//
// Plan 05-03 (Wave 2). Unit tests for check-missing-indexes (PRD §33 #6).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { check } from '../../scripts/lib/validate/check-missing-indexes.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeValidationFixture } from '../_helpers.js';

async function loadCtx(scenario) {
  const fx = await makeValidationFixture(scenario);
  const files = await walkWorkspace(fx.wsDir);
  return { ctx: { wsDir: fx.wsDir, files }, cleanup: fx.cleanup };
}

test('check-missing-indexes: _base-good → status pass, zero findings', async () => {
  const { ctx, cleanup } = await loadCtx('_base-good');
  try {
    const result = await check(ctx);
    assert.equal(result.id, 'check-missing-indexes');
    assert.equal(result.prdRule, 6);
    assert.equal(result.status, 'pass', JSON.stringify(result.findings, null, 2));
    assert.deepEqual(result.findings, []);
  } finally {
    await cleanup();
  }
});

test('check-missing-indexes: broken-missing-index → fail with TESTATLAS_MISSING_INDEX, fixable=auto', async () => {
  const { ctx, cleanup } = await loadCtx('broken-missing-index');
  try {
    const result = await check(ctx);
    assert.equal(result.status, 'fail');
    assert.ok(result.findings.length >= 1, 'expected at least one missing-index finding');
    const codes = new Set(result.findings.map((f) => f.code));
    assert.ok(codes.has('TESTATLAS_MISSING_INDEX'), 'expected TESTATLAS_MISSING_INDEX code');
    // The fixture removes domains/auth/index.md
    const domainIndex = result.findings.find((f) => /domains\/auth\/index\.md/.test(f.path));
    assert.ok(domainIndex, 'expected finding referencing domains/auth/index.md');
    assert.equal(domainIndex.severity, 'error');
    assert.equal(domainIndex.fixable, 'auto');
    assert.match(domainIndex.fixDescription ?? '', /HEAL-02|update-indexes|regenerate/i);
    // ALL findings must be fixable=auto (HEAL-02 candidates).
    for (const f of result.findings) {
      assert.equal(f.code, 'TESTATLAS_MISSING_INDEX');
      assert.equal(f.fixable, 'auto');
    }
  } finally {
    await cleanup();
  }
});
