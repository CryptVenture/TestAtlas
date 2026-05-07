// test/scripts/generate-report.test.js
//
// Plan 14-02 Task 2 — V2-aware generate-report. Verifies the V2 wrapper
// `generateV2Report()` produces a REPORT-latest.md with PRD §16.1 sections.
//
// NOTE: Phase 11 already shipped a V1 generate-report.js. This test pins V2
// behavior (which the V2 wrapper exports under a new function), without
// breaking V1.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

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
