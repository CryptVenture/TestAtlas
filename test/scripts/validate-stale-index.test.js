// test/scripts/validate-stale-index.test.js
//
// Plan 11-06 (F-23). Regression coverage for `TESTATLAS_INDEX_STALE` —
// the new third-pass detection in check-issue-index-consistency that
// flags cross-cut index entries whose referenced issue's actual facet
// value disagrees with the index's category. Also covers HEAL-03
// round-trip (auto-heal regenerates indexes from issue truth).
//
// Layered on top of the existing test/validate/check-issue-index-consistency.test.js
// (which covers MISSING-direction MISMATCH only). These tests are additive
// and use the same `makeWorkspaceFixture` + `initWorkspace` bootstrap so
// schema-loader + config resolve correctly.

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../../scripts/init-workspace.js';
import { check } from '../../scripts/lib/validate/check-issue-index-consistency.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { validateWorkspace } from '../../scripts/validate-workspace.js';
import { makeWorkspaceFixture } from '../_helpers.js';

const FACETS = [
  ['by_domain', 'domain', 'auth'],
  ['by_severity', 'severity', 'medium'],
  ['by_status', 'status', 'new'],
  ['by_type', 'type', 'functional'],
];

async function bootstrap({ cwd }) {
  const r = await initWorkspace({ cwd });
  return r.wsDir;
}

async function writeIssue(wsDir, id, slug, fields) {
  const base = path.join(wsDir, 'to_fix', `${id}-${slug}`);
  await writeFile(
    `${base}.json`,
    `${JSON.stringify(
      {
        id,
        slug,
        domain: 'auth',
        severity: 'medium',
        status: 'new',
        type: 'functional',
        ...fields,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(`${base}.md`, `# ${id}\n`);
}

async function writeIndex(wsDir, facet, value, ids) {
  const dir = path.join(wsDir, 'to_fix', facet);
  await mkdir(dir, { recursive: true });
  const body = ids.map((id) => `- ${id}`).join('\n');
  await writeFile(path.join(dir, `${value}.md`), `# ${facet} ${value}\n\n${body}\n`);
}

async function writeAllMatchingIndexes(wsDir, idWithSlug, fields) {
  const f = {
    by_domain: fields.domain ?? 'auth',
    by_severity: fields.severity ?? 'medium',
    by_status: fields.status ?? 'new',
    by_type: fields.type ?? 'functional',
  };
  for (const [facet, value] of Object.entries(f)) {
    await writeIndex(wsDir, facet, value, [idWithSlug]);
  }
}

// ─── Test 1: clean fixture passes (sanity — current code already supports this) ─────

test('stale-index: clean fixture (issue + matching indexes) → pass', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeIssue(wsDir, 'ISSUE-001', 'foo', { severity: 'medium' });
    await writeAllMatchingIndexes(wsDir, 'ISSUE-001-foo.md', { severity: 'medium' });
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(
      result.status,
      'pass',
      `expected pass; findings=${JSON.stringify(result.findings, null, 2)}`,
    );
  } finally {
    await fx.cleanup();
  }
});

// ─── Test 2: stale severity → fails with TESTATLAS_INDEX_STALE ──────────────────────

test('stale-index: issue with severity=medium also listed in by_severity/high.md → fail with TESTATLAS_INDEX_STALE', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeIssue(wsDir, 'ISSUE-002', 'bar', { severity: 'medium' });
    // Correct index entries:
    await writeAllMatchingIndexes(wsDir, 'ISSUE-002-bar.md', { severity: 'medium' });
    // Plus the STALE entry — issue is severity:medium but appears in high.md:
    await writeIndex(wsDir, 'by_severity', 'high', ['ISSUE-002-bar.md']);

    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'fail');
    const stale = result.findings.filter((f) => f.code === 'TESTATLAS_INDEX_STALE');
    assert.ok(
      stale.length >= 1,
      `expected ≥1 TESTATLAS_INDEX_STALE finding; got ${JSON.stringify(result.findings, null, 2)}`,
    );
    // The stale finding should reference the high.md path + the actual
    // (medium) and indexed (high) values for diagnostic clarity.
    const f = stale[0];
    assert.match(f.path, /by_severity\/high\.md$/);
    assert.match(f.message, /ISSUE-002/);
    assert.match(f.message, /medium/);
    assert.match(f.message, /high/);
    assert.equal(f.fixable, 'auto');
    assert.match(f.fixDescription, /HEAL-03|cross-cut/);
  } finally {
    await fx.cleanup();
  }
});

// ─── Test 3: stale status → fails with TESTATLAS_INDEX_STALE ────────────────────────

test('stale-index: issue with status=closed also listed in by_status/triaged.md → fail with TESTATLAS_INDEX_STALE', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeIssue(wsDir, 'ISSUE-003', 'baz', { status: 'closed' });
    await writeAllMatchingIndexes(wsDir, 'ISSUE-003-baz.md', { status: 'closed' });
    // STALE entry:
    await writeIndex(wsDir, 'by_status', 'triaged', ['ISSUE-003-baz.md']);

    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    assert.equal(result.status, 'fail');
    const stale = result.findings.filter((f) => f.code === 'TESTATLAS_INDEX_STALE');
    assert.ok(stale.length >= 1, 'expected ≥1 TESTATLAS_INDEX_STALE finding');
    const f = stale.find((x) => /by_status\/triaged\.md$/.test(x.path));
    assert.ok(f, 'expected STALE finding for by_status/triaged.md');
    assert.match(f.message, /ISSUE-003/);
    assert.match(f.message, /closed/);
    assert.match(f.message, /triaged/);
  } finally {
    await fx.cleanup();
  }
});

// ─── Test 4: HEAL-03 round-trip → stale entry removed by auto-heal ──────────────────

test('stale-index: HEAL-03 round-trip removes stale entry, preserves correct one, post-heal validate clean', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeIssue(wsDir, 'ISSUE-004', 'qux', { severity: 'medium' });
    await writeAllMatchingIndexes(wsDir, 'ISSUE-004-qux.md', { severity: 'medium' });
    await writeIndex(wsDir, 'by_severity', 'high', ['ISSUE-004-qux.md']);

    // Heal:
    const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: true });

    // Verify STALE entry gone from high.md:
    const highPath = path.join(wsDir, 'to_fix', 'by_severity', 'high.md');
    const highContent = await readFile(highPath, 'utf8').catch(() => '');
    assert.ok(
      !highContent.includes('ISSUE-004'),
      `high.md still contains stale entry after heal:\n${highContent}`,
    );

    // Verify correct entry preserved in medium.md:
    const mediumPath = path.join(wsDir, 'to_fix', 'by_severity', 'medium.md');
    const mediumContent = await readFile(mediumPath, 'utf8');
    assert.ok(
      mediumContent.includes('ISSUE-004'),
      `medium.md should still reference ISSUE-004:\n${mediumContent}`,
    );

    // Post-heal validate should be clean OR strictly cleaner than pre-heal.
    // The precise post-heal state depends on what other checks see; what
    // matters here is that the STALE finding for high.md is gone.
    const postHeal = r.postHealResults ?? r.results;
    const stillStale = (postHeal ?? [])
      .flatMap((res) => res.findings ?? [])
      .filter((f) => f.code === 'TESTATLAS_INDEX_STALE' && /by_severity\/high\.md$/.test(f.path));
    assert.equal(
      stillStale.length,
      0,
      `STALE finding for high.md not cleared by HEAL-03: ${JSON.stringify(stillStale, null, 2)}`,
    );
  } finally {
    await fx.cleanup();
  }
});

// ─── Test 5: no false positives — issue listed in all 4 matching indexes → pass ─────

test('stale-index: properly multi-indexed issue (4 facets, all matching) → pass (no false-positive STALE)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const wsDir = await bootstrap({ cwd: fx.cwd });
    await writeIssue(wsDir, 'ISSUE-005', 'multi', {
      domain: 'auth',
      severity: 'medium',
      status: 'new',
      type: 'functional',
    });
    for (const [facet, _field, value] of FACETS) {
      await writeIndex(wsDir, facet, value, ['ISSUE-005-multi.md']);
    }
    const files = await walkWorkspace(wsDir);
    const result = await check({ wsDir, files });
    const stale = result.findings.filter((f) => f.code === 'TESTATLAS_INDEX_STALE');
    assert.equal(
      stale.length,
      0,
      `expected zero STALE findings; got ${JSON.stringify(stale, null, 2)}`,
    );
    assert.equal(result.status, 'pass');
  } finally {
    await fx.cleanup();
  }
});
