// test/validate/check-issue-index-consistency.test.js
//
// Plan 05-02 (Wave 1). Unit tests for check-issue-index-consistency (PRD §33 #5).

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../../scripts/init-workspace.js';
import { check } from '../../scripts/lib/validate/check-issue-index-consistency.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeWorkspaceFixture } from '../_helpers.js';

async function bootstrap({ cwd }) {
  const r = await initWorkspace({ cwd });
  return r.wsDir;
}

test('check-issue-index-consistency: empty workspace → pass', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.id, 'check-issue-index-consistency');
    assert.equal(result.prdRule, 5);
    assert.equal(result.status, 'pass');
  } finally {
    await fx.cleanup();
  }
});

test('check-issue-index-consistency: issue exists but cross-cut indexes missing → fail (TESTATLAS_INDEX_MISMATCH)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-001-bug.json'),
      JSON.stringify(
        {
          id: 'ISSUE-001',
          slug: 'bug',
          domain: 'auth',
          severity: 'high',
          status: 'new',
          type: 'functional',
        },
        null,
        2,
      ),
    );
    // No by_*/<value>.md indexes created → all 4 facets miss.
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'fail');
    const codes = result.findings.map((f) => f.code);
    for (const c of codes) assert.equal(c, 'TESTATLAS_INDEX_MISMATCH');
    // Expect findings for at least all 4 expected by_* paths.
    assert.ok(result.findings.length >= 4);
    // Every finding must be fixable='auto' (HEAL-03 eligible).
    for (const f of result.findings) {
      assert.equal(f.fixable, 'auto');
      assert.match(f.fixDescription, /HEAL-03|cross-cut/);
    }
  } finally {
    await fx.cleanup();
  }
});

test('check-issue-index-consistency: index references non-existent issue → fail (reverse direction)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    // No issues, but an index references a phantom one.
    await mkdir(path.join(wsDir, 'to_fix', 'by_domain'), { recursive: true });
    await writeFile(
      path.join(wsDir, 'to_fix', 'by_domain', 'auth.md'),
      '# Auth Issues\n\n- [ISSUE-999](../ISSUE-999-phantom.md)\n',
    );
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'fail');
    const f = result.findings.find((x) => /ISSUE-999/.test(x.message));
    assert.ok(f, 'expected reverse-direction finding');
    assert.equal(f.code, 'TESTATLAS_INDEX_MISMATCH');
    assert.equal(f.fixable, 'auto');
  } finally {
    await fx.cleanup();
  }
});

test('check-issue-index-consistency: identifies BOTH directions (forward + reverse)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    // Issue without index entry (forward miss):
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-002-foo.json'),
      JSON.stringify(
        {
          id: 'ISSUE-002',
          slug: 'foo',
          domain: 'checkout',
          severity: 'low',
          status: 'new',
          type: 'ux',
        },
        null,
        2,
      ),
    );
    // Index pointing at a non-existent issue (reverse miss):
    await mkdir(path.join(wsDir, 'to_fix', 'by_severity'), { recursive: true });
    await writeFile(
      path.join(wsDir, 'to_fix', 'by_severity', 'critical.md'),
      '# Critical\n\n- [ISSUE-555](../ISSUE-555-ghost.md)\n',
    );
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'fail');
    const codes = result.findings.map((f) => f.code);
    assert.ok(codes.every((c) => c === 'TESTATLAS_INDEX_MISMATCH'));
    // Forward direction: ISSUE-002 missing from indexes.
    const fwd = result.findings.find((f) => /ISSUE-002/.test(f.message));
    assert.ok(fwd, 'forward direction finding present');
    // Reverse direction: ISSUE-555 referenced but doesn't exist.
    const rev = result.findings.find((f) => /ISSUE-555/.test(f.message));
    assert.ok(rev, 'reverse direction finding present');
  } finally {
    await fx.cleanup();
  }
});

test('check-issue-index-consistency: properly populated indexes → pass', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-001-bug.json'),
      JSON.stringify(
        {
          id: 'ISSUE-001',
          slug: 'bug',
          domain: 'auth',
          severity: 'high',
          status: 'new',
          type: 'functional',
        },
        null,
        2,
      ),
    );
    // Create matching indexes for all 4 facets.
    for (const [facet, value] of [
      ['by_domain', 'auth'],
      ['by_severity', 'high'],
      ['by_status', 'new'],
      ['by_type', 'functional'],
    ]) {
      await mkdir(path.join(wsDir, 'to_fix', facet), { recursive: true });
      await writeFile(
        path.join(wsDir, 'to_fix', facet, `${value}.md`),
        `# ${facet} ${value}\n\n- ISSUE-001-bug.md\n`,
      );
    }
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'pass', JSON.stringify(result.findings, null, 2));
  } finally {
    await fx.cleanup();
  }
});
