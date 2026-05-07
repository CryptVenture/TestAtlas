#!/usr/bin/env node
// scripts/consolidate-council.js
//
// Plan 14-02 Task 2 — consolidate a council session: read its claims, votes,
// and disagreements; update brain decisions/open_questions; write a
// followups.md inside the session folder.
//
// CLI:
//   node scripts/consolidate-council.js --session-id <id> [--dry-run]
//
// Programmatic:
//   import { consolidateCouncil } from './consolidate-council.js';
//   const r = await consolidateCouncil({ cwd, sessionId, dryRun });

import { mkdir, readFile, stat } from 'node:fs/promises';
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

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function readJsonlLines(p) {
  try {
    const text = await readFile(p, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function readJsonOr(p, fb) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fb;
  }
}

/**
 * @param {{ cwd?: string, sessionId: string, dryRun?: boolean }} args
 */
export async function consolidateCouncil(args = {}) {
  if (!args.sessionId)
    throw err('TESTATLAS_INVALID_ARGS', 'consolidate-council: --session-id is required');
  const cwd = args.cwd ?? process.cwd();
  const wsDir = path.join(cwd, '_testatlas');
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', args.sessionId);
  if (!(await fileExists(sessionDir))) {
    throw err('TESTATLAS_SESSION_MISSING', `session folder missing: ${sessionDir}`);
  }

  const claims = await readJsonlLines(path.join(sessionDir, 'claims.jsonl'));
  const votes = await readJsonOr(path.join(sessionDir, 'votes.json'), { votes: [] });
  let disagreementsText = '';
  try {
    disagreementsText = await readFile(path.join(sessionDir, 'disagreements.md'), 'utf8');
  } catch {
    /* optional */
  }

  // Build followups.md from claims (anything pending or strong_suspect).
  const lines = [];
  lines.push(`# Followups — ${args.sessionId}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Claims requiring follow-up');
  lines.push('');
  const followups = claims.filter(
    (c) =>
      c.status === 'pending' ||
      c.status === 'needs_validation' ||
      c.confidence === 'strong_suspect',
  );
  if (followups.length === 0) {
    lines.push('- (none)');
  } else {
    for (const c of followups) {
      lines.push(`- [${c.id}] (${c.speaker}, ${c.confidence}) — ${c.claim}`);
    }
  }
  lines.push('');
  lines.push('## Votes');
  lines.push('');
  const voteList = Array.isArray(votes.votes) ? votes.votes : [];
  if (voteList.length === 0) lines.push('- (no votes cast)');
  for (const v of voteList) lines.push(`- ${v.claim_id ?? '?'}: ${v.value ?? '?'}`);
  lines.push('');
  lines.push('## Disagreements (excerpt)');
  lines.push('');
  if (disagreementsText.trim().length === 0) {
    lines.push('- (none)');
  } else {
    lines.push('```');
    lines.push(disagreementsText.split('\n').slice(0, 30).join('\n'));
    lines.push('```');
  }
  lines.push('');

  if (args.dryRun) {
    return { ok: true, dryRun: true, followupsCount: followups.length };
  }

  const followupsPath = path.join(sessionDir, 'followups.md');
  await atomicWrite(followupsPath, lines.join('\n'));

  // Update brain/decisions.json with any consolidated_decision claim.
  const brainDir = path.join(wsDir, 'brain');
  const decisionsPath = path.join(brainDir, 'decisions.json');
  const decisionsIdx = await readJsonOr(decisionsPath, null);
  if (decisionsIdx) {
    if (!Array.isArray(decisionsIdx.decisions)) decisionsIdx.decisions = [];
    for (const c of claims) {
      if (c.type === 'decision' || c.type === 'consolidated_decision') {
        decisionsIdx.decisions.push({
          id: c.id,
          session_id: c.session_id,
          summary: c.claim,
          confidence: c.confidence,
          recorded_at: c.created_at,
        });
      }
    }
    decisionsIdx.last_updated = new Date().toISOString();
    await mkdir(brainDir, { recursive: true });
    await atomicWrite(decisionsPath, `${JSON.stringify(decisionsIdx, null, 2)}\n`);
  }

  return { ok: true, followupsPath, followupsCount: followups.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--session-id':
        opts.sessionId = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/consolidate-council.js --session-id <id> [--dry-run] [--cwd <dir>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`consolidate-council: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await consolidateCouncil(opts);
    if (r.dryRun) {
      console.log(
        `consolidate-council: dry-run — ${r.followupsCount} followup(s) would be recorded`,
      );
    } else {
      console.log(`consolidate-council: wrote ${r.followupsPath}`);
    }
  } catch (e) {
    console.error(`consolidate-council: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
