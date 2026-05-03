// test/validate/check-status-counts.test.js
//
// Plan 05-03 (Wave 2). Unit tests for check-status-counts (PRD §33 #10).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { check } from '../../scripts/lib/validate/check-status-counts.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeValidationFixture } from '../_helpers.js';

async function loadCtx(scenario) {
  const fx = await makeValidationFixture(scenario);
  const files = await walkWorkspace(fx.wsDir);
  const manifestText = await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  return { ctx: { wsDir: fx.wsDir, files, manifest }, cleanup: fx.cleanup };
}

test('check-status-counts: _base-good → status pass, zero findings', async () => {
  const { ctx, cleanup } = await loadCtx('_base-good');
  try {
    const result = await check(ctx);
    assert.equal(result.id, 'check-status-counts');
    assert.equal(result.prdRule, 10);
    assert.equal(result.status, 'pass', JSON.stringify(result.findings, null, 2));
  } finally {
    await cleanup();
  }
});

test('check-status-counts: broken-count-mismatch (manifest.counts.issues=5, disk=1) → fail with TESTATLAS_COUNT_MISMATCH; fixable=auto', async () => {
  const { ctx, cleanup } = await loadCtx('broken-count-mismatch');
  try {
    const result = await check(ctx);
    assert.equal(result.status, 'fail');
    const mismatch = result.findings.find((f) => f.code === 'TESTATLAS_COUNT_MISMATCH');
    assert.ok(mismatch, 'expected TESTATLAS_COUNT_MISMATCH finding');
    assert.equal(mismatch.severity, 'error');
    assert.equal(mismatch.path, '11_workspace_manifest.json');
    assert.equal(mismatch.fixable, 'auto');
    assert.match(mismatch.fixDescription ?? '', /HEAL-01|sync-status|recompute/i);
    // Message must specify which key drifted (issues=5 but disk=1).
    assert.match(mismatch.message, /issues/);
    assert.match(mismatch.message, /5/);
    // All findings must be fixable=auto (HEAL-01 candidates).
    for (const f of result.findings) {
      assert.equal(f.code, 'TESTATLAS_COUNT_MISMATCH');
      assert.equal(f.fixable, 'auto');
    }
  } finally {
    await cleanup();
  }
});

test('check-status-counts: tolerates missing manifest (parseError → null) without throwing', async () => {
  // The orchestrator passes manifest=null on parseError. The check should
  // surface ZERO findings rather than crash.
  const stubCtx = {
    wsDir: '/tmp/never-touched',
    files: {
      domains: [],
      flows: [],
      issues: [],
      evidenceFiles: [],
      testRuns: [],
      reports: [],
    },
    manifest: null,
  };
  const result = await check(stubCtx);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.findings, []);
});
