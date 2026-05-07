#!/usr/bin/env node
// scripts/generate-retest-pack.js
//
// Plan 14-07 Task 2 — Retest pack generator (V2 PRD §7.14, §10.4, §17 Phase 6).
//
// Reads issue JSON sidecars from `_testatlas/to_fix/` (and the matching
// markdown), extracts acceptance criteria + reproduction steps + evidence,
// and emits a self-contained retest pack at
// `_testatlas/tests/retest_packs/RET-<issue-id>/<basename>.{md,json}`.
//
// The JSON sidecar matches `retest_pack.schema.json`:
//   { id (RETEST-<n>), issue_id, title, preconditions[], steps[], expected,
//     actual, evidence[], automation_candidate?, automated_test_path?,
//     created_at, last_run_at?, status }
//
// CLI:
//   node scripts/generate-retest-pack.js [--cwd <dir>] [--issue-id <ISSUE-id>] [--all-open]
//
// Programmatic:
//   import { generateRetestPack } from './generate-retest-pack.js';
//   const r = await generateRetestPack({ cwd, issueId, allOpen });

import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';

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

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function listIssues(toFixDir) {
  if (!(await fileExists(toFixDir))) return [];
  const entries = await readdir(toFixDir, { withFileTypes: true });
  const issues = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json') || !e.name.startsWith('ISSUE-')) continue;
    const json = await readJsonOr(path.join(toFixDir, e.name), null);
    if (json && typeof json === 'object' && json.id) issues.push(json);
  }
  return issues;
}

/**
 * Convert an issue (V1 issue.schema.json shape) into a retest pack.
 *
 * @param {object} issue
 * @param {number} sequence — RETEST-<n> sequence number
 */
function packForIssue(issue, sequence) {
  const seq = String(sequence).padStart(4, '0');
  const id = `RETEST-${seq}`;
  const acceptance = Array.isArray(issue.acceptanceCriteria) ? issue.acceptanceCriteria : [];
  const repro = Array.isArray(issue.reproductionSteps) ? issue.reproductionSteps : [];

  const expected =
    acceptance.length > 0
      ? acceptance.join(' AND ')
      : (issue.expectedBehavior ?? 'See linked issue acceptance criteria.');
  const actual = issue.actualBehavior ?? issue.summary ?? 'See linked issue summary.';

  return {
    id,
    issue_id: issue.id,
    title: `Retest: ${issue.title ?? issue.slug ?? issue.id}`,
    preconditions:
      Array.isArray(issue.relatedFiles) && issue.relatedFiles.length > 0
        ? [`Apply candidate fix touching: ${issue.relatedFiles.join(', ')}`]
        : ['Apply candidate fix per issue acceptance criteria.'],
    steps: repro.length > 0 ? repro : ['Re-run the documented reproduction path.'],
    expected,
    actual,
    evidence: Array.isArray(issue.evidence) ? [...issue.evidence] : [],
    automation_candidate: !!issue.automationCandidate,
    created_at: new Date().toISOString(),
    status: 'pending',
  };
}

function renderMarkdown(pack, issue) {
  const lines = [];
  lines.push('---');
  lines.push(`id: ${pack.id}`);
  lines.push(`issue_id: ${pack.issue_id}`);
  lines.push(`status: ${pack.status}`);
  lines.push(`created_at: ${pack.created_at}`);
  lines.push(`automation_candidate: ${pack.automation_candidate}`);
  lines.push(`generated_by: scripts/generate-retest-pack.js`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${pack.title}`);
  lines.push('');
  lines.push(`> Linked issue: \`${pack.issue_id}\` (severity: ${issue.severity ?? 'unknown'}).`);
  lines.push(
    '> Run after a candidate fix lands; mark `status: passed` only after evidence is captured.',
  );
  lines.push('');
  lines.push('## Preconditions');
  lines.push('');
  for (const p of pack.preconditions) lines.push(`- ${p}`);
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  for (let i = 0; i < pack.steps.length; i++) {
    lines.push(`${i + 1}. ${pack.steps[i]}`);
  }
  lines.push('');
  lines.push('## Pass criteria (expected)');
  lines.push('');
  lines.push(pack.expected);
  lines.push('');
  lines.push('## Fail-state baseline (actual at issue capture)');
  lines.push('');
  lines.push(pack.actual);
  lines.push('');
  lines.push('## Evidence');
  lines.push('');
  if (pack.evidence.length === 0) lines.push('- (none recorded — capture during retest)');
  for (const e of pack.evidence) lines.push(`- ${e}`);
  lines.push('');
  lines.push('## Fixtures');
  lines.push('');
  lines.push('- (declare any fixture files this retest needs; otherwise `(none)`)');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function packDirNameFromIssue(issue) {
  // Use the issue's full id as the dir name; strip ISSUE- prefix → RET-<rest>.
  const idTail = issue.id.replace(/^ISSUE-/, '');
  return `RET-${idTail}`;
}

/**
 * @param {{ cwd?: string, issueId?: string, allOpen?: boolean }} args
 */
export async function generateRetestPack(args = {}) {
  const cwd = args.cwd ?? process.cwd();
  const toFixDir = path.join(cwd, '_testatlas', 'to_fix');
  const baseOutDir = path.join(cwd, '_testatlas', 'tests', 'retest_packs');
  await mkdir(baseOutDir, { recursive: true });

  const allIssues = await listIssues(toFixDir);
  let selected = [];

  if (args.issueId) {
    const found = allIssues.find((i) => i.id === args.issueId);
    if (!found) {
      throw err('ISSUE_NOT_FOUND', `Issue ${args.issueId} not found under ${toFixDir}`);
    }
    selected = [found];
  } else if (args.allOpen) {
    selected = allIssues.filter((i) => i.status !== 'closed' && i.status !== 'obsolete');
  } else {
    return { ok: true, packs: [], written: [] };
  }

  // Determine starting sequence by scanning existing pack dirs.
  let nextSeq = 1;
  if (await fileExists(baseOutDir)) {
    const existing = await readdir(baseOutDir);
    for (const e of existing) {
      const sub = path.join(baseOutDir, e);
      try {
        const subEntries = await readdir(sub);
        for (const f of subEntries) {
          if (!f.endsWith('.json')) continue;
          const m = f.match(/^RETEST-(\d+)\.json$/);
          if (m) nextSeq = Math.max(nextSeq, Number(m[1]) + 1);
        }
      } catch {
        // not a directory; ignore
      }
    }
  }

  const packs = [];
  const written = [];
  for (const issue of selected) {
    const pack = packForIssue(issue, nextSeq++);
    const dirName = packDirNameFromIssue(issue);
    const outDir = path.join(baseOutDir, dirName);
    await mkdir(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `${pack.id}.json`);
    const mdPath = path.join(outDir, `${pack.id}.md`);
    await atomicWrite(jsonPath, `${JSON.stringify(pack, null, 2)}\n`);
    await atomicWrite(mdPath, renderMarkdown(pack, issue));
    packs.push(pack);
    written.push(jsonPath, mdPath);
  }

  return { ok: true, packs, written };
}

function parseArgs(argv) {
  const out = { cwd: process.cwd(), allOpen: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') out.cwd = argv[++i];
    else if (a === '--issue-id') out.issueId = argv[++i];
    else if (a === '--all-open') out.allOpen = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      console.error(`generate-retest-pack: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/generate-retest-pack.js [--cwd <dir>] [--issue-id <ISSUE-id>] [--all-open]',
    );
    process.exit(0);
  }
  generateRetestPack(args)
    .then((r) => {
      console.log(
        `generate-retest-pack: ${r.packs.length} pack(s) generated; ${r.written.length} file(s) written.`,
      );
    })
    .catch((e) => {
      console.error(`generate-retest-pack: ${e.code ?? 'ERROR'} — ${e.message}`);
      process.exit(1);
    });
}
