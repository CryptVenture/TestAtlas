// scripts/sync-scorecard.js
//
// Quick 260505-wjp Task 2 (G1): Regenerator for the 5 generated sections in
// _testatlas/13_quality_scorecard.md. Refreshes manifest.generatedSections
// hashes for all 5 slugs in lockstep with the section bytes.
//
// CLI:
//   node scripts/sync-scorecard.js [--workspace <p>] [--cwd <p>] [--dry-run] [--help]
//
// Mirrors the structure of sync-status.js. Reads:
//   - manifest.counts (for coverage)
//   - to_fix/ISSUE-*.json (severity, confidence, blockers tallies)
//   - tests/runs/RUN-*.{md,json} (flows-tested denominator vs counts.flows)
//
// Renders, per PRD §28 + plan spec:
//   - coverage                       (lines: domains, flows, flows-tested, coverage %)
//   - severity-weighted-issue-load   (lines: critical/high/medium/low/enhancement + weighted)
//   - confidence-trend               (lines: confirmed/strong-suspect/needs-validation)
//   - blockers-trend                 (lines: open / resolved-this-run / net-change)
//   - last-updated                   (single line: ISO timestamp)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { hashContent } from './lib/content-hash.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { loadConfig } from './lib/load-config.js';
import { parseMarkers, renderSection } from './lib/markers.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const SCORECARD_FILE = '13_quality_scorecard.md';
const MANIFEST = '11_workspace_manifest.json';
const SECTIONS = [
  'coverage',
  'severity-weighted-issue-load',
  'confidence-trend',
  'blockers-trend',
  'last-updated',
];

const SEVERITY_WEIGHTS = {
  critical: 5,
  high: 3,
  medium: 1,
  low: 0.5,
  enhancement: 0,
};

async function readJsonSafe(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function loadIssues(wsDir) {
  const issuesDir = path.join(wsDir, 'to_fix');
  let entries = [];
  try {
    entries = await sortedReaddir(issuesDir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json') || !/^ISSUE-/.test(e.name)) continue;
    const j = await readJsonSafe(path.join(issuesDir, e.name));
    if (j && typeof j === 'object') out.push(j);
  }
  return out;
}

async function countTestRuns(wsDir) {
  const runsDir = path.join(wsDir, 'tests', 'runs');
  try {
    const entries = await sortedReaddir(runsDir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && /^RUN-/.test(e.name) && /\.(md|json)$/.test(e.name))
      .length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

function renderCoverage(counts, flowsTested) {
  const domainsTotal = counts.domains ?? 0;
  const flowsTotal = counts.flows ?? 0;
  const tested = Math.min(flowsTested, flowsTotal);
  const pct = flowsTotal === 0 ? 0 : Math.round((tested / flowsTotal) * 100);
  return [
    `- Domains mapped: ${domainsTotal} / ${domainsTotal}`,
    `- Flows mapped: ${flowsTotal} / ${flowsTotal}`,
    `- Flows tested: ${tested} / ${flowsTotal}`,
    `- Coverage score: ${pct}%`,
  ];
}

function renderSeverity(issues) {
  const tally = { critical: 0, high: 0, medium: 0, low: 0, enhancement: 0 };
  for (const i of issues) {
    const s = String(i.severity ?? '').toLowerCase();
    if (s in tally) tally[s] += 1;
  }
  const weighted =
    tally.critical * SEVERITY_WEIGHTS.critical +
    tally.high * SEVERITY_WEIGHTS.high +
    tally.medium * SEVERITY_WEIGHTS.medium +
    tally.low * SEVERITY_WEIGHTS.low +
    tally.enhancement * SEVERITY_WEIGHTS.enhancement;
  return [
    `- Critical: ${tally.critical}`,
    `- High: ${tally.high}`,
    `- Medium: ${tally.medium}`,
    `- Low: ${tally.low}`,
    `- Enhancement: ${tally.enhancement}`,
    `- Weighted load: ${Math.round(weighted * 10) / 10}`,
  ];
}

function renderConfidence(issues) {
  const tally = { confirmed: 0, 'strong-suspect': 0, 'needs-validation': 0 };
  for (const i of issues) {
    const c = String(i.confidence ?? '').toLowerCase();
    if (c in tally) tally[c] += 1;
  }
  return [
    `- Confirmed: ${tally.confirmed}`,
    `- Strong-suspect: ${tally['strong-suspect']}`,
    `- Needs-validation: ${tally['needs-validation']}`,
  ];
}

function renderBlockers(issues, priorBlockers) {
  let open = 0;
  for (const i of issues) {
    const sev = String(i.severity ?? '').toLowerCase();
    const status = String(i.status ?? '').toLowerCase();
    if (sev === 'critical' && (status === 'confirmed' || status === 'strong-suspect')) {
      open += 1;
    }
  }
  const delta = open - (priorBlockers ?? 0);
  return [`- Currently open: ${open}`, '- Resolved this run: 0', `- Net change: ${delta}`];
}

/**
 * Programmatic entry. Mirrors syncStatus(args, _inject).
 *
 * @param {{workspaceDir?: string, cwd?: string, dryRun?: boolean}} [args]
 * @param {{atomicWrite?: typeof atomicWrite, assertNotUpdate?: typeof assertNotUpdate, now?: () => string}} [_inject]
 * @returns {Promise<{
 *   dryRun: boolean,
 *   manifestChanged: boolean,
 *   scorecardUpdated: boolean,
 *   changedSections: string[],
 *   hashes: Record<string,string>
 * }>}
 */
export async function syncScorecard(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _now = _inject.now ?? now;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;

  // Load manifest
  const manifestPath = path.join(wsDir, MANIFEST);
  let manifestText;
  try {
    manifestText = await readFile(manifestPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`sync-scorecard: ${MANIFEST} not found at ${manifestPath}`);
      e.code = 'TESTATLAS_MANIFEST_MISSING';
      throw e;
    }
    throw err;
  }
  const manifest = JSON.parse(manifestText);
  const counts = manifest.counts ?? {};

  // Load scorecard
  const scorecardPath = path.join(wsDir, SCORECARD_FILE);
  let scorecardText;
  try {
    scorecardText = await readFile(scorecardPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(
        `sync-scorecard: ${SCORECARD_FILE} not found at ${scorecardPath} — run /atlas:init to bootstrap.`,
      );
      e.code = 'TESTATLAS_CANONICAL_MISSING';
      throw e;
    }
    throw err;
  }
  const { sections, errors } = parseMarkers(scorecardText);
  if (errors.length > 0) {
    const e = new Error(
      `sync-scorecard: refusing to write — ${SCORECARD_FILE} has marker errors:\n  ${errors
        .map((x) => `[${x.code} line ${x.line}] ${x.message}`)
        .join('\n  ')}`,
    );
    e.code = 'TESTATLAS_MARKER_INVALID';
    e.errors = errors;
    throw e;
  }

  // Gather inputs
  const issues = await loadIssues(wsDir);
  const flowsTested = await countTestRuns(wsDir);
  const priorBlockers = 0; // tracked via manifest.counts.blockers in a future iteration

  // Render bodies
  const bodies = {
    coverage: renderCoverage(counts, flowsTested),
    'severity-weighted-issue-load': renderSeverity(issues),
    'confidence-trend': renderConfidence(issues),
    'blockers-trend': renderBlockers(issues, priorBlockers),
    'last-updated': [_now()],
  };

  // Apply each section
  let nextText = scorecardText;
  const changedSections = [];
  for (const slug of SECTIONS) {
    if (!sections.has(slug)) continue;
    const before = nextText;
    nextText = renderSection(nextText, slug, bodies[slug]);
    if (nextText !== before) changedSections.push(slug);
  }

  // Refresh manifest hashes for ALL 5 slugs (body-driven, so idempotent under same inputs).
  manifest.generatedSections ??= {};
  if (!manifest.generatedSections[SCORECARD_FILE]) {
    manifest.generatedSections[SCORECARD_FILE] = {};
  }
  const sectionMap = manifest.generatedSections[SCORECARD_FILE];
  // Drop any non-slug bookkeeping keys that may have leaked in (e.g. older schemas).
  for (const k of Object.keys(sectionMap)) {
    if (!SECTIONS.includes(k)) delete sectionMap[k];
  }
  for (const slug of SECTIONS) {
    sectionMap[slug] = hashContent(bodies[slug]);
  }
  manifest.lastUpdatedAt = _now();
  const newManifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestChanged = newManifestText !== manifestText;
  const scorecardUpdated = nextText !== scorecardText;

  if (!dryRun) {
    if (scorecardUpdated) await _atomicWrite(scorecardPath, nextText);
    if (manifestChanged) await _atomicWrite(manifestPath, newManifestText);
  }

  return {
    dryRun,
    manifestChanged,
    scorecardUpdated,
    changedSections,
    hashes: { ...sectionMap },
  };
}

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') opts.workspaceDir = argv[++i];
    else if (a === '--cwd') opts.cwd = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/sync-scorecard.js [--workspace <p>] [--cwd <p>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`sync-scorecard: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await syncScorecard(opts);
    console.log(
      `sync-scorecard: ${r.dryRun ? 'would update' : 'updated'} scorecard=${r.scorecardUpdated} manifest=${r.manifestChanged} changedSections=[${r.changedSections.join(',')}]`,
    );
  } catch (e) {
    console.error(`sync-scorecard: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
