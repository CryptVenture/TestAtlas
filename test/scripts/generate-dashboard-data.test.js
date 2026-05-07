// test/scripts/generate-dashboard-data.test.js
//
// Plan 14-08 Task 1 — generate-dashboard-data.js produces a machine-readable
// dashboard export per PRD §16 from the brain JSON tree. Output validates
// against `dashboard_data.schema.json`.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-dashboard-data.js');

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-dashboard-'));
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
    project_name: 'fixture-project',
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
      { id: 'domain-auth', name: 'Authentication', flows: ['FLOW-1', 'FLOW-2'] },
      { id: 'domain-billing', name: 'Billing', flows: ['FLOW-3'] },
      { id: 'domain-profile', name: 'Profile', flows: [] },
    ],
  });
  await writeJson('flows.json', {
    schema_version: '2.0.0',
    last_updated: now,
    flows: [
      { id: 'FLOW-1', domain: 'domain-auth' },
      { id: 'FLOW-2', domain: 'domain-auth' },
      { id: 'FLOW-3', domain: 'domain-billing' },
    ],
  });
  await writeJson('issues.json', {
    schema_version: '2.0.0',
    last_updated: now,
    issues: [
      { id: 'ISSUE-1', severity: 'critical', status: 'open', domain: 'domain-auth' },
      { id: 'ISSUE-2', severity: 'high', status: 'open', domain: 'domain-billing' },
      { id: 'ISSUE-3', severity: 'medium', status: 'closed', domain: 'domain-auth' },
      { id: 'ISSUE-4', severity: 'low', status: 'open', domain: 'domain-profile' },
    ],
  });
  await writeJson('quality_scores.json', {
    schema_version: '2.0.0',
    last_updated: now,
    disclaimer: 'Scores aid decisions, not replace judgment.',
    scores: [
      {
        metric: 'domain_understanding_score',
        score: 75,
        freshness: 'fresh',
        confidence: 'confirmed',
        evidence_refs: ['EV-1'],
        computed_at: now,
      },
      {
        metric: 'flow_coverage_score',
        score: 60,
        freshness: 'fresh',
        confidence: 'strong_suspect',
        evidence_refs: [],
        computed_at: now,
      },
    ],
  });
  await writeJson('drift.json', {
    schema_version: '2.0.0',
    last_updated: now,
    drift_records: [
      {
        id: 'DRIFT-1',
        drift_status: 'fresh',
        detected_at: now,
        affected_domains: [],
        affected_flows: [],
        category: 'git_diff',
        source_path: 'README.md',
      },
      {
        id: 'DRIFT-2',
        drift_status: 'stale_requires_review',
        detected_at: now,
        affected_domains: ['domain-billing'],
        affected_flows: [],
        category: 'route',
        source_path: 'src/routes/foo.ts',
      },
    ],
  });
  await writeJson('agent_sessions.json', {
    schema_version: '2.0.0',
    last_updated: now,
    sessions: [
      {
        id: 'COUNCIL-2026-05-07-001',
        mode: 'roundtable-review',
        status: 'consolidated',
        created_at: now,
      },
    ],
  });
  await writeJson('decisions.json', {
    schema_version: '2.0.0',
    last_updated: now,
    decisions: [{ id: 'DEC-1', status: 'open', summary: 'pending review' }],
  });
  await writeFile(path.join(brainDir, 'events.jsonl'), '');
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: generateDashboardData produces JSON with PRD §16 fields', async () => {
  const ctx = await setupBrain();
  try {
    const { generateDashboardData } = await import(SCRIPT);
    const r = await generateDashboardData({ cwd: ctx.dir });
    assert.equal(typeof r, 'object');
    assert.equal(r.schema_version, '2.0.0');
    assert.match(r.generated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(r.project, 'fixture-project');
    assert.ok(r.quality_summary, 'has quality_summary');
    assert.ok(Array.isArray(r.domains), 'domains is array');
    assert.ok(r.issues_by_severity, 'has issues_by_severity');
    assert.ok(r.council_activity, 'has council_activity');
    assert.ok(r.drift, 'has drift');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: output validates against dashboard_data.schema.json', async () => {
  const ctx = await setupBrain();
  try {
    const { generateDashboardData } = await import(SCRIPT);
    const out = await generateDashboardData({ cwd: ctx.dir });
    const { loadAllSchemas } = await import(
      path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')
    );
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const v = ajv.getSchema('https://testatlas.dev/schemas/v2/dashboard_data.schema.json');
    assert.ok(v, 'schema registered');
    const ok = v(out);
    if (!ok) {
      throw new Error(`dashboard_data invalid: ${JSON.stringify(v.errors, null, 2)}`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: dashboard includes issue counts by severity and domain coverage', async () => {
  const ctx = await setupBrain();
  try {
    const { generateDashboardData } = await import(SCRIPT);
    const out = await generateDashboardData({ cwd: ctx.dir });
    assert.equal(out.issues_by_severity.critical, 1);
    assert.equal(out.issues_by_severity.high, 1);
    assert.equal(out.issues_by_severity.medium, 1);
    assert.equal(out.issues_by_severity.low, 1);
    assert.equal(out.quality_summary.open_critical, 1);
    assert.equal(out.quality_summary.open_high, 1);
    assert.equal(out.quality_summary.domains_total, 3);
    assert.ok(out.domains.length === 3, `domains: ${out.domains.length}`);
    for (const d of out.domains) {
      assert.ok(typeof d.id === 'string');
      assert.ok(typeof d.score === 'number');
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: drift summary lists stale_requires_review domains', async () => {
  const ctx = await setupBrain();
  try {
    const { generateDashboardData } = await import(SCRIPT);
    const out = await generateDashboardData({ cwd: ctx.dir });
    assert.ok(Array.isArray(out.drift.stale_domains));
    assert.ok(out.drift.stale_domains.includes('domain-billing'));
    assert.equal(typeof out.drift.drift_records_7_days, 'number');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: council_activity tallies sessions and open decisions', async () => {
  const ctx = await setupBrain();
  try {
    const { generateDashboardData } = await import(SCRIPT);
    const out = await generateDashboardData({ cwd: ctx.dir });
    assert.equal(out.council_activity.sessions_total, 1);
    assert.equal(typeof out.council_activity.sessions_last_7_days, 'number');
    assert.equal(out.council_activity.open_decisions, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: --output writes JSON to disk and is parseable', async () => {
  const ctx = await setupBrain();
  try {
    const out = path.join(ctx.dir, '_testatlas', 'reports', 'dashboard-data.json');
    const { generateDashboardData } = await import(SCRIPT);
    await generateDashboardData({ cwd: ctx.dir, output: out });
    const parsed = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(parsed.schema_version, '2.0.0');
    assert.equal(parsed.project, 'fixture-project');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 7: tolerates missing brain files (degrades to empty defaults)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-dashboard-empty-'));
  try {
    const brainDir = path.join(dir, '_testatlas', 'brain');
    await mkdir(brainDir, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(
      path.join(brainDir, 'manifest.json'),
      JSON.stringify({
        schema_version: '2.0.0',
        suite_version: '2.0.0',
        initialized_at: now,
        last_updated: now,
        project_name: 'empty-fixture',
        adapters: [],
        schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
      }),
    );
    const { generateDashboardData } = await import(SCRIPT);
    const out = await generateDashboardData({ cwd: dir });
    assert.equal(out.project, 'empty-fixture');
    assert.equal(out.quality_summary.domains_total, 0);
    assert.equal(out.issues_by_severity.critical, 0);
    assert.equal(out.council_activity.sessions_total, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
