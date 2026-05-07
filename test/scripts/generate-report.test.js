// test/scripts/generate-report.test.js
//
// Plan 14-02 Task 2 — V2-aware generate-report. Verifies the V2 wrapper
// `generateV2Report()` produces a REPORT-latest.md with PRD §16.1 sections.
//
// NOTE: Phase 11 already shipped a V1 generate-report.js. This test pins V2
// behavior (which the V2 wrapper exports under a new function), without
// breaking V1.
//
// Phase 18-04 (ISSUE-009) — additionally pin the V1 `--kind` / `--domain`
// dispatch contract on `generateReport()`. The V1 default path remains
// monolithic; the new flavors route to dedicated builders.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generateReport } from '../../scripts/generate-report.js';
import { makeValidationFixture } from '../_helpers.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-report.js');

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-gen-report-v2-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });
  await mkdir(path.join(wsDir, 'reports'), { recursive: true });
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      project: { name: 'demo', repo_root: '.', primary_stack: ['node'] },
      status: {
        phase: 'tested',
        last_updated: '2026-05-07T00:00:00Z',
        active_environment: 'local',
      },
      counts: {
        domains: 3,
        flows: 8,
        issues: 5,
        critical_issues: 1,
        high_issues: 2,
        evidence_artifacts: 12,
        council_sessions: 0,
      },
      confidence: { overall: 'medium', highest_risk_domains: ['domain-auth'], stale_domains: [] },
    }),
  );
  await writeFile(
    path.join(brainDir, 'issues.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      issues: [
        { id: 'ISSUE-001-x', severity: 'critical', status: 'new', domain: 'domain-auth' },
        { id: 'ISSUE-002-y', severity: 'high', status: 'new', domain: 'domain-billing' },
        { id: 'ISSUE-003-z', severity: 'high', status: 'verified', domain: 'domain-auth' },
        { id: 'ISSUE-004-a', severity: 'medium', status: 'new', domain: 'domain-ui' },
        { id: 'ISSUE-005-b', severity: 'low', status: 'closed', domain: 'domain-ui' },
      ],
    }),
  );
  await writeFile(
    path.join(brainDir, 'coverage.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      coverage: { routes: [], components: [], endpoints: [], commands: [] },
    }),
  );
  await writeFile(
    path.join(brainDir, 'evidence.json'),
    JSON.stringify({ schema_version: '2.0.0', evidence: [] }),
  );
  return { dir, wsDir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: generateV2Report writes REPORT-latest.md with all PRD §16.1 sections', async () => {
  const ctx = await setupBrain();
  try {
    const mod = await import(SCRIPT);
    assert.equal(
      typeof mod.generateV2Report,
      'function',
      'generate-report.js must export generateV2Report',
    );
    const r = await mod.generateV2Report({ cwd: ctx.dir, type: 'latest' });
    assert.equal(r.ok, true);
    assert.match(r.outputPath, /REPORT-latest\.md$/);
    const text = await readFile(r.outputPath, 'utf8');
    // PRD §16.1 sections
    assert.match(text, /## Run Summary/);
    assert.match(text, /## Coverage/);
    assert.match(text, /## Key Findings/);
    assert.match(text, /## Severity Breakdown/);
    assert.match(text, /## Blockers/);
    assert.match(text, /## Gaps/);
    assert.match(text, /## Assumptions/);
    assert.match(text, /## Next Actions/);
    assert.match(text, /## Readiness/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: generateV2Report severity counts come from issues.json', async () => {
  const ctx = await setupBrain();
  try {
    const { generateV2Report } = await import(SCRIPT);
    const r = await generateV2Report({ cwd: ctx.dir, type: 'latest' });
    const text = await readFile(r.outputPath, 'utf8');
    assert.match(text, /critical.*1/i);
    assert.match(text, /high.*2/i);
  } finally {
    await ctx.cleanup();
  }
});

// ─────────────────────── Phase 18-04 (ISSUE-009) tests ─────────────────────
//
// generate-report.js currently rejects unknown CLI args with `process.exit(2)`.
// The spec command bodies call it with `--kind release-readiness` and
// `--kind domain --domain <slug>`. Pin the dispatch contract:

test('Phase 18-04: generateReport --kind release-readiness routes to release-readiness builder', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await generateReport({ cwd: fx.cwd, dryRun: true, kind: 'release-readiness' });
  assert.equal(
    r.kind,
    'release-readiness',
    `expected r.kind === 'release-readiness', got: ${r.kind}`,
  );
});

test('Phase 18-04: generateReport --kind domain --domain <slug> routes to domain builder', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await generateReport({
    cwd: fx.cwd,
    dryRun: true,
    kind: 'domain',
    domain: 'auth',
  });
  assert.equal(r.kind, 'domain', `expected r.kind === 'domain', got: ${r.kind}`);
  assert.equal(r.domain, 'auth', `expected r.domain === 'auth', got: ${r.domain}`);
});

test('Phase 18-04: generateReport --kind domain without --domain rejects', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await assert.rejects(
    () => generateReport({ cwd: fx.cwd, dryRun: true, kind: 'domain' }),
    /--kind\s+domain requires --domain/,
  );
});

test('Phase 18-04: generateReport without --kind preserves default monolithic behavior', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });
  // Default path returns a jsonReport with readinessAssessment (the monolithic
  // V1 contract pinned by other tests like generate-report-readiness-status-filter).
  assert.ok(r, 'default-kind generateReport should return a result');
  assert.ok(r.jsonReport, 'default-kind result should carry jsonReport (V1 contract)');
  assert.equal(
    typeof r.jsonReport.readinessAssessment,
    'string',
    'default-kind jsonReport.readinessAssessment must remain a string (V1 contract preserved)',
  );
});

test('Phase 18-04: generate-report.js --help mentions --kind and --domain', () => {
  const res = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  assert.match(out, /--kind/, 'help output must mention --kind');
  assert.match(out, /--domain/, 'help output must mention --domain');
});
