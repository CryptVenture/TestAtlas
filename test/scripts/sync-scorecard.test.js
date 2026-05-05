// test/scripts/sync-scorecard.test.js
//
// Quick 260505-wjp Task 2 (G1+G6): RED→GREEN tests for sync-scorecard.js
//
// sync-scorecard regenerates all 5 generated sections in
// _testatlas/13_quality_scorecard.md from manifest.counts + on-disk
// to_fix/ISSUE-*.json + tests/runs/, and refreshes
// manifest.generatedSections['13_quality_scorecard.md'] hashes for all 5
// slugs.

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseMarkers } from '../../scripts/lib/markers.js';
import { syncScorecard } from '../../scripts/sync-scorecard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE = path.join(
  REPO_ROOT,
  '.testatlas',
  'templates',
  'canonical',
  '13_quality_scorecard.md',
);

async function makeScorecardWs(t, { issues = [], counts = {} } = {}) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'scorecard-'));
  const wsDir = path.join(tmp, '_testatlas');
  await mkdir(wsDir, { recursive: true });
  await mkdir(path.join(wsDir, 'to_fix'), { recursive: true });
  await mkdir(path.join(wsDir, 'tests', 'runs'), { recursive: true });
  // Copy template scorecard
  await cp(TEMPLATE, path.join(wsDir, '13_quality_scorecard.md'));
  // Manifest
  const manifest = {
    $schema: 'https://testatlas.dev/schemas/v1/workspace-manifest.schema.json',
    suite: 'TestAtlas',
    workspaceVersion: '1',
    workspaceDir: '_testatlas',
    initializedAt: '2026-05-05T00:00:00.000Z',
    lastUpdatedAt: '2026-05-05T00:00:00.000Z',
    project: { name: 'fx', root: '.', detectedStack: [], packageManagers: [], runtimes: [] },
    counts: {
      domains: 0,
      flows: 0,
      issues: issues.length,
      evidenceRecords: 0,
      testRuns: 0,
      ...counts,
    },
    status: 'initialized',
    generatedSections: {},
  };
  await writeFile(
    path.join(wsDir, '11_workspace_manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  // Issues
  for (const issue of issues) {
    const file = `${issue.id}.json`;
    await writeFile(path.join(wsDir, 'to_fix', file), `${JSON.stringify(issue, null, 2)}\n`);
  }
  // Suite tree (so loadConfig works)
  await cp(path.join(REPO_ROOT, '.testatlas'), path.join(tmp, '.testatlas'), {
    recursive: true,
  });
  t.after(() => rm(tmp, { recursive: true, force: true }));
  return { tmp, wsDir };
}

test('sync-scorecard: fresh workspace renders all 5 sections; hashes are 64-hex', async (t) => {
  const { tmp, wsDir } = await makeScorecardWs(t);
  const r = await syncScorecard({ cwd: tmp });
  assert.equal(r.dryRun, false);

  const text = await readFile(path.join(wsDir, '13_quality_scorecard.md'), 'utf8');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  for (const slug of [
    'coverage',
    'severity-weighted-issue-load',
    'confidence-trend',
    'blockers-trend',
    'last-updated',
  ]) {
    assert.ok(sections.has(slug), `section "${slug}" must exist after sync`);
  }

  const manifest = JSON.parse(
    await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  const sec = manifest.generatedSections['13_quality_scorecard.md'];
  assert.ok(sec);
  for (const slug of [
    'coverage',
    'severity-weighted-issue-load',
    'confidence-trend',
    'blockers-trend',
    'last-updated',
  ]) {
    assert.match(sec[slug], /^[0-9a-f]{64}$/, `${slug} hash must be 64 hex chars`);
  }
});

test('sync-scorecard: with 3 issues (1 critical, 1 high, 1 low), severity bullets reflect counts', async (t) => {
  const issues = [
    {
      id: 'ISSUE-001-a',
      slug: 'a',
      severity: 'critical',
      confidence: 'confirmed',
      status: 'triaged',
    },
    {
      id: 'ISSUE-002-b',
      slug: 'b',
      severity: 'high',
      confidence: 'confirmed',
      status: 'triaged',
    },
    {
      id: 'ISSUE-003-c',
      slug: 'c',
      severity: 'low',
      confidence: 'needs-validation',
      status: 'new',
    },
  ];
  const { tmp, wsDir } = await makeScorecardWs(t, { issues });
  await syncScorecard({ cwd: tmp });

  const text = await readFile(path.join(wsDir, '13_quality_scorecard.md'), 'utf8');
  const { sections } = parseMarkers(text);
  const sev = sections.get('severity-weighted-issue-load').contentLines.join('\n');
  assert.match(sev, /Critical: 1/);
  assert.match(sev, /High: 1/);
  assert.match(sev, /Low: 1/);

  const conf = sections.get('confidence-trend').contentLines.join('\n');
  assert.match(conf, /Confirmed: 2/);
  assert.match(conf, /Needs-validation: 1/);
});

test('sync-scorecard: running twice with DIFFERENT counts changes section bytes between runs', async (t) => {
  const { tmp, wsDir } = await makeScorecardWs(t, {
    issues: [
      {
        id: 'ISSUE-001-a',
        slug: 'a',
        severity: 'low',
        confidence: 'confirmed',
        status: 'new',
      },
    ],
  });
  await syncScorecard({ cwd: tmp });
  const before = await readFile(path.join(wsDir, '13_quality_scorecard.md'), 'utf8');

  // Add a critical issue + bump manifest counts.issues
  await writeFile(
    path.join(wsDir, 'to_fix', 'ISSUE-002-b.json'),
    JSON.stringify(
      {
        id: 'ISSUE-002-b',
        slug: 'b',
        severity: 'critical',
        confidence: 'confirmed',
        status: 'confirmed',
      },
      null,
      2,
    ),
  );
  const m = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
  m.counts.issues = 2;
  await writeFile(
    path.join(wsDir, '11_workspace_manifest.json'),
    `${JSON.stringify(m, null, 2)}\n`,
  );

  await syncScorecard({ cwd: tmp });
  const after = await readFile(path.join(wsDir, '13_quality_scorecard.md'), 'utf8');

  assert.notEqual(before, after, 'scorecard bytes must change between runs with different inputs');
  assert.match(after, /Critical: 1/);
});

test('sync-scorecard: idempotency — same inputs run twice produces identical hashes', async (t) => {
  const { tmp, wsDir } = await makeScorecardWs(t, {
    issues: [
      {
        id: 'ISSUE-001-a',
        slug: 'a',
        severity: 'high',
        confidence: 'confirmed',
        status: 'triaged',
      },
    ],
  });
  await syncScorecard({ cwd: tmp });
  const m1 = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
  // Capture body-driven hashes (excluding last-updated, which is timestamp-driven)
  const h1 = { ...m1.generatedSections['13_quality_scorecard.md'] };

  await syncScorecard({ cwd: tmp });
  const m2 = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
  const h2 = { ...m2.generatedSections['13_quality_scorecard.md'] };

  for (const slug of [
    'coverage',
    'severity-weighted-issue-load',
    'confidence-trend',
    'blockers-trend',
  ]) {
    assert.equal(h1[slug], h2[slug], `${slug} hash must be stable across same-input runs`);
  }
});

test('sync-scorecard: manifest.generatedSections[13_quality_scorecard.md] has all 5 slugs as 64-hex', async (t) => {
  const { tmp, wsDir } = await makeScorecardWs(t);
  await syncScorecard({ cwd: tmp });
  const m = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
  const sec = m.generatedSections['13_quality_scorecard.md'];
  const slugs = Object.keys(sec).sort();
  assert.deepEqual(slugs, [
    'blockers-trend',
    'confidence-trend',
    'coverage',
    'last-updated',
    'severity-weighted-issue-load',
  ]);
  for (const v of Object.values(sec)) {
    assert.match(v, /^[0-9a-f]{64}$/);
  }
});

test('sync-scorecard: refuses with TESTATLAS_MARKER_INVALID when scorecard has marker errors', async (t) => {
  const { tmp, wsDir } = await makeScorecardWs(t);
  // Corrupt: orphan START
  await writeFile(
    path.join(wsDir, '13_quality_scorecard.md'),
    '# 13 Quality Scorecard\n\n<!-- TESTATLAS:GENERATED:START section="orphan" -->\noops\n',
  );
  await assert.rejects(
    () => syncScorecard({ cwd: tmp }),
    (err) => err.code === 'TESTATLAS_MARKER_INVALID',
  );
});

test('sync-scorecard: --dry-run writes ZERO files but reports which sections WOULD change', async (t) => {
  const { tmp, wsDir } = await makeScorecardWs(t, {
    issues: [
      {
        id: 'ISSUE-001-a',
        slug: 'a',
        severity: 'critical',
        confidence: 'confirmed',
        status: 'confirmed',
      },
    ],
  });
  let writes = 0;
  const r = await syncScorecard(
    { cwd: tmp, dryRun: true },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0);
  assert.equal(r.dryRun, true);
  assert.ok(Array.isArray(r.changedSections), 'changedSections must be an array');
  assert.ok(
    r.changedSections.length > 0,
    'fresh workspace + critical issue should report changes WOULD occur',
  );

  // Verify the manifest was NOT updated.
  const m = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
  assert.deepEqual(m.generatedSections, {}, 'manifest unchanged under --dry-run');
});
