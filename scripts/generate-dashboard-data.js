#!/usr/bin/env node
// scripts/generate-dashboard-data.js
//
// Plan 14-08 Task 1 — Dashboard Data Export (PRD §16).
//
// Reads brain state and projects a pre-aggregated `dashboard-data.json`
// shaped for downstream consumers (external dashboards, static HTML reports,
// CI status pages). The output is:
//
//   - schema-validated against `dashboard_data.schema.json`,
//   - byte-stable per-input (modulo the `generated_at` ISO timestamp),
//   - tolerant of missing brain files (degrades to empty defaults),
//   - never panics on partial workspaces.
//
// Output shape (frozen per dashboard_data.schema.json):
//
//   {
//     schema_version: "2.0.0",
//     generated_at:   ISO-8601,
//     project:        string,
//     quality_summary: { overall_score, domains_tested, domains_total,
//                        open_critical, open_high },
//     domains:        [{ id, name?, score, open_issues, drift_status }],
//     issues_by_severity: { critical, high, medium, low, enhancement? },
//     council_activity: { sessions_total, sessions_last_7_days, open_decisions },
//     drift: { stale_domains[], drift_records_7_days }
//   }
//
// CLI:
//   node scripts/generate-dashboard-data.js [--cwd <dir>] [--output <path>]
//                                          [--format json|html-preview]
//
// Programmatic:
//   import { generateDashboardData } from './generate-dashboard-data.js';
//   const r = await generateDashboardData({ cwd, output });

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const SCHEMA_ID = 'https://testatlas.dev/schemas/v2/dashboard_data.schema.json';
const SCHEMA_VERSION = '2.0.0';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * Read JSON file with fallback. Tolerates ENOENT and parse errors by
 * returning the supplied fallback. Production workspaces are commonly
 * partially-populated and the dashboard MUST degrade gracefully.
 */
async function readJsonOr(filePath, fallback) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    if (e instanceof SyntaxError) return fallback;
    throw e;
  }
}

function projectName(manifest) {
  if (manifest && typeof manifest.project_name === 'string' && manifest.project_name.length > 0) {
    return manifest.project_name;
  }
  return 'unknown-project';
}

function safeArray(obj, key) {
  if (!obj) return [];
  const v = obj[key];
  return Array.isArray(v) ? v : [];
}

function tallyIssues(issues) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, enhancement: 0 };
  for (const issue of issues) {
    const sev = issue?.severity;
    if (sev === 'critical') counts.critical++;
    else if (sev === 'high') counts.high++;
    else if (sev === 'medium') counts.medium++;
    else if (sev === 'low') counts.low++;
    else if (sev === 'enhancement') counts.enhancement++;
  }
  return counts;
}

function tallyOpenIssuesBySeverity(issues, severity) {
  return issues.filter((i) => i?.severity === severity && i?.status !== 'closed').length;
}

function tallyOpenIssuesByDomain(issues) {
  const m = new Map();
  for (const issue of issues) {
    if (issue?.status === 'closed') continue;
    const d = issue?.domain;
    if (!d) continue;
    m.set(d, (m.get(d) || 0) + 1);
  }
  return m;
}

function buildDriftStatusByDomain(driftRecords) {
  // Highest severity wins per domain: stale_requires_review > possibly_stale > fresh > unknown
  const rank = { unknown: 0, fresh: 1, possibly_stale: 2, stale_requires_review: 3 };
  const m = new Map();
  for (const rec of driftRecords) {
    const status = rec?.drift_status || 'unknown';
    const r = rank[status] ?? 0;
    for (const d of safeArray(rec, 'affected_domains')) {
      const cur = m.get(d);
      if (!cur || r > rank[cur]) m.set(d, status);
    }
  }
  return m;
}

function buildDomainScoreMap(qualityScores, domains) {
  // Per-domain score: domain_understanding_score for now (no per-domain
  // breakdown in the brain v1; PRD §16 just requires `score` per domain).
  // We use the overall `domain_understanding_score` if present, else 0.
  const scores = safeArray(qualityScores, 'scores');
  const overall = scores.find((s) => s?.metric === 'domain_understanding_score');
  const baseline = overall?.score ?? 0;
  const m = new Map();
  for (const d of domains) {
    if (d?.id) m.set(d.id, baseline);
  }
  return m;
}

function computeOverallScore(qualityScores) {
  const scores = safeArray(qualityScores, 'scores');
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + (typeof s?.score === 'number' ? s.score : 0), 0);
  return Math.round(sum / scores.length);
}

function staleDomains(driftRecords) {
  const set = new Set();
  for (const rec of driftRecords) {
    if (rec?.drift_status === 'stale_requires_review') {
      for (const d of safeArray(rec, 'affected_domains')) set.add(d);
    }
  }
  return Array.from(set).sort();
}

function recentDriftCount(driftRecords, now) {
  const cutoff = now.getTime() - SEVEN_DAYS_MS;
  let n = 0;
  for (const rec of driftRecords) {
    const ts = rec?.detected_at;
    if (!ts) continue;
    const t = Date.parse(ts);
    if (Number.isFinite(t) && t >= cutoff) n++;
  }
  return n;
}

function recentSessionCount(sessions, now) {
  const cutoff = now.getTime() - SEVEN_DAYS_MS;
  let n = 0;
  for (const s of sessions) {
    const ts = s?.created_at;
    if (!ts) continue;
    const t = Date.parse(ts);
    if (Number.isFinite(t) && t >= cutoff) n++;
  }
  return n;
}

function openDecisionCount(decisions) {
  return decisions.filter((d) => d?.status === 'open').length;
}

function domainsTestedCount(domains, flows, _qualityScores) {
  // A domain is "tested" if it has at least one flow AND at least one
  // quality_score record references its id (best-effort heuristic since
  // the brain does not yet expose per-domain testedness directly).
  const flowDomains = new Set();
  for (const f of flows) {
    if (f?.domain) flowDomains.add(f.domain);
  }
  // Also consider domains with non-empty `flows` array on the domain record.
  let tested = 0;
  for (const d of domains) {
    if (!d?.id) continue;
    const hasFlows = Array.isArray(d.flows) ? d.flows.length > 0 : false;
    const inFlows = flowDomains.has(d.id);
    if (hasFlows || inFlows) tested++;
  }
  return tested;
}

/**
 * Generate dashboard data from brain state.
 *
 * @param {object} opts
 * @param {string} [opts.cwd]      - Repo root (default: process.cwd()).
 * @param {string} [opts.output]   - Optional file path to atomically write.
 * @param {string} [opts.format]   - 'json' (default) — html-preview reserved.
 * @returns {Promise<object>}      - The dashboard data object (also written
 *                                   to `output` when provided).
 */
export async function generateDashboardData({ cwd = process.cwd(), output, format } = {}) {
  if (format && !['json', 'html-preview'].includes(format)) {
    throw err('BAD_FORMAT', `--format must be json|html-preview (got ${format})`);
  }
  const brainDir = path.join(cwd, '_testatlas', 'brain');

  const manifest = await readJsonOr(path.join(brainDir, 'manifest.json'), null);
  const domainsDoc = await readJsonOr(path.join(brainDir, 'domains.json'), { domains: [] });
  const flowsDoc = await readJsonOr(path.join(brainDir, 'flows.json'), { flows: [] });
  const issuesDoc = await readJsonOr(path.join(brainDir, 'issues.json'), { issues: [] });
  const qualityDoc = await readJsonOr(path.join(brainDir, 'quality_scores.json'), { scores: [] });
  const driftDoc = await readJsonOr(path.join(brainDir, 'drift.json'), { drift_records: [] });
  const sessionsDoc = await readJsonOr(path.join(brainDir, 'agent_sessions.json'), {
    sessions: [],
  });
  const decisionsDoc = await readJsonOr(path.join(brainDir, 'decisions.json'), { decisions: [] });

  const domains = safeArray(domainsDoc, 'domains');
  const flows = safeArray(flowsDoc, 'flows');
  const issues = safeArray(issuesDoc, 'issues');
  const driftRecords = safeArray(driftDoc, 'drift_records');
  const sessions = safeArray(sessionsDoc, 'sessions');
  const decisions = safeArray(decisionsDoc, 'decisions');

  const now = new Date();
  const issueCounts = tallyIssues(issues);
  const openIssuesByDomain = tallyOpenIssuesByDomain(issues);
  const driftByDomain = buildDriftStatusByDomain(driftRecords);
  const scoreByDomain = buildDomainScoreMap(qualityDoc, domains);

  const dashboardDomains = domains
    .filter((d) => typeof d?.id === 'string')
    .map((d) => {
      const entry = {
        id: d.id,
        score: scoreByDomain.get(d.id) ?? 0,
        open_issues: openIssuesByDomain.get(d.id) ?? 0,
        drift_status: driftByDomain.get(d.id) ?? 'unknown',
      };
      if (typeof d.name === 'string') entry.name = d.name;
      return entry;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const dashboard = {
    schema_version: SCHEMA_VERSION,
    generated_at: now.toISOString(),
    project: projectName(manifest),
    quality_summary: {
      overall_score: computeOverallScore(qualityDoc),
      domains_tested: domainsTestedCount(domains, flows, qualityDoc),
      domains_total: domains.length,
      open_critical: tallyOpenIssuesBySeverity(issues, 'critical'),
      open_high: tallyOpenIssuesBySeverity(issues, 'high'),
    },
    domains: dashboardDomains,
    issues_by_severity: {
      critical: issueCounts.critical,
      high: issueCounts.high,
      medium: issueCounts.medium,
      low: issueCounts.low,
      enhancement: issueCounts.enhancement,
    },
    council_activity: {
      sessions_total: sessions.length,
      sessions_last_7_days: recentSessionCount(sessions, now),
      open_decisions: openDecisionCount(decisions),
    },
    drift: {
      stale_domains: staleDomains(driftRecords),
      drift_records_7_days: recentDriftCount(driftRecords, now),
    },
  };

  // Validate before write — bad dashboards never reach disk.
  const ajv = await loadAllSchemas({ cwd: process.cwd() });
  const validate = ajv.getSchema(SCHEMA_ID);
  if (!validate) {
    // schema-loader silently tolerates a missing schemas dir (e.g. when this
    // script is consumed from a non-suite repo). Re-load against the script's
    // own repo as a fallback.
    // import.meta.dirname (Node 20.11+) avoids the Windows pathname bug
    // where `new URL(import.meta.url).pathname` produces `/D:/...` that
    // path.resolve then mangles into `D:\D:\...`.
    const here = path.resolve(import.meta.dirname, '..');
    const ajv2 = await loadAllSchemas({ cwd: here });
    const v2 = ajv2.getSchema(SCHEMA_ID);
    if (!v2) {
      throw err('SCHEMA_NOT_REGISTERED', `dashboard_data.schema.json not registered`);
    }
    if (!v2(dashboard)) {
      throw err(
        'DASHBOARD_SCHEMA_VIOLATION',
        `dashboard data invalid: ${JSON.stringify(v2.errors)}`,
      );
    }
  } else if (!validate(dashboard)) {
    throw err(
      'DASHBOARD_SCHEMA_VIOLATION',
      `dashboard data invalid: ${JSON.stringify(validate.errors)}`,
    );
  }

  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await atomicWrite(output, `${JSON.stringify(dashboard, null, 2)}\n`);
  }

  return dashboard;
}

// CLI entry-point.
async function main() {
  const argv = process.argv.slice(2);
  const opts = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') opts.cwd = argv[++i];
    else if (a === '--output') opts.output = argv[++i];
    else if (a === '--format') opts.format = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: generate-dashboard-data.js [--cwd <dir>] [--output <path>] [--format json|html-preview]',
      );
      return 0;
    } else if (a.startsWith('--')) {
      throw err('BAD_FLAG', `unknown flag: ${a}`);
    }
  }
  const out = opts.output || path.join(opts.cwd, '_testatlas', 'reports', 'dashboard-data.json');
  const data = await generateDashboardData({ cwd: opts.cwd, output: out, format: opts.format });
  console.log(`Wrote ${path.relative(opts.cwd, out)} (project=${data.project})`);
  return 0;
}

const isCLI = isMainModule(import.meta.url);
if (isCLI) {
  main().catch((e) => {
    console.error(`generate-dashboard-data: ${e.code || 'ERROR'}: ${e.message}`);
    process.exit(1);
  });
}
