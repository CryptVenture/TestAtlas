// test/validate/check-canonical-files.test.js
//
// Plan 05-02 (Wave 1). Unit tests for check-canonical-files (PRD §33 #1).

import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../../scripts/init-workspace.js';
import { check } from '../../scripts/lib/validate/check-canonical-files.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeWorkspaceFixture } from '../_helpers.js';

async function makeCtx() {
  const fx = await makeWorkspaceFixture();
  const r = await initWorkspace({ cwd: fx.cwd });
  const files = await walkWorkspace(r.wsDir);
  return { ctx: { wsDir: r.wsDir, files }, ...fx };
}

test('check-canonical-files: fresh init → status pass, zero findings', async () => {
  const { ctx, cleanup } = await makeCtx();
  try {
    const result = await check(ctx);
    assert.equal(result.id, 'check-canonical-files');
    assert.equal(result.prdRule, 1);
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.findings, []);
  } finally {
    await cleanup();
  }
});

test('check-canonical-files: missing 02_test_strategy.md → fail with TESTATLAS_MISSING_CANONICAL', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const r = await initWorkspace({ cwd: fx.cwd });
    await rm(path.join(r.wsDir, '02_test_strategy.md'));
    const files = await walkWorkspace(r.wsDir);
    const result = await check({ wsDir: r.wsDir, files });
    assert.equal(result.status, 'fail');
    assert.equal(result.findings.length, 1);
    const f = result.findings[0];
    assert.equal(f.severity, 'error');
    assert.equal(f.path, '02_test_strategy.md');
    assert.equal(f.code, 'TESTATLAS_MISSING_CANONICAL');
    assert.equal(f.fixable, null);
    assert.match(f.fixDescription, /git checkout|atlas:init/);
  } finally {
    await fx.cleanup();
  }
});

test('check-canonical-files: multiple missing → multiple findings', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const r = await initWorkspace({ cwd: fx.cwd });
    await rm(path.join(r.wsDir, '02_test_strategy.md'));
    await rm(path.join(r.wsDir, '13_quality_scorecard.md'));
    const files = await walkWorkspace(r.wsDir);
    const result = await check({ wsDir: r.wsDir, files });
    assert.equal(result.status, 'fail');
    assert.equal(result.findings.length, 2);
    const codes = result.findings.map((f) => f.code);
    assert.deepEqual(codes, ['TESTATLAS_MISSING_CANONICAL', 'TESTATLAS_MISSING_CANONICAL']);
  } finally {
    await fx.cleanup();
  }
});

test('check-canonical-files: fixable=null on every finding (NEVER auto-heal)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const r = await initWorkspace({ cwd: fx.cwd });
    await rm(path.join(r.wsDir, '00_overview.md'));
    const files = await walkWorkspace(r.wsDir);
    const result = await check({ wsDir: r.wsDir, files });
    for (const f of result.findings) {
      assert.equal(f.fixable, null);
    }
  } finally {
    await fx.cleanup();
  }
});
