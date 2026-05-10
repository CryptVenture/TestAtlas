// test/scripts/update-graph.test.js
//
// Plan 14-06 Task 3 — update-graph.js populates _testatlas/brain/graph.json
// with all 16 PRD §11.2 relationship types.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-graph.js');

const RELATIONSHIPS = [
  'domain-contains-flow',
  'flow-touches-route',
  'flow-touches-component',
  'flow-calls-endpoint',
  'flow-depends-on-integration',
  'issue-affects-flow',
  'issue-affects-domain',
  'evidence-supports-issue',
  'evidence-supports-claim',
  'claim-originates-from-transcript',
  'decision-resolves-disagreement',
  'persona-participated-in-council',
  'story-defines-expected-behavior-for-flow',
  'test-scenario-validates-flow',
  'drift-invalidates-confidence',
  'risk-blocks-release',
];

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-update-graph-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();
  const writeJson = (n, b) => writeFile(path.join(brainDir, n), JSON.stringify(b, null, 2));
  const writeJsonl = (n, recs) =>
    writeFile(path.join(brainDir, n), `${recs.map((r) => JSON.stringify(r)).join('\n')}\n`);

  await writeJson('manifest.json', {
    schema_version: '2.0.0',
    suite_version: '2.0.0',
    initialized_at: now,
    last_updated: now,
    project_name: 'fixture',
    adapters: [],
    schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
  });
  await writeJson('state.json', { schema_version: '2.0.0', last_updated: now });
  await writeJson('domains.json', {
    schema_version: '2.0.0',
    last_updated: now,
    domains: [
      { id: 'domain-auth', flows: ['FLOW-1', 'FLOW-2'] },
      { id: 'domain-billing', flows: ['FLOW-3'] },
    ],
  });
  await writeJson('flows.json', {
    schema_version: '2.0.0',
    last_updated: now,
    flows: [
      {
        id: 'FLOW-1',
        routes: ['R-login'],
        components: ['Login', 'AuthGuard'],
        endpoints: ['POST /auth/login'],
        integrations: ['oauth-provider'],
      },
      { id: 'FLOW-2', routes: ['R-logout'], components: [], endpoints: [], integrations: [] },
      { id: 'FLOW-3', routes: [], components: ['Cart'], endpoints: ['POST /billing/charge'] },
    ],
  });
  await writeJson('routes.json', {
    schema_version: '2.0.0',
    last_updated: now,
    routes: [
      { id: 'R-login', path: '/login' },
      { id: 'R-logout', path: '/logout' },
    ],
  });
  await writeJson('components.json', {
    schema_version: '2.0.0',
    last_updated: now,
    components: [{ id: 'Login' }, { id: 'AuthGuard' }, { id: 'Cart' }],
  });
  await writeJson('api-endpoints.json', {
    schema_version: '2.0.0',
    last_updated: now,
    endpoints: [{ id: 'POST /auth/login' }, { id: 'POST /billing/charge' }],
  });
  await writeJson('issues.json', {
    schema_version: '2.0.0',
    last_updated: now,
    issues: [
      {
        id: 'ISSUE-1',
        affects_flows: ['FLOW-1'],
        affects_domains: ['domain-auth'],
        evidence_refs: ['EV-1'],
      },
    ],
  });
  await writeJson('evidence.json', {
    schema_version: '2.0.0',
    last_updated: now,
    evidence: [{ id: 'EV-1', supports_issue: 'ISSUE-1', supports_claim: 'CLAIM-1' }],
  });
  await writeJson('decisions.json', {
    schema_version: '2.0.0',
    last_updated: now,
    decisions: [{ id: 'DEC-1', resolves_disagreement: 'DIS-1' }],
  });
  await writeJson('risks.json', {
    schema_version: '2.0.0',
    last_updated: now,
    risks: [{ id: 'RISK-1', blocks_release: true }],
  });
  await writeJson('drift.json', {
    schema_version: '2.0.0',
    last_updated: now,
    drift_records: [
      {
        id: 'DRIFT-0001',
        git_ref: 'abc..HEAD',
        drift_status: 'stale_requires_review',
        affected_flows: ['FLOW-1'],
        detected_at: now,
      },
    ],
  });
  await writeJson('agent_sessions.json', {
    schema_version: '2.0.0',
    last_updated: now,
    sessions: [{ id: 'COUNCIL-1', participants: ['qa-lead', 'security-privacy-reviewer'] }],
  });
  await writeJson('stories.json', {
    schema_version: '2.0.0',
    last_updated: now,
    stories: [{ id: 'STORY-1', flow: 'FLOW-1' }],
  });
  await writeJson('test-scenarios.json', {
    schema_version: '2.0.0',
    last_updated: now,
    scenarios: [{ id: 'SCN-1', validates_flow: 'FLOW-1' }],
  });
  await writeJsonl('claims.jsonl', [
    {
      id: 'CLAIM-1',
      session_id: 'COUNCIL-1',
      type: 'observed',
      claim: 'demo',
      created_at: now,
    },
  ]);
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: updateGraph reads brain indexes and populates nodes + edges', async () => {
  const ctx = await setupBrain();
  try {
    const { updateGraph } = await import(pathToFileURL(SCRIPT).href);
    const r = await updateGraph({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    assert.ok(Array.isArray(r.graph.nodes));
    assert.ok(Array.isArray(r.graph.edges));
    assert.ok(r.graph.nodes.length > 0, 'expected nodes populated');
    assert.ok(r.graph.edges.length > 0, 'expected edges populated');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: all 16 PRD §11.2 relationship types appear at least once', async () => {
  const ctx = await setupBrain();
  try {
    const { updateGraph } = await import(pathToFileURL(SCRIPT).href);
    const r = await updateGraph({ cwd: ctx.dir });
    const types = new Set(r.graph.edges.map((e) => e.type));
    for (const t of RELATIONSHIPS) {
      assert.ok(types.has(t), `missing relationship type: ${t}`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: graph.json validates against relationship.schema.json', async () => {
  const ctx = await setupBrain();
  try {
    const { updateGraph } = await import(pathToFileURL(SCRIPT).href);
    await updateGraph({ cwd: ctx.dir });
    const out = JSON.parse(
      await readFile(path.join(ctx.dir, '_testatlas', 'brain', 'graph.json'), 'utf8'),
    );
    const { loadAllSchemas } = await import(
      pathToFileURL(path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')).href
    );
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const v = ajv.getSchema('https://testatlas.dev/schemas/v2/relationship.schema.json');
    const ok = v(out);
    if (!ok) {
      throw new Error(`graph.json failed schema: ${JSON.stringify(v.errors)}`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: idempotent — second run produces the same edges + nodes', async () => {
  const ctx = await setupBrain();
  try {
    const { updateGraph } = await import(pathToFileURL(SCRIPT).href);
    const r1 = await updateGraph({ cwd: ctx.dir });
    const r2 = await updateGraph({ cwd: ctx.dir });
    // Compare ignoring last_updated which is regenerated each run.
    const norm = (g) => ({
      nodes: [...g.nodes].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...g.edges].sort((a, b) =>
        `${a.type}|${a.source}|${a.target}`.localeCompare(`${b.type}|${b.source}|${b.target}`),
      ),
    });
    assert.deepEqual(norm(r1.graph), norm(r2.graph));
  } finally {
    await ctx.cleanup();
  }
});
