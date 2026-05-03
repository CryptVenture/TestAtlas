// test/validate/check-orphaned-evidence.test.js
//
// Plan 05-02 (Wave 1). Unit tests for check-orphaned-evidence (PRD §33 #4).

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../../scripts/init-workspace.js';
import { check } from '../../scripts/lib/validate/check-orphaned-evidence.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeWorkspaceFixture } from '../_helpers.js';

async function makeCtx({ cwd }) {
  const r = await initWorkspace({ cwd });
  return { wsDir: r.wsDir };
}

test('check-orphaned-evidence: empty workspace → pass', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const { wsDir } = await makeCtx({ cwd: fx.cwd });
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.id, 'check-orphaned-evidence');
    assert.equal(result.prdRule, 4);
    assert.equal(result.status, 'pass');
    assert.equal(result.findings.length, 0);
  } finally {
    await fx.cleanup();
  }
});

test('check-orphaned-evidence: evidence dir + matching issue.evidence → pass', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const { wsDir } = await makeCtx({ cwd: fx.cwd });
    // Drop an EVID-001 file + an issue that references it.
    await mkdir(path.join(wsDir, 'evidence', 'EVID-001'), { recursive: true });
    await writeFile(path.join(wsDir, 'evidence', 'EVID-001', 'screenshot.png'), 'fake');
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json'),
      JSON.stringify(
        {
          id: 'ISSUE-001',
          slug: 'foo',
          evidence: ['EVID-001'],
        },
        null,
        2,
      ),
    );
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'pass', JSON.stringify(result.findings, null, 2));
  } finally {
    await fx.cleanup();
  }
});

test('check-orphaned-evidence: orphan EVID-099 → warn with TESTATLAS_ORPHANED_EVIDENCE', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const { wsDir } = await makeCtx({ cwd: fx.cwd });
    await mkdir(path.join(wsDir, 'evidence', 'EVID-099'), { recursive: true });
    await writeFile(path.join(wsDir, 'evidence', 'EVID-099', 'orphan.png'), 'fake');
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'warn');
    const f = result.findings.find((x) => x.code === 'TESTATLAS_ORPHANED_EVIDENCE');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
    assert.equal(f.fixable, null);
    assert.match(f.message, /EVID-099/);
  } finally {
    await fx.cleanup();
  }
});

test('check-orphaned-evidence: issue references non-existent EVID → fail with TESTATLAS_MISSING_EVIDENCE_REF', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const { wsDir } = await makeCtx({ cwd: fx.cwd });
    // No evidence dir, but the issue points at one.
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json'),
      JSON.stringify(
        {
          id: 'ISSUE-001',
          slug: 'foo',
          evidence: ['EVID-MISSING-007'],
        },
        null,
        2,
      ),
    );
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'fail');
    const f = result.findings.find((x) => x.code === 'TESTATLAS_MISSING_EVIDENCE_REF');
    assert.ok(f);
    assert.equal(f.severity, 'error');
    assert.equal(f.fixable, null);
    assert.match(f.message, /EVID-MISSING-007/);
  } finally {
    await fx.cleanup();
  }
});

test('check-orphaned-evidence: every finding has fixable=null (NEVER auto-heal)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const { wsDir } = await makeCtx({ cwd: fx.cwd });
    await mkdir(path.join(wsDir, 'evidence', 'EVID-099'), { recursive: true });
    await writeFile(path.join(wsDir, 'evidence', 'EVID-099', 'orphan.png'), 'fake');
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json'),
      JSON.stringify(
        {
          id: 'ISSUE-001',
          slug: 'foo',
          evidence: ['EVID-MISSING-007'],
        },
        null,
        2,
      ),
    );
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    for (const f of result.findings) {
      assert.equal(f.fixable, null, `${f.code} must NEVER auto-heal`);
    }
  } finally {
    await fx.cleanup();
  }
});
