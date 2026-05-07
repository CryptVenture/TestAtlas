// test/scripts/score-quality.test.js
//
// Plan 14-06 Task 1 — score-quality.js produces 11 PRD §7.15 quality scores
// from documented brain evidence with freshness, confidence, evidence_refs,
// and a disclaimer.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'score-quality.js');

const PRD_METRICS = [
  'domain_understanding_score',
  'flow_coverage_score',
  'evidence_strength_score',
  'issue_actionability_score',
  'testability_score',
  'ux_confidence_score',
  'accessibility_baseline_score',
  'performance_confidence_score',
  'security_privacy_confidence_score',
  'brain_freshness_score',
  'council_consensus_score',
];

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-score-quality-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();

  const writeJson = (name, body) =>
    writeFile(path.join(brainDir, name), JSON.stringify(body, null, 2));

  await writeJson('manifest.json', {
    schema_version: '2.0.0',
    suite_version: '2.0.0',
    initialized_at: now,
    last_updated: now,
    project_name: 'fixture',
    adapters: [],
    schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
  });
  await writeJson('state.json', {
    schema_version: '2.0.0',
    last_updated: now,
    counts: { domains: 3, flows: 6, issues: 4, evidence: 12 },
    last_command: 'init',
  });
  await writeJson('domains.json', {
    schema_version: '2.0.0',
    last_updated: now,
    domains: [
      { id: 'domain-auth', flows: ['FLOW-1', 'FLOW-2'], evidence_refs: ['EV-1', 'EV-2'] },
      { id: 'domain-billing', flows: ['FLOW-3'], evidence_refs: ['EV-3'] },
      { id: 'domain-profile', flows: [], evidence_refs: [] },
    ],
  });
  await writeJson('flows.json', {
    schema_version: '2.0.0',
    last_updated: now,
    flows: [
      { id: 'FLOW-1', tested: true, automation_candidate: true },
      { id: 'FLOW-2', tested: true, automation_candidate: false },
      { id: 'FLOW-3', tested: false, automation_candidate: true },
      { id: 'FLOW-4', tested: false },
      { id: 'FLOW-5', tested: false },
      { id: 'FLOW-6', tested: true },
    ],
  });
  await writeJson('coverage.json', {
    schema_version: '2.0.0',
    last_updated: now,
    coverage: {
      routes: [
        { id: 'R-1', tested: true },
        { id: 'R-2', tested: false },
      ],
      components: [{ id: 'C-1', tested: true }],
      endpoints: [
        { id: 'E-1', tested: true },
        { id: 'E-2', tested: true },
      ],
      commands: [{ id: 'CMD-1', tested: false }],
    },
  });
  await writeJson('evidence.json', {
    schema_version: '2.0.0',
    last_updated: now,
    evidence: Array.from({ length: 12 }, (_, i) => ({
      id: `EV-${i + 1}`,
      kind: i % 2 === 0 ? 'screenshot' : 'log',
      created_at: now,
    })),
  });
  await writeJson('issues.json', {
    schema_version: '2.0.0',
    last_updated: now,
    issues: [
      {
        id: 'ISSUE-1',
        severity: 'high',
        repro_steps: ['step 1'],
        acceptance_criteria: ['ac'],
        evidence_refs: ['EV-1'],
      },
      { id: 'ISSUE-2', severity: 'medium', repro_steps: [], acceptance_criteria: [] },
      { id: 'ISSUE-3', severity: 'low', repro_steps: ['s'], acceptance_criteria: ['ac'] },
      { id: 'ISSUE-4', severity: 'critical', repro_steps: ['s'], acceptance_criteria: ['ac'] },
    ],
  });
  await writeJson('agent_sessions.json', {
    schema_version: '2.0.0',
    last_updated: now,
    sessions: [
      { id: 'COUNCIL-1', mode: 'roundtable-review', disagreements_resolved: 2, disagreements: 2 },
      { id: 'COUNCIL-2', mode: 'bug-triage', disagreements_resolved: 1, disagreements: 2 },
    ],
  });
  await writeJson('decisions.json', {
    schema_version: '2.0.0',
    last_updated: now,
    decisions: [{ id: 'DEC-1', status: 'accepted' }],
  });
  await writeJson('drift.json', {
    schema_version: '2.0.0',
    last_updated: now,
    drift_records: [],
  });
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: scoreQuality computes all 11 PRD §7.15 metrics with score 0-100', async () => {
  const ctx = await setupBrain();
  try {
    const { scoreQuality } = await import(SCRIPT);
    const r = await scoreQuality({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    const metrics = r.scores.map((s) => s.metric);
    for (const m of PRD_METRICS) {
      assert.ok(metrics.includes(m), `metric missing: ${m}`);
    }
    for (const s of r.scores) {
      assert.ok(Number.isInteger(s.score), `score not integer: ${s.metric}`);
      assert.ok(s.score >= 0 && s.score <= 100, `score out of range: ${s.metric} = ${s.score}`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: Each score includes evidence_refs array (may be empty)', async () => {
  const ctx = await setupBrain();
  try {
    const { scoreQuality } = await import(SCRIPT);
    const r = await scoreQuality({ cwd: ctx.dir });
    for (const s of r.scores) {
      assert.ok(Array.isArray(s.evidence_refs), `evidence_refs not an array: ${s.metric}`);
    }
    // At least one metric should reference the seeded evidence.
    const allRefs = r.scores.flatMap((s) => s.evidence_refs);
    assert.ok(allRefs.length > 0, 'no evidence_refs populated across any metric');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: Each score includes freshness + confidence enum values', async () => {
  const ctx = await setupBrain();
  try {
    const { scoreQuality } = await import(SCRIPT);
    const r = await scoreQuality({ cwd: ctx.dir });
    const FRESHNESS = new Set(['fresh', 'stale', 'unknown']);
    const CONFIDENCE = new Set(['confirmed', 'strong_suspect', 'needs_validation']);
    for (const s of r.scores) {
      assert.ok(FRESHNESS.has(s.freshness), `bad freshness: ${s.metric} = ${s.freshness}`);
      assert.ok(CONFIDENCE.has(s.confidence), `bad confidence: ${s.metric} = ${s.confidence}`);
      assert.ok(typeof s.computed_at === 'string' && s.computed_at.length > 10);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: Output JSON includes a prominent disclaimer string', async () => {
  const ctx = await setupBrain();
  try {
    const { scoreQuality } = await import(SCRIPT);
    const r = await scoreQuality({ cwd: ctx.dir });
    const outPath = path.join(ctx.dir, '_testatlas', 'brain', 'quality_scores.json');
    const written = JSON.parse(await readFile(outPath, 'utf8'));
    assert.ok(typeof written.disclaimer === 'string', 'disclaimer missing in written file');
    assert.match(written.disclaimer, /aid decisions|not.*replace|judgment/i);
    assert.ok(typeof r.disclaimer === 'string');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: CLI --category filter restricts metrics emitted', async () => {
  const ctx = await setupBrain();
  try {
    const { scoreQuality } = await import(SCRIPT);
    const r = await scoreQuality({ cwd: ctx.dir, category: 'a11y' });
    const metrics = r.scores.map((s) => s.metric);
    assert.deepEqual(metrics, ['accessibility_baseline_score']);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: Output written to _testatlas/brain/quality_scores.json with schema fields', async () => {
  const ctx = await setupBrain();
  try {
    const { scoreQuality } = await import(SCRIPT);
    await scoreQuality({ cwd: ctx.dir });
    const outPath = path.join(ctx.dir, '_testatlas', 'brain', 'quality_scores.json');
    const written = JSON.parse(await readFile(outPath, 'utf8'));
    assert.equal(written.schema_version, '2.0.0');
    assert.ok(Array.isArray(written.scores));
    assert.equal(written.scores.length, 11);
    for (const s of written.scores) {
      assert.ok(s.metric);
      assert.ok(typeof s.score === 'number');
      assert.ok(s.computed_at);
    }
  } finally {
    await ctx.cleanup();
  }
});
