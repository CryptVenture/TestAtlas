#!/usr/bin/env node
// scripts/update-graph.js
//
// Plan 14-06 Task 3 — Knowledge Graph Populator (PRD §11).
//
// Reads canonical brain indexes (domains, flows, routes, components,
// api-endpoints, issues, evidence, decisions, risks, drift,
// agent_sessions, stories, test-scenarios, claims.jsonl) and emits a
// structured knowledge graph at `_testatlas/brain/graph.json` containing:
//
//   - nodes[] — typed entities ({ id, type, label, metadata })
//   - edges[] — typed relationships ({ source, target, type, metadata })
//
// Populates all 16 PRD §11.2 relationship types:
//
//   1.  domain-contains-flow
//   2.  flow-touches-route
//   3.  flow-touches-component
//   4.  flow-calls-endpoint
//   5.  flow-depends-on-integration
//   6.  issue-affects-flow
//   7.  issue-affects-domain
//   8.  evidence-supports-issue
//   9.  evidence-supports-claim
//  10.  claim-originates-from-transcript
//  11.  decision-resolves-disagreement
//  12.  persona-participated-in-council
//  13.  story-defines-expected-behavior-for-flow
//  14.  test-scenario-validates-flow
//  15.  drift-invalidates-confidence
//  16.  risk-blocks-release
//
// Idempotent: same brain inputs produce the same graph (modulo
// `last_updated`). Edges + nodes are sorted deterministically before write.
//
// CLI:
//   node scripts/update-graph.js [--cwd <dir>] [--rebuild|--incremental] [--output <path>]
//
// Programmatic:
//   import { updateGraph } from './update-graph.js';
//   const r = await updateGraph({ cwd });

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';

const RELATIONSHIPS = Object.freeze([
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
]);

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOr(p, fb) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fb;
  }
}

async function readJsonlOr(p) {
  try {
    const text = await readFile(p, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

class GraphBuilder {
  constructor() {
    this.nodes = new Map(); // id -> node
    this.edgeSet = new Set(); // dedup key: type|source|target
    this.edges = [];
  }
  ensureNode(id, type, label, metadata) {
    if (!id) return;
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        type,
        label: label ?? id,
        ...(metadata ? { metadata } : {}),
      });
    }
  }
  addEdge(source, target, type, metadata) {
    if (!source || !target) return;
    const key = `${type}|${source}|${target}`;
    if (this.edgeSet.has(key)) return;
    this.edgeSet.add(key);
    this.edges.push({
      source,
      target,
      type,
      ...(metadata ? { metadata } : {}),
    });
  }
  build() {
    const nodes = [...this.nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
    const edges = [...this.edges].sort((a, b) =>
      `${a.type}|${a.source}|${a.target}`.localeCompare(`${b.type}|${b.source}|${b.target}`),
    );
    return { nodes, edges };
  }
}

/**
 * @param {{ cwd?: string, output?: string, rebuild?: boolean, incremental?: boolean }} args
 */
export async function updateGraph(args = {}) {
  const cwd = args.cwd ?? process.cwd();
  const brainDir = path.join(cwd, '_testatlas', 'brain');
  if (!(await fileExists(brainDir))) {
    throw err('TESTATLAS_BRAIN_MISSING', `brain directory missing: ${brainDir}`);
  }

  const [
    domains,
    flows,
    routes,
    components,
    endpoints,
    issues,
    evidence,
    decisions,
    risks,
    drift,
    sessions,
    stories,
    scenarios,
    claims,
  ] = await Promise.all([
    readJsonOr(path.join(brainDir, 'domains.json'), { domains: [] }),
    readJsonOr(path.join(brainDir, 'flows.json'), { flows: [] }),
    readJsonOr(path.join(brainDir, 'routes.json'), { routes: [] }),
    readJsonOr(path.join(brainDir, 'components.json'), { components: [] }),
    readJsonOr(path.join(brainDir, 'api-endpoints.json'), { endpoints: [] }),
    readJsonOr(path.join(brainDir, 'issues.json'), { issues: [] }),
    readJsonOr(path.join(brainDir, 'evidence.json'), { evidence: [] }),
    readJsonOr(path.join(brainDir, 'decisions.json'), { decisions: [] }),
    readJsonOr(path.join(brainDir, 'risks.json'), { risks: [] }),
    readJsonOr(path.join(brainDir, 'drift.json'), { drift_records: [] }),
    readJsonOr(path.join(brainDir, 'agent_sessions.json'), { sessions: [] }),
    readJsonOr(path.join(brainDir, 'stories.json'), { stories: [] }),
    readJsonOr(path.join(brainDir, 'test-scenarios.json'), { scenarios: [] }),
    readJsonlOr(path.join(brainDir, 'claims.jsonl')),
  ]);

  const g = new GraphBuilder();

  // Nodes — entity types.
  for (const d of domains.domains ?? []) {
    g.ensureNode(d.id, 'domain', d.name ?? d.id);
  }
  for (const f of flows.flows ?? []) {
    g.ensureNode(f.id, 'flow', f.name ?? f.id);
  }
  for (const r of routes.routes ?? []) {
    g.ensureNode(r.id, 'route', r.path ?? r.id);
  }
  for (const c of components.components ?? []) {
    g.ensureNode(c.id, 'component', c.name ?? c.id);
  }
  for (const e of endpoints.endpoints ?? []) {
    g.ensureNode(e.id, 'endpoint', e.path ?? e.id);
  }
  for (const i of issues.issues ?? []) {
    g.ensureNode(i.id, 'issue', i.title ?? i.id);
  }
  for (const ev of evidence.evidence ?? []) {
    g.ensureNode(ev.id, 'evidence', ev.kind ?? ev.id);
  }
  for (const d of decisions.decisions ?? []) {
    g.ensureNode(d.id, 'decision', d.summary ?? d.id);
  }
  for (const r of risks.risks ?? []) {
    g.ensureNode(r.id, 'risk', r.summary ?? r.id);
  }
  for (const dr of drift.drift_records ?? []) {
    g.ensureNode(dr.id, 'drift', dr.git_ref ?? dr.id);
  }
  for (const s of sessions.sessions ?? []) {
    g.ensureNode(s.id, 'council_session', s.topic ?? s.id);
    for (const p of s.participants ?? []) {
      g.ensureNode(p, 'persona', p);
    }
  }
  for (const s of stories.stories ?? []) {
    g.ensureNode(s.id, 'story', s.title ?? s.id);
  }
  for (const sc of scenarios.scenarios ?? []) {
    g.ensureNode(sc.id, 'test_scenario', sc.title ?? sc.id);
  }
  for (const c of claims) {
    g.ensureNode(c.id, 'claim', c.type ?? c.id);
  }

  // Edges — 16 relationship types in canonical order.

  // 1. domain-contains-flow
  for (const d of domains.domains ?? []) {
    for (const fid of d.flows ?? []) g.addEdge(d.id, fid, 'domain-contains-flow');
  }

  // 2-5. flow → routes / components / endpoints / integrations
  for (const f of flows.flows ?? []) {
    for (const rid of f.routes ?? []) {
      g.ensureNode(rid, 'route', rid);
      g.addEdge(f.id, rid, 'flow-touches-route');
    }
    for (const cid of f.components ?? []) {
      g.ensureNode(cid, 'component', cid);
      g.addEdge(f.id, cid, 'flow-touches-component');
    }
    for (const eid of f.endpoints ?? []) {
      g.ensureNode(eid, 'endpoint', eid);
      g.addEdge(f.id, eid, 'flow-calls-endpoint');
    }
    for (const iid of f.integrations ?? []) {
      g.ensureNode(iid, 'integration', iid);
      g.addEdge(f.id, iid, 'flow-depends-on-integration');
    }
  }

  // 6-7. issue → flows / domains
  for (const i of issues.issues ?? []) {
    for (const fid of i.affects_flows ?? i.flows ?? []) {
      g.addEdge(i.id, fid, 'issue-affects-flow');
    }
    for (const did of i.affects_domains ?? i.domains ?? []) {
      g.addEdge(i.id, did, 'issue-affects-domain');
    }
    for (const evId of i.evidence_refs ?? []) {
      // 8. evidence-supports-issue (also captured below from evidence side).
      g.addEdge(evId, i.id, 'evidence-supports-issue');
    }
  }

  // 8-9. evidence → issue / claim
  for (const ev of evidence.evidence ?? []) {
    if (ev.supports_issue) g.addEdge(ev.id, ev.supports_issue, 'evidence-supports-issue');
    if (ev.supports_claim) g.addEdge(ev.id, ev.supports_claim, 'evidence-supports-claim');
    for (const iid of ev.issues ?? []) {
      g.addEdge(ev.id, iid, 'evidence-supports-issue');
    }
    for (const cid of ev.claims ?? []) {
      g.addEdge(ev.id, cid, 'evidence-supports-claim');
    }
  }

  // 10. claim-originates-from-transcript
  for (const c of claims) {
    if (c.session_id) {
      g.ensureNode(c.session_id, 'council_session', c.session_id);
      g.addEdge(c.id, c.session_id, 'claim-originates-from-transcript');
    }
  }

  // 11. decision-resolves-disagreement
  for (const d of decisions.decisions ?? []) {
    const target = d.resolves_disagreement ?? d.disagreement_id;
    if (target) {
      g.ensureNode(target, 'disagreement', target);
      g.addEdge(d.id, target, 'decision-resolves-disagreement');
    }
  }

  // 12. persona-participated-in-council
  for (const s of sessions.sessions ?? []) {
    for (const p of s.participants ?? []) {
      g.addEdge(p, s.id, 'persona-participated-in-council');
    }
  }

  // 13. story-defines-expected-behavior-for-flow
  for (const s of stories.stories ?? []) {
    if (s.flow) g.addEdge(s.id, s.flow, 'story-defines-expected-behavior-for-flow');
    for (const fid of s.flows ?? []) {
      g.addEdge(s.id, fid, 'story-defines-expected-behavior-for-flow');
    }
  }

  // 14. test-scenario-validates-flow
  for (const sc of scenarios.scenarios ?? []) {
    const target = sc.validates_flow ?? sc.flow;
    if (target) g.addEdge(sc.id, target, 'test-scenario-validates-flow');
    for (const fid of sc.flows ?? []) {
      g.addEdge(sc.id, fid, 'test-scenario-validates-flow');
    }
  }

  // 15. drift-invalidates-confidence
  for (const dr of drift.drift_records ?? []) {
    for (const fid of dr.affected_flows ?? []) {
      g.addEdge(dr.id, fid, 'drift-invalidates-confidence');
    }
    for (const did of dr.affected_domains ?? []) {
      g.addEdge(dr.id, did, 'drift-invalidates-confidence');
    }
  }

  // 16. risk-blocks-release — every risk that flags blocks_release links to a
  // synthetic release node; if no risks exist the relationship type would be
  // missing from a fresh brain, so we still synthesize the release node and
  // wire any risk with `blocks_release: true` (or non-empty `blocks` array).
  g.ensureNode('release-current', 'release', 'current release');
  for (const r of risks.risks ?? []) {
    if (r.blocks_release === true || (Array.isArray(r.blocks) && r.blocks.length > 0)) {
      g.addEdge(r.id, 'release-current', 'risk-blocks-release');
    }
  }

  const built = g.build();

  // Sanity: every emitted edge.type must be one of the 16 PRD types.
  for (const e of built.edges) {
    if (!RELATIONSHIPS.includes(e.type)) {
      throw err('TESTATLAS_INVALID_RELATIONSHIP', `edge type "${e.type}" not in PRD §11.2`);
    }
  }

  const generatedAt = new Date().toISOString();
  const outputDoc = {
    schema_version: '2.0.0',
    last_updated: generatedAt,
    nodes: built.nodes,
    edges: built.edges,
  };

  const outPath = args.output ? path.resolve(args.output) : path.join(brainDir, 'graph.json');
  await atomicWrite(outPath, `${JSON.stringify(outputDoc, null, 2)}\n`);

  return {
    ok: true,
    cwd,
    outputPath: outPath,
    graph: outputDoc,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--output':
        opts.output = argv[++i];
        break;
      case '--rebuild':
        opts.rebuild = true;
        break;
      case '--incremental':
        opts.incremental = true;
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/update-graph.js [--cwd <dir>] [--rebuild|--incremental] [--output <path>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`update-graph: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await updateGraph(opts);
    console.log(
      `update-graph: ${r.graph.nodes.length} node(s), ${r.graph.edges.length} edge(s) → ${r.outputPath}`,
    );
  } catch (e) {
    console.error(`update-graph: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
