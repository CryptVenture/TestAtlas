// scripts/summarize-run.js
//
// Plan 05-01 (SCR-01). Distills RUN-*.md files under `<wsDir>/tests/runs/`
// into a single session-summary markdown at
// `<wsDir>/tests/runs/SESSION-SUMMARY-<ts>.md`. Reads YAML frontmatter via
// scripts/lib/parse-frontmatter.js to gather runId / flowId / result /
// startedAt / endedAt / evidenceRefs.
//
// CLI:
//   node scripts/summarize-run.js [--since=<ISO>] [--workspace <p>] [--cwd <p>]
//                                  [--dry-run] [--help]

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { parseFrontmatter } from './lib/parse-frontmatter.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const RUNS_DIR = 'tests/runs';

function timestamp() {
  return now().replace(/[:.]/g, '-');
}

export async function summarizeRun(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;
  const since = args.since ? new Date(args.since) : null;

  const runs = [];
  let entries;
  try {
    entries = await sortedReaddir(path.join(wsDir, RUNS_DIR), { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') entries = [];
    else throw err;
  }

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md') || !e.name.startsWith('RUN-')) continue;
    const filePath = path.join(wsDir, RUNS_DIR, e.name);
    const text = await readFile(filePath, 'utf8');
    let fm;
    try {
      fm = parseFrontmatter(text);
    } catch {
      continue; // skip files without parseable frontmatter
    }
    if (since && fm.startedAt) {
      const t = new Date(fm.startedAt);
      if (!Number.isNaN(t.getTime()) && t < since) continue;
    }
    runs.push({
      file: e.name,
      runId: fm.runId ?? fm.id ?? e.name.replace(/\.md$/, ''),
      flowId: fm.flowId ?? fm.flow ?? '',
      result: fm.result ?? fm.status ?? 'unknown',
      startedAt: fm.startedAt ?? '',
      endedAt: fm.endedAt ?? '',
      evidenceRefs: Array.isArray(fm.evidenceRefs)
        ? fm.evidenceRefs
        : Array.isArray(fm.evidence)
          ? fm.evidence
          : [],
    });
  }

  // Aggregate.
  const total = runs.length;
  const passed = runs.filter((r) => /pass/i.test(r.result)).length;
  const failed = runs.filter((r) => /fail/i.test(r.result)).length;
  const evidenceCount = runs.reduce((acc, r) => acc + r.evidenceRefs.length, 0);
  const earliestStart = runs
    .map((r) => r.startedAt)
    .filter(Boolean)
    .sort()[0];
  const latestEnd = runs
    .map((r) => r.endedAt)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const ts = timestamp();
  const lines = [
    `# Session Summary — ${ts}`,
    '',
    `Generated at: ${now()}`,
    `Total runs: ${total}`,
    `Passed: ${passed}`,
    `Failed: ${failed}`,
    `Evidence references: ${evidenceCount}`,
  ];
  if (earliestStart) lines.push(`Earliest start: ${earliestStart}`);
  if (latestEnd) lines.push(`Latest end: ${latestEnd}`);
  lines.push('', '## Runs', '');
  for (const r of runs) {
    lines.push(`- ${r.runId} (${r.flowId || 'no-flow'}) → ${r.result}`);
  }
  if (runs.length === 0) lines.push('(no runs found)');
  lines.push('');

  const outputPath = path.join(wsDir, RUNS_DIR, `SESSION-SUMMARY-${ts}.md`);
  if (!dryRun) {
    await _atomicWrite(outputPath, lines.join('\n'));
  }

  return { outputPath, total, passed, failed, evidenceCount, runs, dryRun };
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
    else if (a.startsWith('--since=')) opts.since = a.slice('--since='.length);
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/summarize-run.js [--since=<ISO>] [--workspace <p>] [--cwd <p>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`summarize-run: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await summarizeRun(opts);
    console.log(
      `summarize-run: ${r.dryRun ? 'would write' : 'wrote'} ${r.outputPath} (${r.total} runs, ${r.passed} passed, ${r.failed} failed)`,
    );
  } catch (e) {
    console.error(`summarize-run: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
