#!/usr/bin/env node
// scripts/score-quality.js
//
// Plan 14-06 Task 1 — Quality Scoring Engine (PRD §7.15).
//
// Reads brain state and computes 11 quality metrics (each 0-100) from
// documented evidence:
//
//   1.  domain_understanding_score
//   2.  flow_coverage_score
//   3.  evidence_strength_score
//   4.  issue_actionability_score
//   5.  testability_score
//   6.  ux_confidence_score
//   7.  accessibility_baseline_score
//   8.  performance_confidence_score
//   9.  security_privacy_confidence_score
//  10.  brain_freshness_score
//  11.  council_consensus_score
//
// Every score is a deterministic function of brain state (no LLM judgment,
// no randomness). Re-running on the same brain produces the same score.
//
// Each score record carries:
//   - metric        (string)
//   - score         (integer 0-100)
//   - evidence_refs (string[]) — IDs of supporting brain records
//   - freshness     ("fresh" | "stale" | "unknown")
//   - confidence    ("confirmed" | "strong_suspect" | "needs_validation")
//   - computed_at   (ISO-8601 timestamp)
//
// Output also carries a top-level disclaimer reminding callers that scores
// aid decisions but never replace human judgment.
//
// CLI:
//   node scripts/score-quality.js [--cwd <dir>] [--output <path>] \
//       [--category all|domain|flow|evidence|issue|test|ux|a11y|perf|security|freshness|council]
//
// Programmatic:
//   import { scoreQuality } from './score-quality.js';
//   const r = await scoreQuality({ cwd, category, output });

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';

const DISCLAIMER =
  'Scores aid decisions, not replace judgment. Each metric is a deterministic projection of documented brain state — re-running on the same inputs produces the same score. Treat scores as a triage signal, not absolute truth.';

const METRIC_CATEGORIES = Object.freeze({
  domain: ['domain_understanding_score'],
  flow: ['flow_coverage_score'],
  evidence: ['evidence_strength_score'],
  issue: ['issue_actionability_score'],
  test: ['testability_score'],
  ux: ['ux_confidence_score'],
  a11y: ['accessibility_baseline_score'],
  perf: ['performance_confidence_score'],
  security: ['security_privacy_confidence_score'],
  freshness: ['brain_freshness_score'],
  council: ['council_consensus_score'],
});

const ALL_METRICS = [
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

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function readJsonOr(p, fb) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fb;
  }
}

function clampInt(n, lo = 0, hi = 100) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function pct(num, den) {
  if (!den || den <= 0) return 0;
  return clampInt((num / den) * 100);
}

function ageDays(iso, now = Date.now()) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (now - t) / (1000 * 60 * 60 * 24);
}

function freshnessFor(age) {
  if (!Number.isFinite(age)) return 'unknown';
  if (age <= 7) return 'fresh';
  if (age <= 30) return 'stale';
  return 'stale';
}

function confidenceFor(score, evidenceCount) {
  if (evidenceCount === 0) return 'needs_validation';
  if (score >= 80 && evidenceCount >= 3) return 'confirmed';
  if (score >= 50) return 'strong_suspect';
  return 'needs_validation';
}

/**
 * @param {{ cwd?: string, category?: string, output?: string }} args
 */
export async function scoreQuality(args = {}) {
  const cwd = args.cwd ?? process.cwd();
  const category = args.category ?? 'all';
  const brainDir = path.join(cwd, '_testatlas', 'brain');

  let brainStat;
  try {
    brainStat = await stat(brainDir);
  } catch {
    brainStat = null;
  }
  if (!brainStat?.isDirectory()) {
    throw err('TESTATLAS_BRAIN_MISSING', `brain directory missing: ${brainDir}`);
  }

  // Load all input indexes (tolerate missing files — yields 0 contribution).
  const [
    state,
    domains,
    flows,
    coverage,
    evidence,
    issues,
    sessions,
    decisions,
    drift,
    _risks,
    components,
    _routes,
    _endpoints,
    _claims,
  ] = await Promise.all([
    readJsonOr(path.join(brainDir, 'state.json'), {}),
    readJsonOr(path.join(brainDir, 'domains.json'), { domains: [] }),
    readJsonOr(path.join(brainDir, 'flows.json'), { flows: [] }),
    readJsonOr(path.join(brainDir, 'coverage.json'), { coverage: {} }),
    readJsonOr(path.join(brainDir, 'evidence.json'), { evidence: [] }),
    readJsonOr(path.join(brainDir, 'issues.json'), { issues: [] }),
    readJsonOr(path.join(brainDir, 'agent_sessions.json'), { sessions: [] }),
    readJsonOr(path.join(brainDir, 'decisions.json'), { decisions: [] }),
    readJsonOr(path.join(brainDir, 'drift.json'), { drift_records: [] }),
    readJsonOr(path.join(brainDir, 'risks.json'), { risks: [] }),
    readJsonOr(path.join(brainDir, 'components.json'), { components: [] }),
    readJsonOr(path.join(brainDir, 'routes.json'), { routes: [] }),
    readJsonOr(path.join(brainDir, 'api-endpoints.json'), { endpoints: [] }),
    readJsonOr(path.join(brainDir, 'claims.jsonl'), { claims: [] }),
  ]);

  const now = new Date();
  const nowIso = now.toISOString();
  const cov = coverage.coverage ?? {};

  const records = [];

  // 1. Domain understanding — % of declared domains with at least one flow + one evidence ref.
  {
    const list = domains.domains ?? [];
    const understood = list.filter((d) =>
      Array.isArray(d.flows) && d.flows.length > 0 && Array.isArray(d.evidence_refs)
        ? d.evidence_refs.length > 0
        : false,
    );
    const score = pct(understood.length, list.length);
    const refs = understood.flatMap((d) => d.evidence_refs ?? []);
    records.push({
      metric: 'domain_understanding_score',
      score,
      evidence_refs: [...new Set(refs)].slice(0, 32),
      freshness: freshnessFor(ageDays(domains.last_updated)),
      confidence: confidenceFor(score, refs.length),
      computed_at: nowIso,
    });
  }

  // 2. Flow coverage — % of flows that are tested.
  {
    const list = flows.flows ?? [];
    const tested = list.filter((f) => f.tested === true || (f.test_coverage?.percent ?? 0) > 0);
    const score = pct(tested.length, list.length);
    records.push({
      metric: 'flow_coverage_score',
      score,
      evidence_refs: tested
        .map((f) => f.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(flows.last_updated)),
      confidence: confidenceFor(score, tested.length),
      computed_at: nowIso,
    });
  }

  // 3. Evidence strength — combination of evidence count, kind diversity, and recency.
  {
    const list = evidence.evidence ?? [];
    const total = list.length;
    const kinds = new Set(list.map((e) => e.kind).filter(Boolean));
    const recent = list.filter((e) => ageDays(e.created_at) <= 30).length;
    const volumeScore = clampInt(Math.min(100, total * 10));
    const diversityScore = clampInt((kinds.size / 5) * 100);
    const recencyScore = pct(recent, total);
    const score = clampInt((volumeScore + diversityScore + recencyScore) / 3);
    records.push({
      metric: 'evidence_strength_score',
      score,
      evidence_refs: list
        .map((e) => e.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(evidence.last_updated)),
      confidence: confidenceFor(score, total),
      computed_at: nowIso,
    });
  }

  // 4. Issue actionability — % of issues with severity + repro_steps + acceptance_criteria.
  {
    const list = issues.issues ?? [];
    const actionable = list.filter(
      (i) =>
        i.severity &&
        Array.isArray(i.repro_steps) &&
        i.repro_steps.length > 0 &&
        Array.isArray(i.acceptance_criteria) &&
        i.acceptance_criteria.length > 0,
    );
    const score = pct(actionable.length, list.length);
    records.push({
      metric: 'issue_actionability_score',
      score,
      evidence_refs: actionable
        .map((i) => i.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(issues.last_updated)),
      confidence: confidenceFor(score, list.length),
      computed_at: nowIso,
    });
  }

  // 5. Testability — coverage across routes/components/endpoints/commands + automation candidates.
  {
    const dimensions = ['routes', 'components', 'endpoints', 'commands'];
    let weighted = 0;
    let denom = 0;
    const refs = [];
    for (const dim of dimensions) {
      const arr = cov[dim] ?? [];
      const tested = arr.filter((x) => x.tested === true);
      weighted += tested.length;
      denom += arr.length;
      refs.push(...tested.map((x) => x.id).filter(Boolean));
    }
    const flowList = flows.flows ?? [];
    const automationCandidates = flowList.filter((f) => f.automation_candidate === true).length;
    const flowAutoBonus = pct(automationCandidates, flowList.length);
    const baseScore = pct(weighted, denom);
    const score = clampInt(baseScore * 0.7 + flowAutoBonus * 0.3);
    records.push({
      metric: 'testability_score',
      score,
      evidence_refs: refs.slice(0, 32),
      freshness: freshnessFor(ageDays(coverage.last_updated)),
      confidence: confidenceFor(score, weighted),
      computed_at: nowIso,
    });
  }

  // 6. UX confidence — components covered + state completeness from coverage ledger.
  {
    const compArr = cov.components ?? components.components ?? [];
    const tested = compArr.filter((c) => c.tested === true);
    const stateCovered = (flows.flows ?? []).filter(
      (f) => Array.isArray(f.states) && f.states.length >= 3,
    ).length;
    const flowCount = (flows.flows ?? []).length;
    const compScore = pct(tested.length, compArr.length);
    const stateScore = pct(stateCovered, flowCount);
    const score = clampInt((compScore + stateScore) / 2);
    records.push({
      metric: 'ux_confidence_score',
      score,
      evidence_refs: tested
        .map((c) => c.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(coverage.last_updated ?? components.last_updated)),
      confidence: confidenceFor(score, tested.length + stateCovered),
      computed_at: nowIso,
    });
  }

  // 7. Accessibility baseline — presence of explore-accessibility findings tagged on issues.
  {
    const list = issues.issues ?? [];
    const a11yIssues = list.filter((i) =>
      Array.isArray(i.tags) ? i.tags.some((t) => /a11y|accessibility|wcag/i.test(t)) : false,
    );
    const flowsWithA11y = (flows.flows ?? []).filter(
      (f) =>
        f.accessibility_findings === true ||
        (Array.isArray(f.tags) && f.tags.some((t) => /a11y|accessibility/i.test(t))),
    );
    const flowList = flows.flows ?? [];
    // Score: penalise un-tested flows; reward those that have a11y findings recorded.
    const exploredScore = pct(flowsWithA11y.length, Math.max(flowList.length, 1));
    const issuePenalty = a11yIssues.filter((i) => i.severity === 'critical').length * 10;
    const score = clampInt(exploredScore - issuePenalty);
    records.push({
      metric: 'accessibility_baseline_score',
      score,
      evidence_refs: a11yIssues
        .map((i) => i.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(issues.last_updated)),
      confidence: confidenceFor(score, flowsWithA11y.length + a11yIssues.length),
      computed_at: nowIso,
    });
  }

  // 8. Performance confidence — performance-tagged flow exploration + critical perf issues.
  {
    const list = issues.issues ?? [];
    const perfIssues = list.filter((i) =>
      Array.isArray(i.tags) ? i.tags.some((t) => /perf|performance|latency/i.test(t)) : false,
    );
    const perfFlows = (flows.flows ?? []).filter((f) =>
      Array.isArray(f.tags) ? f.tags.some((t) => /perf|performance/i.test(t)) : false,
    );
    const total = (flows.flows ?? []).length;
    const exploredScore = pct(perfFlows.length, Math.max(total, 1));
    const penalty = perfIssues.filter((i) => /high|critical/.test(i.severity ?? '')).length * 15;
    const score = clampInt(exploredScore - penalty);
    records.push({
      metric: 'performance_confidence_score',
      score,
      evidence_refs: perfIssues
        .map((i) => i.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(issues.last_updated)),
      confidence: confidenceFor(score, perfFlows.length + perfIssues.length),
      computed_at: nowIso,
    });
  }

  // 9. Security & privacy confidence — security-tagged exploration + open critical security issues.
  {
    const list = issues.issues ?? [];
    const secIssues = list.filter((i) =>
      Array.isArray(i.tags)
        ? i.tags.some((t) => /sec|security|privacy|owasp|authn|authz/i.test(t))
        : false,
    );
    const secFlows = (flows.flows ?? []).filter((f) =>
      Array.isArray(f.tags) ? f.tags.some((t) => /sec|security|privacy/i.test(t)) : false,
    );
    const total = (flows.flows ?? []).length;
    const exploredScore = pct(secFlows.length, Math.max(total, 1));
    const open = secIssues.filter(
      (i) => /high|critical/.test(i.severity ?? '') && i.status !== 'closed',
    ).length;
    const penalty = open * 20;
    const score = clampInt(exploredScore - penalty);
    records.push({
      metric: 'security_privacy_confidence_score',
      score,
      evidence_refs: secIssues
        .map((i) => i.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(issues.last_updated)),
      confidence: confidenceFor(score, secFlows.length + secIssues.length),
      computed_at: nowIso,
    });
  }

  // 10. Brain freshness — based on drift records and time since last brain update.
  {
    const records10 = drift.drift_records ?? [];
    const stale = records10.filter((d) =>
      ['stale_requires_review', 'possibly_stale'].includes(d.drift_status),
    ).length;
    const total = Math.max(records10.length, 1);
    const driftPenalty = (stale / total) * 100;
    const lastUpdate = state.last_updated ?? '';
    const updateAge = ageDays(lastUpdate);
    const ageScore = updateAge <= 7 ? 100 : updateAge <= 30 ? 70 : updateAge <= 90 ? 40 : 10;
    const score = clampInt(ageScore - driftPenalty);
    const fr = updateAge <= 7 ? 'fresh' : updateAge <= 30 ? 'stale' : 'stale';
    records.push({
      metric: 'brain_freshness_score',
      score,
      evidence_refs: records10
        .map((d) => d.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: Number.isFinite(updateAge) ? fr : 'unknown',
      confidence: confidenceFor(score, records10.length || (lastUpdate ? 1 : 0)),
      computed_at: nowIso,
    });
  }

  // 11. Council consensus — disagreement-resolution rate across recorded sessions.
  {
    const list = sessions.sessions ?? [];
    let resolved = 0;
    let total = 0;
    for (const s of list) {
      const d = Number(s.disagreements ?? 0);
      const r = Number(s.disagreements_resolved ?? 0);
      total += d;
      resolved += Math.min(r, d);
    }
    const decisionsList = decisions.decisions ?? [];
    const sessionScore = total === 0 ? (list.length > 0 ? 80 : 0) : pct(resolved, total);
    const decisionBonus = Math.min(20, decisionsList.length * 5);
    const score = clampInt(sessionScore + decisionBonus);
    records.push({
      metric: 'council_consensus_score',
      score,
      evidence_refs: list
        .map((s) => s.id)
        .filter(Boolean)
        .slice(0, 32),
      freshness: freshnessFor(ageDays(sessions.last_updated)),
      confidence: confidenceFor(score, list.length),
      computed_at: nowIso,
    });
  }

  // Apply category filter — keep records in canonical metric order.
  let filtered = records;
  if (category && category !== 'all') {
    const wanted = METRIC_CATEGORIES[category];
    if (!wanted) {
      throw err(
        'TESTATLAS_INVALID_CATEGORY',
        `unknown --category "${category}"; valid: all, ${Object.keys(METRIC_CATEGORIES).join(', ')}`,
      );
    }
    filtered = records.filter((r) => wanted.includes(r.metric));
  }

  // Stable canonical order regardless of input order.
  filtered.sort((a, b) => ALL_METRICS.indexOf(a.metric) - ALL_METRICS.indexOf(b.metric));

  const outputDoc = {
    schema_version: '2.0.0',
    last_updated: nowIso,
    disclaimer: DISCLAIMER,
    scores: filtered,
  };

  const outPath = args.output
    ? path.resolve(args.output)
    : path.join(brainDir, 'quality_scores.json');
  await atomicWrite(outPath, `${JSON.stringify(outputDoc, null, 2)}\n`);

  return {
    ok: true,
    cwd,
    category,
    scores: filtered,
    disclaimer: DISCLAIMER,
    outputPath: outPath,
  };
}

const isMain = isMainModule(import.meta.url);
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
      case '--category':
        opts.category = argv[++i];
        break;
      case '--help':
      case '-h':
        console.log(
          `Usage: node scripts/score-quality.js [--cwd <dir>] [--output <path>] [--category ${['all', ...Object.keys(METRIC_CATEGORIES)].join('|')}]`,
        );
        process.exit(0);
        break;
      default:
        console.error(`score-quality: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await scoreQuality(opts);
    console.log(
      `score-quality: wrote ${r.scores.length} score(s) → ${r.outputPath}\n${DISCLAIMER}`,
    );
  } catch (e) {
    console.error(`score-quality: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
