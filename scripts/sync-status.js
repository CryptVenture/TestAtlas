// scripts/sync-status.js
//
// Plan 05-01 (SCR-01). Reconciles `_testatlas/11_workspace_manifest.json`
// counts and `_testatlas/03_execution_status.md` "## Counts" generated
// section with on-disk reality (number of domains / flows / issues / evidence
// records / test runs / reports). Idempotent.
//
// CLI:
//   node scripts/sync-status.js [--workspace <p>] [--cwd <p>] [--dry-run] [--help]

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { loadConfig } from './lib/load-config.js';
import { parseMarkers, renderSection } from './lib/markers.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const STATUS_FILE = '03_execution_status.md';
const MANIFEST = '11_workspace_manifest.json';
const COUNTS_SECTION = 'counts';

async function countDirs(wsDir, sub, prefix) {
  try {
    const entries = await readdir(path.join(wsDir, sub), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && (!prefix || e.name.startsWith(prefix))).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

async function countFiles(wsDir, sub, predicate) {
  try {
    const entries = await readdir(path.join(wsDir, sub), { withFileTypes: true });
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
  };
  const reports = await countFiles(wsDir, 'reports', (n) => n.endsWith('.md'));

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
  manifest.lastUpdatedAt = new Date().toISOString();
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

  if (!dryRun) {
    if (manifestChanged) {
      await _atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    if (statusUpdated) {
      await _atomicWrite(statusPath, nextStatus);
    }
  }

  return { counts, reports, manifestChanged, statusUpdated, dryRun };
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
      `sync-status: ${r.dryRun ? 'would update' : 'updated'} manifest=${r.manifestChanged} status-counts=${r.statusUpdated}`,
    );
  } catch (e) {
    console.error(`sync-status: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
