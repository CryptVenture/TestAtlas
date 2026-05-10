#!/usr/bin/env node
// scripts/redact-evidence.js
//
// Plan 14-02 Task 2 — scan evidence files for known secret/PII patterns
// (PRD §7.16 / Phase 11 secret-scanner). Writes a redacted copy under
// `<wsDir>/evidence/redacted/` with sensitive segments replaced by
// `[REDACTED:<reason>]` markers. Original file is NEVER mutated.
//
// CLI:
//   node scripts/redact-evidence.js --evidence-id <id> [--cwd <dir>]
//
// Programmatic:
//   import { redactEvidence } from './redact-evidence.js';
//   const r = await redactEvidence({ cwd, evidenceId });

import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';

/**
 * Each pattern: a regex + a label. Regexes are intentionally narrow — false
 * positives are far less harmful than false negatives, but we still avoid
 * matching plain English words.
 */
const PATTERNS = [
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'github-pat', re: /ghp_[A-Za-z0-9]{30,}/g },
  { name: 'github-secret', re: /ghs_[A-Za-z0-9]{30,}/g },
  { name: 'github-server', re: /gho_[A-Za-z0-9]{30,}/g },
  { name: 'github-user', re: /ghu_[A-Za-z0-9]{30,}/g },
  { name: 'github-refresh', re: /ghr_[A-Za-z0-9]{30,}/g },
  { name: 'npm-token', re: /npm_[A-Za-z0-9]{30,}/g },
  { name: 'slack-bot-token', re: /xoxb-[A-Za-z0-9-]{10,}/g },
  { name: 'slack-user-token', re: /xoxp-[A-Za-z0-9-]{10,}/g },
  {
    name: 'token-query-param',
    re: /([?&])token=[^\s&"']+/g,
    repl: (_m, p) => `${p}token=[REDACTED:token-query-param]`,
  },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  {
    name: 'private-key-block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED |)PRIVATE KEY-----/g,
  },
  { name: 'aws-secret', re: /AWS_SECRET[_A-Z]*\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/g },
];

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * Scan + replace. Returns the redacted text and a list of pattern names hit.
 *
 * @param {string} text
 */
export function redactText(text) {
  let out = text;
  const hits = new Set();
  for (const p of PATTERNS) {
    if (p.repl) {
      const before = out;
      out = out.replace(p.re, p.repl);
      if (before !== out) hits.add(p.name);
    } else {
      const matches = out.match(p.re);
      if (matches && matches.length > 0) {
        hits.add(p.name);
        out = out.replace(p.re, `[REDACTED:${p.name}]`);
      }
    }
  }
  return { redacted: out, hits: [...hits] };
}

async function findEvidenceFile(wsDir, evidenceId) {
  const root = path.join(wsDir, 'evidence');
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    throw err('TESTATLAS_EVIDENCE_NOT_FOUND', `evidence dir missing: ${root}`);
  }
  for (const e of entries) {
    if (e.isDirectory()) continue;
    if (e.name.startsWith(`${evidenceId}.`) || e.name === evidenceId) {
      return path.join(root, e.name);
    }
  }
  throw err('TESTATLAS_EVIDENCE_NOT_FOUND', `evidence not found: ${evidenceId}`);
}

/**
 * @param {{ cwd?: string, evidenceId: string, force?: boolean }} args
 */
export async function redactEvidence(args = {}) {
  if (!args.evidenceId)
    throw err('TESTATLAS_INVALID_ARGS', 'redact-evidence: --evidence-id is required');
  const cwd = args.cwd ?? process.cwd();
  const wsDir = path.join(cwd, '_testatlas');

  const sourcePath = await findEvidenceFile(wsDir, args.evidenceId);
  const text = await readFile(sourcePath, 'utf8');
  const { redacted, hits } = redactText(text);
  const sensitive = hits.length > 0;

  if (!sensitive) {
    return { ok: true, sensitive: false, hits: [], redactedPath: null };
  }

  const redactedDir = path.join(wsDir, 'evidence', 'redacted');
  await mkdir(redactedDir, { recursive: true });
  const redactedPath = path.join(redactedDir, path.basename(sourcePath));
  await atomicWrite(redactedPath, redacted);
  return { ok: true, sensitive: true, hits, redactedPath };
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--evidence-id':
        opts.evidenceId = argv[++i];
        break;
      case '--force':
        opts.force = true;
        break;
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/redact-evidence.js --evidence-id <id> [--force] [--cwd <dir>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`redact-evidence: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await redactEvidence(opts);
    if (r.sensitive) {
      console.log(`redact-evidence: wrote ${r.redactedPath} (hits: ${r.hits.join(', ')})`);
    } else {
      console.log(`redact-evidence: ${opts.evidenceId} clean — no redaction needed`);
    }
  } catch (e) {
    console.error(`redact-evidence: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
