// scripts/validate-workspace.js
//
// Plan 05-02 (Wave 1). Orchestrator + CLI wrapper for VAL-01 / SCR-03.
//
// Runs the 10 PRD §33 validate-workspace checks against a TestAtlas workspace,
// aggregates findings, renders a markdown + JSON report, and exits 1 on any
// 'fail' status. Each check is a separate module under
// scripts/lib/validate/check-*.js with a uniform interface — the orchestrator
// itself is purely glue.
//
// Wave 1 ships the orchestrator + 5 of 10 check modules
// (canonical-files, schemas, broken-links, orphaned-evidence,
// issue-index-consistency). The other 5 (missing-indexes, duplicate-ids,
// stale-generated-sections, modified-generated-content, status-counts) are
// owned by Plan 05-03 (Wave 2). This file's CHECK_IDS array references all
// 10 ids and uses graceful dynamic-import-with-fallback so a not-yet-shipped
// module is silently skipped — no orchestrator edit is needed when 05-03
// lands.
//
// `--auto-heal` and `--apply` flags are PARSED and THREADED into validateWorkspace()
// as no-ops in this plan. Plan 05-04 fills the autoheal body in
// scripts/lib/validate/autoheal.js — no CLI parser changes required there.
//
// Pitfalls handled:
//   - Pitfall 3: walkWorkspace() is called ONCE; ctx.files reused.
//   - Pitfall 4: loadAllSchemas() is called ONCE; ctx.ajv reused.
//   - Pitfall 8: missing workspace exits 0 with friendly message.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { loadConfig } from './lib/load-config.js';
import { loadAllSchemas } from './lib/schema-loader.js';
import { autoHealFindings } from './lib/validate/autoheal.js';
import { renderJsonReport, renderMarkdownReport } from './lib/validate/reporter.js';
import { walkWorkspace } from './lib/validate/walk-workspace.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

// ─── Check registry (graceful dynamic import) ────────────────────────────────
//
// The full PRD §33 ten-check list. Plan 05-02 ships the first 5; Plan 05-03
// ships the rest. The orchestrator imports each module by id and tolerates
// ERR_MODULE_NOT_FOUND so partial wave-rollouts don't break the binary.

const CHECK_IDS = [
  'canonical-files',
  'schemas',
  'broken-links',
  'orphaned-evidence',
  'issue-index-consistency',
  'missing-indexes',
  'duplicate-ids',
  'stale-generated-sections',
  'modified-generated-content',
  'status-counts',
];

/**
 * Dynamically import all available check modules. Modules not yet on disk
 * (e.g., 05-03's check-missing-indexes before that plan lands) are skipped
 * silently.
 *
 * @returns {Promise<Array<{id:string, prdRule:number, check:Function}>>}
 */
async function loadChecks() {
  const checks = [];
  for (const id of CHECK_IDS) {
    const modPath = `./lib/validate/check-${id}.js`;
    try {
      const mod = await import(modPath);
      // Each check module exports `id`, `prdRule`, `check`.
      checks.push({ id: mod.id, prdRule: mod.prdRule, check: mod.check });
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND') continue;
      throw err;
    }
  }
  return checks;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run validate-workspace against a workspace directory.
 *
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 *   autoHeal?: boolean,
 *   apply?: boolean,
 *   only?: string[],
 *   report?: string,
 * }} [opts]
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate,
 *   loadChecks?: typeof loadChecks,
 *   autoheal?: typeof autoHealFindings,
 * }} [_inject] @internal — test-only DI.
 * @returns {Promise<{
 *   results: object[],
 *   exitCode: 0 | 1,
 *   message?: string,
 *   reportMarkdown?: string,
 *   reportJson?: object,
 *   healed?: object,
 * }>}
 */
export async function validateWorkspace(
  {
    workspaceDir,
    cwd = process.cwd(),
    dryRun = false,
    autoHeal = false,
    apply = false,
    only,
    report,
  } = {},
  _inject = {},
) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _loadChecks = _inject.loadChecks ?? loadChecks;
  const _autoheal = _inject.autoheal ?? autoHealFindings;

  // Pitfall 5 (two-tree invariant): guard FIRST. Validation reads from
  // _testatlas/ and may write a report to _testatlas/reports/ — that's a
  // 'command'-context mutation, NOT 'update'.
  _assertNotUpdate('command');

  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, workspaceDir ?? config.workspaceDir);

  // Pitfall 8: friendly missing-workspace handling. Nothing to validate is
  // not a failure — exit 0 with a clear message.
  const wsStat = await stat(wsDir).catch(() => null);
  const manifestPath = path.join(wsDir, '11_workspace_manifest.json');
  const manifestStat = await stat(manifestPath).catch(() => null);
  if (!wsStat || !manifestStat) {
    return {
      results: [],
      exitCode: 0,
      message: 'Workspace not initialized; run /atlas:init first.',
    };
  }

  // Pitfall 4: AJV singleton — loaded ONCE.
  const ajv = await loadAllSchemas({ cwd });
  // Pitfall 3: workspace walk — ONCE.
  const files = await walkWorkspace(wsDir);
  // Pre-parse manifest so checks don't re-read it.
  const manifestText = await readFile(manifestPath, 'utf8');
  let manifest = null;
  try {
    manifest = JSON.parse(manifestText);
  } catch (_err) {
    // Malformed manifest is surfaced as a check-schemas finding; here we
    // tolerate the parse error so other checks can proceed against a partial
    // ctx.
    manifest = null;
  }

  const ctx = { wsDir, ajv, files, manifest, config };

  const allChecks = await _loadChecks();
  const enabled = only ? allChecks.filter((c) => only.includes(c.id)) : allChecks;

  const results = [];
  for (const mod of enabled) {
    const result = await mod.check(ctx);
    results.push(result);
  }

  let healed;
  if (autoHeal) {
    healed = await _autoheal(results, ctx, { dryRun, apply });
  }

  const reportMarkdown = renderMarkdownReport(results, ctx);
  const reportJson = renderJsonReport(results, ctx);

  // Optional report-to-disk.
  if (report) {
    const mdPath = path.resolve(cwd, report);
    const jsonPath = `${mdPath}.json`;
    if (!dryRun) {
      await atomicWrite(mdPath, reportMarkdown);
      await atomicWrite(jsonPath, `${JSON.stringify(reportJson, null, 2)}\n`);
    }
  }

  const exitCode = aggregateExitCode(results);
  const out = { results, exitCode, reportMarkdown, reportJson };
  if (healed !== undefined) out.healed = healed;
  return out;
}

/**
 * 1 if any check failed; 0 otherwise (warn → 0).
 *
 * @param {Array<{status:string}>} results
 * @returns {0|1}
 */
function aggregateExitCode(results) {
  return results.some((r) => r.status === 'fail') ? 1 : 0;
}

// ─── CLI wrapper ─────────────────────────────────────────────────────────────

const __thisFile = new URL(import.meta.url).pathname;
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

/**
 * @param {string[]} argv
 */
async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') {
      opts.workspaceDir = argv[++i];
    } else if (a === '--cwd') {
      opts.cwd = argv[++i];
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--auto-heal') {
      opts.autoHeal = true;
    } else if (a === '--apply') {
      opts.apply = true;
    } else if (a === '--only' || a.startsWith('--only=')) {
      const v = a.startsWith('--only=') ? a.slice('--only='.length) : argv[++i];
      opts.only = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--report' || a.startsWith('--report=')) {
      const v = a.startsWith('--report=') ? a.slice('--report='.length) : argv[++i];
      opts.report = v;
    } else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage: node scripts/validate-workspace.js [options]',
          '',
          'Options:',
          '  --workspace <path>     Workspace dir (default: from testatlas.config.json)',
          '  --cwd <path>           Working directory (default: process.cwd())',
          '  --dry-run              Do not write any reports or autoheal changes',
          '  --auto-heal            Apply safe auto-heals (HEAL-01..04, Plan 05-04)',
          '  --apply                With --auto-heal, persist changes (else preview)',
          '  --only=<id[,id...]>    Run only the listed checks (e.g. check-schemas)',
          '  --report=<path>        Write markdown report to <path> + JSON to <path>.json',
          '  --help                 Show this message',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      console.error(`validate-workspace: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await validateWorkspace(opts);
    if (r.message) {
      console.log(r.message);
      process.exit(r.exitCode);
    }
    // Print a short summary to stdout; full report is r.reportMarkdown.
    process.stdout.write(r.reportMarkdown);
    process.exit(r.exitCode);
  } catch (err) {
    console.error(`validate-workspace: ${err.code ?? 'ERROR'} — ${err.message}`);
    process.exit(1);
  }
}
