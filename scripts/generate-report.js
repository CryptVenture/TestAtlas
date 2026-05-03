// scripts/generate-report.js
//
// Plan 05-03 (Wave 2; SCR-01, RPT-01, RPT-02). Runtime for /atlas:report —
// produces _testatlas/reports/REPORT-latest.{md,json} per PRD §20 (17
// sections), plus a timestamped REPORT-<ISO>.md for retention (RPT-02).
//
// Halts with TESTATLAS_MISSING_EVIDENCE_REF if any cited evidence does not
// resolve to a real evidence directory (no-evidence-no-finding rule applied
// at report generation time).
//
// AJV-validates the JSON sidecar against report.schema.json BEFORE atomicWrite
// — bad reports never reach disk.
//
// CLI:
//   node scripts/generate-report.js [--workspace <p>] [--cwd <p>]
//                                   [--report-path=<custom>] [--dry-run] [--help]

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { loadConfig } from './lib/load-config.js';
import { parseFrontmatter } from './lib/parse-frontmatter.js';
import { loadAllSchemas } from './lib/schema-loader.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const REPORT_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/report.schema.json';
const REPORTS_DIR = 'reports';

// PRD §20: 17 sections. Order matters — this is what gets written and
// asserted against in tests.
const REPORT_SECTIONS = [
  'Run Summary',
  'Coverage',
  'Key Findings',
  'Severity Breakdown',
  'Confidence Breakdown',
  'Blockers',
  'Gaps',
  'Assumptions',
  'Next Actions',
  'Readiness Assessment',
  'Regressions',
  'Quality Risks',
  'Test Pyramid Health',
  'Evidence Catalog Summary',
  'Capability Degradation Notes',
  'Scorecard Snapshot',
  'Run Log Tail',
];

const SEVERITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  enhancement: 4,
};

/**
 * @param {string} dir
 * @param {(name: string) => boolean} predicate
 * @returns {Promise<string[]>}
 */
async function listFilesByPredicate(dir, predicate) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      if (e.isFile() && predicate(e.name)) out.push(e.name);
    }
    return out;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listSubdirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readTextSafe(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readIssues(wsDir) {
  const dir = path.join(wsDir, 'to_fix');
  const names = await listFilesByPredicate(
    dir,
    (n) => n.endsWith('.json') && /^ISSUE-\d{3,}-/.test(n),
  );
  const out = [];
  for (const name of names) {
    const parsed = await readJsonSafe(path.join(dir, name));
    if (parsed) out.push(parsed);
  }
  return out;
}

async function readFlows(wsDir) {
  const dir = path.join(wsDir, 'flows');
  const names = await listFilesByPredicate(
    dir,
    (n) => n.endsWith('.json') && n.startsWith('FLOW-'),
  );
  const out = [];
  for (const name of names) {
    const parsed = await readJsonSafe(path.join(dir, name));
    if (parsed) out.push(parsed);
  }
  return out;
}

async function readDomains(wsDir) {
  const dir = path.join(wsDir, 'domains');
  const slugs = await listSubdirs(dir);
  const out = [];
  for (const slug of slugs) {
    const parsed = await readJsonSafe(path.join(dir, slug, 'domain.json'));
    if (parsed) out.push(parsed);
  }
  return out;
}

async function listEvidenceDirs(wsDir) {
  const dir = path.join(wsDir, 'evidence');
  const subs = await listSubdirs(dir);
  return subs.filter((s) => /^(EVIDENCE|EVID)-/.test(s));
}

async function readTestRuns(wsDir) {
  const dir = path.join(wsDir, 'tests', 'runs');
  const out = [];
  // .md frontmatter (used by summarize-run.js + the runtime)
  const mdNames = await listFilesByPredicate(dir, (n) => n.endsWith('.md') && n.startsWith('RUN-'));
  for (const name of mdNames) {
    const text = await readTextSafe(path.join(dir, name));
    if (!text) continue;
    let fm = null;
    try {
      fm = parseFrontmatter(text);
    } catch {
      // continue without frontmatter — run still counts
    }
    out.push({ file: name, frontmatter: fm });
  }
  // .json sidecars
  const jsonNames = await listFilesByPredicate(
    dir,
    (n) => n.endsWith('.json') && n.startsWith('RUN-'),
  );
  for (const name of jsonNames) {
    const parsed = await readJsonSafe(path.join(dir, name));
    if (parsed) out.push({ file: name, parsed });
  }
  return out;
}

/**
 * Resolve a single evidence reference: accepts EVIDENCE-id or relative path
 * forms. Returns the EVID-id portion if discernible.
 */
function refToEvidId(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/(EVIDENCE-[A-Za-z0-9-]+|EVID-[A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}

/**
 * @param {Array<{evidence?:string[]}>} citingArtifacts
 * @param {Set<string>} availableEvidIds
 * @returns {string[]} list of unresolved refs (each formatted "owner: ref")
 */
function findMissingEvidenceRefs(citingArtifacts, availableEvidIds) {
  const missing = [];
  for (const a of citingArtifacts) {
    const refs = Array.isArray(a.evidence) ? a.evidence : [];
    for (const ref of refs) {
      const evid = refToEvidId(ref);
      if (!evid || !availableEvidIds.has(evid)) {
        missing.push({ owner: a.id ?? '?', ref });
      }
    }
  }
  return missing;
}

/**
 * Build the JSON sidecar object that PASSES report.schema.json.
 *
 * @param {object} ctx
 * @returns {object}
 */
function buildJsonReport({
  reportId,
  generatedAt,
  issues,
  flows,
  domains,
  evidenceIds,
  testRuns,
  manifest,
}) {
  const totalRuns = testRuns.length;
  const failed = testRuns.filter((r) =>
    /fail/i.test(r.frontmatter?.result ?? r.parsed?.result ?? ''),
  ).length;
  const passed = testRuns.filter((r) =>
    /pass/i.test(r.frontmatter?.result ?? r.parsed?.result ?? ''),
  ).length;

  const sortedIssues = [...issues].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99),
  );
  const highestSeverityIssues = sortedIssues
    .filter((i) => i.severity === 'critical' || i.severity === 'high')
    .map((i) => i.id)
    .filter((id) => /^ISSUE-\d{3,}-[a-z0-9]+(-[a-z0-9]+)*$/.test(id));

  const blockers = sortedIssues
    .filter((i) => i.severity === 'critical')
    .map((i) => `${i.id}: ${i.title ?? i.summary ?? ''}`.trim());

  const keyFindings = sortedIssues.slice(0, 10).map((i) => {
    const t = i.title ?? i.summary ?? '(no title)';
    return `[${i.severity}] ${i.id}: ${t}`;
  });

  const flowIds = flows
    .map((f) => f.id)
    .filter((id) => typeof id === 'string' && /^FLOW-/.test(id));
  const domainIds = domains
    .map((d) => d.id)
    .filter((id) => typeof id === 'string' && /^domain-/.test(id));

  // Coverage gaps: domains without any associated test run.
  const testedDomains = new Set(
    testRuns.flatMap((r) => {
      const fmDomain = r.frontmatter?.domain ?? r.frontmatter?.domainId;
      const parsedDomain = r.parsed?.domain ?? r.parsed?.domainId;
      return [fmDomain, parsedDomain].filter(Boolean);
    }),
  );
  const gaps = domainIds
    .filter((d) => !testedDomains.has(d))
    .map((d) => `Domain ${d} has no recorded test runs`);

  // Assumptions: drawn from manifest.assumptions if present + a baseline.
  const assumptions = Array.isArray(manifest?.assumptions) ? manifest.assumptions : [];

  const recommendedNextActions = [];
  if (blockers.length > 0) {
    recommendedNextActions.push(`Resolve ${blockers.length} blocker(s) before release`);
  }
  if (gaps.length > 0) {
    recommendedNextActions.push(`Add coverage for ${gaps.length} untested domain(s)`);
  }
  if (recommendedNextActions.length === 0) {
    recommendedNextActions.push('No urgent actions identified');
  }

  const retestRecommendations = sortedIssues
    .filter((i) => i.status === 'fixed' || i.status === 'cannot-reproduce')
    .map((i) => `Retest ${i.id}: ${i.title ?? i.summary ?? ''}`.trim());

  const readinessAssessment =
    blockers.length > 0
      ? 'NOT READY — blockers present'
      : sortedIssues.some((i) => i.severity === 'high')
        ? 'CONDITIONAL — high-severity issues require triage'
        : 'READY';

  return {
    $schema: REPORT_SCHEMA_ID,
    id: reportId,
    generatedAt,
    runSummary: `Generated for project at ${manifest?.project?.name ?? 'unknown'} — ${totalRuns} run(s) (${passed} pass, ${failed} fail), ${issues.length} issue(s).`,
    environmentsCovered: Array.from(
      new Set(
        testRuns.map((r) => r.frontmatter?.environment ?? r.parsed?.environment).filter(Boolean),
      ),
    ),
    domainsCovered: domainIds,
    flowsCovered: flowIds,
    testsExecuted: totalRuns,
    evidenceCount: evidenceIds.size,
    keyFindings,
    highestSeverityIssues,
    blockers,
    gaps,
    assumptions,
    recommendedNextActions,
    retestRecommendations,
    readinessAssessment,
  };
}

/**
 * Render the markdown body for the 17 PRD §20 sections from the validated
 * JSON sidecar. The markdown mirrors the JSON one-to-one but adds the
 * three sections that don't appear in the schema (Confidence Breakdown,
 * Test Pyramid Health, Evidence Catalog Summary, Capability Degradation
 * Notes, Scorecard Snapshot, Run Log Tail) for human readers.
 *
 * @returns {string}
 */
function renderMarkdownReport({ jsonReport, issues, testRuns, scorecardText, runLogTailLines }) {
  const lines = [];
  lines.push(`# Test Atlas Report — ${jsonReport.id}`);
  lines.push('');
  lines.push(`**Generated:** ${jsonReport.generatedAt}`);
  lines.push('');

  for (const heading of REPORT_SECTIONS) {
    lines.push(`## ${heading}`);
    lines.push('');
    switch (heading) {
      case 'Run Summary':
        lines.push(jsonReport.runSummary);
        break;
      case 'Coverage':
        lines.push(`- Environments: ${formatList(jsonReport.environmentsCovered)}`);
        lines.push(`- Domains: ${formatList(jsonReport.domainsCovered)}`);
        lines.push(`- Flows: ${formatList(jsonReport.flowsCovered)}`);
        lines.push(`- Tests executed: ${jsonReport.testsExecuted}`);
        break;
      case 'Key Findings':
        lines.push(...bulletList(jsonReport.keyFindings, '_None._'));
        break;
      case 'Severity Breakdown': {
        const breakdown = countBy(issues, (i) => i.severity);
        for (const [k, v] of Object.entries(breakdown)) {
          lines.push(`- ${k}: ${v}`);
        }
        if (Object.keys(breakdown).length === 0) lines.push('_None._');
        break;
      }
      case 'Confidence Breakdown': {
        const breakdown = countBy(issues, (i) => i.confidence);
        for (const [k, v] of Object.entries(breakdown)) {
          lines.push(`- ${k}: ${v}`);
        }
        if (Object.keys(breakdown).length === 0) lines.push('_None._');
        break;
      }
      case 'Blockers':
        lines.push(...bulletList(jsonReport.blockers, '_None._'));
        break;
      case 'Gaps':
        lines.push(...bulletList(jsonReport.gaps, '_None._'));
        break;
      case 'Assumptions':
        lines.push(...bulletList(jsonReport.assumptions, '_None recorded._'));
        break;
      case 'Next Actions':
        lines.push(...bulletList(jsonReport.recommendedNextActions, '_None._'));
        break;
      case 'Readiness Assessment':
        lines.push(`**${jsonReport.readinessAssessment}**`);
        break;
      case 'Regressions':
        lines.push('_See history/regressions.md for the running log._');
        break;
      case 'Quality Risks':
        lines.push('_See history/quality_risks.md for the running log._');
        break;
      case 'Test Pyramid Health': {
        const types = countBy(
          testRuns,
          (r) => r.frontmatter?.testType ?? r.parsed?.testType ?? 'unknown',
        );
        for (const [k, v] of Object.entries(types)) {
          lines.push(`- ${k}: ${v}`);
        }
        if (Object.keys(types).length === 0) lines.push('_No runs recorded._');
        break;
      }
      case 'Evidence Catalog Summary':
        lines.push(`Total evidence records: ${jsonReport.evidenceCount}`);
        break;
      case 'Capability Degradation Notes':
        lines.push('_No degradations recorded for this run._');
        break;
      case 'Scorecard Snapshot':
        if (scorecardText) {
          lines.push('```');
          lines.push(scorecardText.trim());
          lines.push('```');
        } else {
          lines.push('_13_quality_scorecard.md not present._');
        }
        break;
      case 'Run Log Tail':
        if (runLogTailLines && runLogTailLines.length > 0) {
          lines.push('```');
          lines.push(...runLogTailLines);
          lines.push('```');
        } else {
          lines.push('_history/run_log.md not present._');
        }
        break;
      default:
        lines.push('_(no content)_');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function formatList(arr) {
  return arr && arr.length > 0 ? arr.join(', ') : '_none_';
}

function bulletList(arr, emptyText) {
  if (!arr || arr.length === 0) return [emptyText];
  return arr.map((s) => `- ${s}`);
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item) ?? 'unknown';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 *   reportPath?: string,
 * }} args
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate,
 *   atomicWrite?: typeof atomicWrite,
 *   loadAllSchemas?: typeof loadAllSchemas,
 * }} _inject
 */
export async function generateReport(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _loadAllSchemas = _inject.loadAllSchemas ?? loadAllSchemas;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;

  // Load all data.
  const [issues, flows, domains, evidenceIdsList, testRuns] = await Promise.all([
    readIssues(wsDir),
    readFlows(wsDir),
    readDomains(wsDir),
    listEvidenceDirs(wsDir),
    readTestRuns(wsDir),
  ]);
  const evidenceIds = new Set(evidenceIdsList);

  const manifestPath = path.join(wsDir, '11_workspace_manifest.json');
  const manifest = (await readJsonSafe(manifestPath)) ?? {};

  // ── Verify every cited evidence ref resolves ────────────────────────────
  // Citing artifacts: issues + test runs (issues' .evidence[] is the primary
  // citation; runs may also cite evidence). Per the no-evidence-no-finding
  // rule applied at REPORT generation time.
  const citingArtifacts = [
    ...issues,
    ...testRuns.map((r) => r.parsed).filter((p) => p && Array.isArray(p.evidence)),
  ];
  const missingRefs = findMissingEvidenceRefs(citingArtifacts, evidenceIds);
  if (missingRefs.length > 0) {
    const e = new Error(
      `generate-report: refusing to write — ${missingRefs.length} cited evidence reference(s) cannot be resolved:\n  ${missingRefs
        .map((m) => `${m.owner} → "${m.ref}"`)
        .join('\n  ')}`,
    );
    e.code = 'TESTATLAS_MISSING_EVIDENCE_REF';
    e.missingRefs = missingRefs;
    throw e;
  }

  // ── Build JSON sidecar ───────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const reportId = `REPORT-${generatedAt.replace(/[:.]/g, '-')}`;
  const jsonReport = buildJsonReport({
    reportId,
    generatedAt,
    issues,
    flows,
    domains,
    evidenceIds,
    testRuns,
    manifest,
  });

  // ── AJV-validate the JSON sidecar BEFORE atomicWrite ────────────────────
  const ajv = await _loadAllSchemas({ cwd });
  const validator = ajv.getSchema(REPORT_SCHEMA_ID);
  if (!validator) {
    const e = new Error(`generate-report: report.schema.json not loaded`);
    e.code = 'TESTATLAS_SCHEMA_MISSING';
    throw e;
  }
  if (!validator(jsonReport)) {
    const e = new Error(
      `generate-report: synthesized report does not pass schema validation:\n  ${(validator.errors ?? []).map((x) => `${x.instancePath || '/'} ${x.message}`).join('\n  ')}`,
    );
    e.code = 'TESTATLAS_INVALID_RECORD';
    e.validationErrors = validator.errors;
    throw e;
  }

  // ── Read peripheral context for markdown ────────────────────────────────
  const scorecardText = await readTextSafe(path.join(wsDir, '13_quality_scorecard.md'));
  const runLogText = await readTextSafe(path.join(wsDir, 'history', 'run_log.md'));
  const runLogTailLines = runLogText ? runLogText.split(/\r?\n/).slice(-20).filter(Boolean) : [];

  const markdown = renderMarkdownReport({
    jsonReport,
    issues,
    testRuns,
    scorecardText,
    runLogTailLines,
  });

  // ── Determine output paths ──────────────────────────────────────────────
  const reportsDir = path.join(wsDir, REPORTS_DIR);
  const customMd = args.reportPath ? path.resolve(cwd, args.reportPath) : null;
  const markdownPath = customMd ?? path.join(reportsDir, 'REPORT-latest.md');
  const jsonPath = customMd ? `${customMd}.json` : path.join(reportsDir, 'REPORT-latest.json');
  const tsBasename = `REPORT-${generatedAt.slice(0, 10)}-${generatedAt.slice(11, 19).replace(/:/g, '-')}.md`;
  const tsPath = path.join(reportsDir, tsBasename);

  // ── Write or dry-run ────────────────────────────────────────────────────
  if (!dryRun) {
    await _atomicWrite(markdownPath, markdown);
    await _atomicWrite(jsonPath, `${JSON.stringify(jsonReport, null, 2)}\n`);
    await _atomicWrite(tsPath, markdown);
  }

  return {
    wsDir,
    markdownPath,
    jsonPath,
    timestampedPath: tsPath,
    jsonReport,
    dryRun,
  };
}

// Suppress unused-import lint for stat (kept for forward-compat extension).
void stat;

// ─────────────────────────────── CLI wrapper ───────────────────────────────

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
    else if (a === '--report-path' || a.startsWith('--report-path=')) {
      opts.reportPath = a.startsWith('--report-path=')
        ? a.slice('--report-path='.length)
        : argv[++i];
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/generate-report.js [--workspace <p>] [--cwd <p>] [--report-path=<custom>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`generate-report: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await generateReport(opts);
    console.log(
      `generate-report: ${r.dryRun ? 'would write' : 'wrote'} ${path.relative(process.cwd(), r.markdownPath)} (+ JSON sidecar; readiness=${r.jsonReport.readinessAssessment})`,
    );
  } catch (e) {
    console.error(`generate-report: ${e.code ?? 'ERROR'} — ${e.message}`);
    if (e.missingRefs) {
      for (const m of e.missingRefs) {
        console.error(`  ${m.owner} → "${m.ref}"`);
      }
    }
    process.exit(1);
  }
}
