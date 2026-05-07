#!/usr/bin/env node
// scripts/extract-claims.js
//
// Plan 14-04 Task 2 — extract claims from a council session's transcript.jsonl
// and write them to claims.jsonl with PRD §7.10 classification.
//
// Algorithm:
//   For each transcript line, look for one or more `CLAIM[<type>]: <text>`
//   markers in the message content. For each marker, emit a claim record:
//     {
//       id: "CLAIM-<n>",  // monotonic, continues from existing claims.jsonl
//       session_id: <transcript.session_id>,
//       speaker: <transcript.speaker>,
//       type: <type>,                // observed|inferred|hypothesized|...
//       claim: <text-after-marker>,
//       confidence: <transcript.confidence ?? "needs_validation">,
//       evidence: <transcript.evidence ?? []>,
//       related_domains: [...],      // detected from substring 'domain-*' in claim
//       related_flows: [...],        // detected from substring 'FLOW-*' in claim
//       status: "pending",
//       created_at: <transcript.timestamp ?? now>
//     }
//
// CLI:
//   node scripts/extract-claims.js --session-id <id> [--cwd <dir>]
//
// Programmatic:
//   import { extractClaims } from './extract-claims.js';
//   const r = await extractClaims({ cwd, sessionId });

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';

// PRD §7.10 valid claim types.
const VALID_TYPES = new Set([
  'observed',
  'inferred',
  'hypothesized',
  'disputed',
  'invalidated',
  'accepted',
  'rejected',
  'decision',
  'consolidated_decision',
  'open_question',
]);

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonlLines(p) {
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
}

function nextClaimNumber(existing) {
  let max = 0;
  for (const c of existing) {
    const m = /^CLAIM-(\d+)$/.exec(c.id);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function extractRelatedDomains(text) {
  const out = new Set();
  const matches = text.matchAll(/\bdomain-[a-z0-9-]+\b/g);
  for (const m of matches) out.add(m[0]);
  return [...out];
}

function extractRelatedFlows(text) {
  const out = new Set();
  const matches = text.matchAll(/\bFLOW-[a-zA-Z0-9-_]+\b/g);
  for (const m of matches) out.add(m[0]);
  return [...out];
}

function parseClaimsFromContent(content) {
  const out = [];
  if (!content) return out;
  // matchAll is safe with global regex.
  const matches = content.matchAll(/CLAIM\[([a-z_]+)\]:\s*([\s\S]+?)(?=$|\n|CLAIM\[)/g);
  for (const m of matches) {
    const type = m[1].toLowerCase();
    const text = m[2].trim().replace(/\s+/g, ' ');
    if (!text) continue;
    out.push({ type, text });
  }
  return out;
}

/**
 * @param {{ cwd?: string, sessionId: string }} args
 */
export async function extractClaims(args = {}) {
  if (!args.sessionId) {
    throw err('TESTATLAS_INVALID_ARGS', 'extract-claims: --session-id is required');
  }
  const cwd = args.cwd ?? process.cwd();
  const sessionDir = path.join(cwd, '_testatlas', 'agents', 'councils', 'sessions', args.sessionId);
  const transcriptPath = path.join(sessionDir, 'transcript.jsonl');
  const claimsPath = path.join(sessionDir, 'claims.jsonl');

  if (!(await fileExists(transcriptPath))) {
    throw err('TESTATLAS_TRANSCRIPT_MISSING', `transcript file missing: ${transcriptPath}`);
  }

  const transcriptLines = await readJsonlLines(transcriptPath);

  // Read existing claims.jsonl (if any) to determine next claim ID.
  let existing = [];
  if (await fileExists(claimsPath)) {
    existing = await readJsonlLines(claimsPath);
  }
  let nextN = nextClaimNumber(existing);

  const newRecords = [];
  for (const line of transcriptLines) {
    const parsed = parseClaimsFromContent(line.content);
    for (const c of parsed) {
      const type = VALID_TYPES.has(c.type) ? c.type : 'observed';
      const record = {
        id: `CLAIM-${String(nextN).padStart(4, '0')}`,
        session_id: line.session_id ?? args.sessionId,
        speaker: line.speaker ?? 'unknown',
        type,
        claim: c.text,
        confidence: line.confidence ?? 'needs_validation',
        evidence: Array.isArray(line.evidence) ? line.evidence : [],
        related_domains: extractRelatedDomains(c.text),
        related_flows: extractRelatedFlows(c.text),
        status: 'pending',
        created_at: line.timestamp ?? new Date().toISOString(),
      };
      newRecords.push(record);
      nextN++;
    }
  }

  // Append new records to existing claims.jsonl.
  const existingText = existing.length
    ? `${existing.map((c) => JSON.stringify(c)).join('\n')}\n`
    : '';
  const newText = newRecords.map((c) => JSON.stringify(c)).join('\n');
  const out = existingText + (newText ? `${newText}\n` : '');
  await atomicWrite(claimsPath, out);

  return { ok: true, count: newRecords.length, sessionId: args.sessionId, claimsPath };
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
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log('Usage: node scripts/extract-claims.js --session-id <id> [--cwd <dir>]');
        process.exit(0);
        break;
      default:
        console.error(`extract-claims: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await extractClaims(opts);
    console.log(`extract-claims: extracted ${r.count} claim(s) → ${r.claimsPath}`);
  } catch (e) {
    console.error(`extract-claims: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
