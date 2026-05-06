// test/scripts/generate-report-readiness-status-filter.test.js
//
// Quick 260506-esm: pin generate-report's readinessAssessment so it filters
// issues by OPEN status (status ∉ {closed, wont_fix}) BEFORE applying the
// severity check. This closes the bug where 7 closed severity:high issues
// kept driving readinessAssessment to "CONDITIONAL — high-severity issues
// require triage" when the actual ship-readiness was READY (no open
// critical/high, only medium/low triaged).
//
// Verdict matrix after the fix:
//   - any open critical with confidence ∈ {confirmed, strong-suspect}
//       → "NOT READY — blockers present"
//   - any open high (no open critical)
//       → "CONDITIONAL — high-severity issues require triage"
//   - everything else
//       → "READY"

import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { generateReport } from '../../scripts/generate-report.js';
import { makeValidationFixture } from '../_helpers.js';

function makeIssue(overrides = {}) {
  const id = overrides.id ?? 'ISSUE-100-x';
  return {
    $schema: 'https://testatlas.dev/schemas/v1/issue.schema.json',
    id,
    slug: id.replace(/^ISSUE-\d{3,}-/, ''),
    title: overrides.title ?? `Title ${id}`,
    status: overrides.status ?? 'new',
    severity: overrides.severity ?? 'medium',
    confidence: overrides.confidence ?? 'confirmed',
    type: 'functional',
    domain: 'domain-auth',
    flow: null,
    environment: 'local',
    persona: '',
    foundOn: '2026-05-01T12:00:00Z',
    foundBy: 'agent',
    summary: 'summary',
    expectedBehavior: 'expected',
    actualBehavior: 'actual',
    userImpact: 'impact',
    reproductionSteps: ['step'],
    frequency: 'always',
    evidence: ['EVIDENCE-001'],
    acceptanceCriteria: ['resolved'],
    lastUpdatedAt: '2026-05-01T12:00:00Z',
  };
}

async function writeIssue(wsDir, issue) {
  const dir = path.join(wsDir, 'to_fix');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${issue.id}.json`), JSON.stringify(issue, null, 2), 'utf8');
}

test('readinessAssessment: closed high-severity issues do NOT drive CONDITIONAL', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Override baseline issue to status:closed severity:high.
  await writeIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-001-foo',
      slug: 'foo',
      status: 'closed',
      severity: 'high',
    }),
  );
  // Add a status:triaged severity:low (representative of post-triage corpus).
  await writeIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-002-bar',
      status: 'triaged',
      severity: 'low',
    }),
  );

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });
  assert.equal(
    r.jsonReport.readinessAssessment,
    'READY',
    `expected READY (closed-high should not count), got: ${r.jsonReport.readinessAssessment}`,
  );
});

test('readinessAssessment: open severity:high → CONDITIONAL', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-001-foo',
      slug: 'foo',
      status: 'triaged',
      severity: 'high',
    }),
  );

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });
  assert.equal(
    r.jsonReport.readinessAssessment,
    'CONDITIONAL — high-severity issues require triage',
  );
});

test('readinessAssessment: open severity:critical confirmed → NOT READY', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-001-foo',
      slug: 'foo',
      status: 'new',
      severity: 'critical',
      confidence: 'confirmed',
    }),
  );

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });
  assert.equal(r.jsonReport.readinessAssessment, 'NOT READY — blockers present');
});

test('readinessAssessment: wont_fix high also does not block readiness', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-001-foo',
      slug: 'foo',
      status: 'wont_fix',
      severity: 'high',
    }),
  );

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });
  assert.equal(r.jsonReport.readinessAssessment, 'READY');
});
