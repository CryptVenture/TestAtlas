// scripts/check-stale-docs.js
//
// Plan 05-03 (Wave 2; SCR-01). Flags markdown files older than a threshold
// (default 90 days, override via --threshold-days or config.staleDocs.thresholdDays).
//
// Honors:
//   - config.staleDocs.archivalDirs (default ['history']) — files inside any
//     archival directory are NEVER flagged. Pitfall 10: append-only logs are
//     legitimately old.
//   - per-file `archival: true` YAML frontmatter flag — same effect at the
//     per-file granularity. A user explicitly marks a long-lived document
//     (e.g., a constitution, a closed-issue archive) as archival.
//
// CLI:
//   node scripts/check-stale-docs.js [--workspace <p>] [--cwd <p>]
//                                    [--threshold-days <n>] [--report <path>]
//                                    [--dry-run] [--help]

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { extractFrontmatter, parseFrontmatter } from './lib/parse-frontmatter.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const DEFAULT_THRESHOLD_DAYS = 90;
const DEFAULT_ARCHIVAL_DIRS = ['history'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Recursively walk wsDir collecting `.md` files. Returns absolute paths.
 *
 * @param {string} wsDir
 * @returns {Promise<string[]>}
 */
async function listMarkdownFiles(wsDir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(wsDir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.md')) continue;
    const parent = ent.parentPath ?? ent.path ?? wsDir;
    out.push(path.join(parent, ent.name));
  }
  return out;
}

/**
 * Test if a relative path falls under any archival directory. The check
 * compares directory-name components, not substring match (so a file named
 * `history.md` at the root is NOT considered archival).
 *
 * @param {string} relPath posix-style relative path (uses '/').
 * @param {string[]} archivalDirs
 * @returns {boolean}
 */
function isUnderArchivalDir(relPath, archivalDirs) {
  const parts = relPath.split('/');
  // Drop the basename — only directory components matter.
  parts.pop();
  for (const part of parts) {
    if (archivalDirs.includes(part)) return true;
  }
  return false;
}

/**
 * Best-effort frontmatter parse. Tolerates files without frontmatter (most
 * markdown files in TestAtlas don't have it). Returns the parsed object on
 * success or null on absence/parse-failure.
 *
 * @param {string} text
 * @returns {Record<string, string|string[]>|null}
 */
function tryParseFrontmatter(text) {
  try {
    extractFrontmatter(text);
  } catch {
    return null;
  }
  try {
    return parseFrontmatter(text);
  } catch {
    return null;
  }
}

/**
 * Render a markdown summary of the stale list.
 *
 * @param {Array<{path:string, daysOld:number}>} staleList
 * @param {{thresholdDays:number, archivalDirs:string[]}} meta
 * @returns {string}
 */
function renderReport(staleList, meta) {
  const lines = [];
  lines.push('# Stale Docs Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Threshold:** ${meta.thresholdDays} days`);
  lines.push(`**Archival dirs (skipped):** ${meta.archivalDirs.join(', ') || '(none)'}`);
  lines.push('');
  if (staleList.length === 0) {
    lines.push('No stale docs found.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(`Found ${staleList.length} stale doc(s):`);
  lines.push('');
  lines.push('| Path | Days old |');
  lines.push('|------|----------|');
  for (const s of staleList) {
    lines.push(`| \`${s.path}\` | ${s.daysOld} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   thresholdDays?: number,
 *   report?: string,
 *   dryRun?: boolean,
 * }} args
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate,
 *   atomicWrite?: typeof atomicWrite,
 *   readFile?: typeof readFile,
 *   stat?: typeof stat,
 *   now?: () => number,
 * }} _inject
 * @returns {Promise<{
 *   wsDir: string,
 *   thresholdDays: number,
 *   archivalDirs: string[],
 *   staleList: Array<{path:string, daysOld:number}>,
 *   report: string,
 *   dryRun: boolean,
 * }>}
 */
export async function checkStaleDocs(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _readFile = _inject.readFile ?? readFile;
  const _stat = _inject.stat ?? stat;
  const _now = _inject.now ?? (() => Date.now());
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;

  const cfgStaleDocs = config.staleDocs ?? {};
  const thresholdDays =
    typeof args.thresholdDays === 'number'
      ? args.thresholdDays
      : (cfgStaleDocs.thresholdDays ?? DEFAULT_THRESHOLD_DAYS);
  const archivalDirs = Array.isArray(cfgStaleDocs.archivalDirs)
    ? cfgStaleDocs.archivalDirs
    : DEFAULT_ARCHIVAL_DIRS;

  const now = _now();
  const thresholdMs = thresholdDays * MS_PER_DAY;

  const staleList = [];
  const allFiles = await listMarkdownFiles(wsDir);
  for (const absPath of allFiles) {
    const relPath = path.relative(wsDir, absPath).split(path.sep).join('/');

    // Skip archival-dir files BEFORE any IO.
    if (isUnderArchivalDir(relPath, archivalDirs)) continue;

    // Per-file archival opt-out — read first ~2KB only.
    let frontmatterOptOut = false;
    try {
      const head = await _readFile(absPath, 'utf8');
      const fm = tryParseFrontmatter(head);
      if (fm && (fm.archival === 'true' || fm.archival === true)) {
        frontmatterOptOut = true;
      }
    } catch {
      // Tolerate read failure — fall through to mtime-only check.
    }
    if (frontmatterOptOut) continue;

    let st;
    try {
      st = await _stat(absPath);
    } catch {
      continue;
    }
    const ageMs = now - st.mtimeMs;
    if (ageMs > thresholdMs) {
      staleList.push({
        path: relPath,
        daysOld: Math.floor(ageMs / MS_PER_DAY),
      });
    }
  }

  // Sort by age descending so the oldest are first.
  staleList.sort((a, b) => b.daysOld - a.daysOld);

  const report = renderReport(staleList, { thresholdDays, archivalDirs });

  if (args.report && !dryRun) {
    const reportAbs = path.resolve(cwd, args.report);
    await _atomicWrite(reportAbs, report);
  }

  return {
    wsDir,
    thresholdDays,
    archivalDirs,
    staleList,
    report,
    dryRun,
  };
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
    else if (a === '--threshold-days' || a.startsWith('--threshold-days=')) {
      const v = a.startsWith('--threshold-days=') ? a.slice('--threshold-days='.length) : argv[++i];
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) {
        console.error(`check-stale-docs: invalid --threshold-days "${v}"`);
        process.exit(2);
      }
      opts.thresholdDays = n;
    } else if (a === '--report' || a.startsWith('--report=')) {
      opts.report = a.startsWith('--report=') ? a.slice('--report='.length) : argv[++i];
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/check-stale-docs.js [--workspace <p>] [--cwd <p>] [--threshold-days <n>] [--report <path>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`check-stale-docs: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await checkStaleDocs(opts);
    if (r.staleList.length === 0) {
      console.log(`check-stale-docs: no docs older than ${r.thresholdDays} days.`);
    } else {
      console.log(`check-stale-docs: ${r.staleList.length} stale doc(s) (>= ${r.thresholdDays}d):`);
      for (const s of r.staleList) {
        console.log(`  ${s.path}  (${s.daysOld}d)`);
      }
    }
    if (opts.report) {
      console.log(
        `check-stale-docs: ${r.dryRun ? 'would write' : 'wrote'} report to ${opts.report}`,
      );
    }
  } catch (e) {
    console.error(`check-stale-docs: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
