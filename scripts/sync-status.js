// scripts/sync-status.js
//
// Plan 05-01 (SCR-01). Reconciles `_testatlas/11_workspace_manifest.json`
// counts and `_testatlas/03_execution_status.md` "## Counts" generated
// section with on-disk reality (number of domains / flows / issues / evidence
// records / test runs / reports). Idempotent.
//
// CLI:
//   node scripts/sync-status.js [--workspace <p>] [--cwd <p>] [--dry-run] [--help]

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { hashContent } from './lib/content-hash.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { parseMarkers, renderSection } from './lib/markers.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const STATUS_FILE = '03_execution_status.md';
const OVERVIEW_FILE = '00_overview.md';
const MANIFEST = '11_workspace_manifest.json';
const COUNTS_SECTION = 'counts';
const OVERVIEW_SECTIONS = [
  'domain-count',
  'current-status',
  'latest-report-pointer',
  'last-updated',
];

async function countDirs(wsDir, sub, prefix) {
  try {
    const entries = await sortedReaddir(path.join(wsDir, sub), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && (!prefix || e.name.startsWith(prefix))).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

async function countFiles(wsDir, sub, predicate) {
  try {
    const entries = await sortedReaddir(path.join(wsDir, sub), { withFileTypes: true });
    return entries.filter((e) => e.isFile() && predicate(e.name)).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

export async function syncStatus(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;

  // Compute on-disk counts.
  // Quick 260506-dyb (G5): per-area views (regressions/readiness/coverage/
  // quality_risks .md) live alongside REPORT-*.md but are NOT reports — only
  // REPORT-prefixed .md files are counted as reports.
  const reports = await countFiles(
    wsDir,
    'reports',
    (n) => n.endsWith('.md') && n.startsWith('REPORT-'),
  );
  const counts = {
    domains: await countDirs(wsDir, 'domains'),
    flows: await countFiles(wsDir, 'flows', (n) => n.endsWith('.json') && n.startsWith('FLOW-')),
    issues: await countFiles(
      wsDir,
      'to_fix',
      (n) => n.endsWith('.json') && /^ISSUE-\d{3,}-/.test(n),
    ),
    evidenceRecords: await countDirs(wsDir, 'evidence', 'EVIDENCE-'),
    testRuns: await countFiles(
      wsDir,
      'tests/runs',
      (n) => n.endsWith('.md') && n.startsWith('RUN-'),
    ),
    // Quick 260506-dyb (G4): persist reports count in manifest (additive
    // optional field). Schema permits it; check-status-counts will validate
    // against on-disk count.
    reports,
  };

  // Update manifest.
  const manifestPath = path.join(wsDir, MANIFEST);
  let manifestText;
  try {
    manifestText = await readFile(manifestPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`sync-status: ${MANIFEST} not found at ${manifestPath}`);
      e.code = 'TESTATLAS_MANIFEST_MISSING';
      throw e;
    }
    throw err;
  }
  const manifest = JSON.parse(manifestText);
  const before = JSON.stringify(manifest.counts);
  manifest.counts = counts;
  manifest.lastUpdatedAt = now();
  const manifestChanged = before !== JSON.stringify(counts);

  // Update 03_execution_status.md "counts" section if present.
  const statusPath = path.join(wsDir, STATUS_FILE);
  let statusText;
  try {
    statusText = await readFile(statusPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let statusUpdated = false;
  let nextStatus = statusText;
  if (statusText) {
    const { sections, errors } = parseMarkers(statusText);
    if (errors.length > 0) {
      const e = new Error(
        `sync-status: refusing to write — ${STATUS_FILE} has marker errors:\n  ${errors
          .map((x) => `[${x.code} line ${x.line}] ${x.message}`)
          .join('\n  ')}`,
      );
      e.code = 'TESTATLAS_MARKER_INVALID';
      e.errors = errors;
      throw e;
    }
    if (sections.has(COUNTS_SECTION)) {
      const body = [
        `- domains: ${counts.domains}`,
        `- flows: ${counts.flows}`,
        `- issues: ${counts.issues}`,
        `- evidenceRecords: ${counts.evidenceRecords}`,
        `- testRuns: ${counts.testRuns}`,
        `- reports: ${reports}`,
      ].join('\n');
      nextStatus = renderSection(statusText, COUNTS_SECTION, body);
      statusUpdated = nextStatus !== statusText;
    }
  }

  // ─── Quick 260505-wjp Task 3 (G5): refresh 00_overview.md generated sections ──
  let overviewUpdated = false;
  const overviewPath = path.join(wsDir, OVERVIEW_FILE);
  let overviewText;
  try {
    overviewText = await readFile(overviewPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  let nextOverview = overviewText;
  if (overviewText) {
    const { sections, errors } = parseMarkers(overviewText);
    if (errors.length > 0) {
      const e = new Error(
        `sync-status: refusing to write — ${OVERVIEW_FILE} has marker errors:\n  ${errors
          .map((x) => `[${x.code} line ${x.line}] ${x.message}`)
          .join('\n  ')}`,
      );
      e.code = 'TESTATLAS_MARKER_INVALID';
      e.errors = errors;
      throw e;
    }

    let bodyChanged = false;
    // DEC-005 (Phase 23 / COUNCIL-2026-05-09-002): replace static "N domains
    // discovered" prose with a GENERATED block whose body is rendered from
    // the live on-disk count (counts.domains, computed above) — keeps
    // 00_overview.md honest about the actual domain count post any add/rm.
    if (sections.has('domain-count')) {
      const dcBody = [`${counts.domains} domains discovered (see \`12_app_map.json\`).`];
      const before = nextOverview;
      nextOverview = renderSection(nextOverview, 'domain-count', dcBody);
      if (nextOverview !== before) bodyChanged = true;
    }
    if (sections.has('current-status')) {
      const lastCommand = await tailLastCommandFromLog(path.join(wsDir, '10_command_log.md'));
      const csBody = [
        `- Status: ${manifest.status ?? 'active'}`,
        `- Domains mapped: ${counts.domains}`,
        `- Flows mapped: ${counts.flows}`,
        `- Flows tested: ${counts.testRuns}`,
        `- Issues filed: ${counts.issues}`,
        `- Last command: ${lastCommand ?? '(none)'}`,
      ];
      const before = nextOverview;
      nextOverview = renderSection(nextOverview, 'current-status', csBody);
      if (nextOverview !== before) bodyChanged = true;
    }
    if (sections.has('latest-report-pointer')) {
      const reportLatestPath = path.join(wsDir, 'reports', 'REPORT-latest.md');
      const reportJsonPath = path.join(wsDir, 'reports', 'REPORT-latest.json');
      const hasReport = await pathExists(reportLatestPath);
      const reportJson = hasReport ? await readJsonSafe(reportJsonPath) : null;
      const lrpBody = [
        `- Latest report: ${hasReport ? 'reports/REPORT-latest.md' : '(none)'}`,
        `- Generated at: ${reportJson?.generatedAt ?? '(none)'}`,
      ];
      const before = nextOverview;
      nextOverview = renderSection(nextOverview, 'latest-report-pointer', lrpBody);
      if (nextOverview !== before) bodyChanged = true;
    }
    // Only refresh last-updated when the body changed — otherwise repeated
    // sync-status calls would churn the timestamp + manifest hash on every run
    // (breaking the body-driven idempotency contract).
    if (bodyChanged && sections.has('last-updated')) {
      nextOverview = renderSection(nextOverview, 'last-updated', [manifest.lastUpdatedAt]);
    }

    overviewUpdated = nextOverview !== overviewText;

    // Refresh manifest hashes for the 3 overview slugs.
    if (overviewUpdated) {
      const fresh = parseMarkers(nextOverview);
      manifest.generatedSections ??= {};
      if (!manifest.generatedSections[OVERVIEW_FILE]) {
        manifest.generatedSections[OVERVIEW_FILE] = {};
      }
      const sectionMap = manifest.generatedSections[OVERVIEW_FILE];
      for (const slug of OVERVIEW_SECTIONS) {
        const sec = fresh.sections.get(slug);
        if (!sec) continue;
        sectionMap[slug] = hashContent(sec.contentLines);
      }
    }
  }

  // If overviewUpdated triggered manifest hash bumps, treat manifest as changed.
  const manifestNeedsWrite = manifestChanged || overviewUpdated;

  if (!dryRun) {
    if (manifestNeedsWrite) {
      await _atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    if (statusUpdated) {
      await _atomicWrite(statusPath, nextStatus);
    }
    if (overviewUpdated) {
      await _atomicWrite(overviewPath, nextOverview);
    }
  }

  return {
    counts,
    reports,
    manifestChanged: manifestNeedsWrite,
    statusUpdated,
    overviewUpdated,
    dryRun,
  };
}

async function tailLastCommandFromLog(p) {
  let text;
  try {
    text = await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    // Skip header / separator rows
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    if (/timestamp/i.test(line) && /command/i.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    // ['', ts, command, status, executionMode, evidenceRef, '']
    if (cells.length >= 4 && cells[2]) return cells[2];
  }
  return null;
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function readJsonSafe(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
if (isMainModule(import.meta.url)) {
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
      console.log('Usage: node scripts/sync-status.js [--workspace <p>] [--cwd <p>] [--dry-run]');
      process.exit(0);
    } else {
      console.error(`sync-status: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await syncStatus(opts);
    console.log(
      `sync-status: ${r.dryRun ? 'would update' : 'updated'} manifest=${r.manifestChanged} status-counts=${r.statusUpdated} overview=${r.overviewUpdated}`,
    );
  } catch (e) {
    console.error(`sync-status: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
