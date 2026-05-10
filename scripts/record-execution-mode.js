#!/usr/bin/env node

// scripts/record-execution-mode.js
//
// Phase 22 Plan 02 Task 4 — DEC-006 producer.
//
// Post-hoc executionMode setter for an existing council session. Stamps
// `executionMode` + (optional) `executionMode_justification` onto
// session.json idempotently and AJV-validates against
// .testatlas/schemas/council_session.schema.json.
//
// Crucially, this script is SEPARATE from create-council-session.js — the
// Tier-5 contract (executionMode ABSENT when both args undefined at create
// time) is preserved. This is the post-hoc updater.
//
// CLI:
//   node scripts/record-execution-mode.js --session-id <id> --mode <mode> \
//     [--justification <text>] [--cwd <dir>] [--dry-run]
//
// Programmatic:
//   import { recordExecutionMode } from './record-execution-mode.js';
//   const r = await recordExecutionMode({ cwd, sessionId, mode, justification });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { atomicWrite } from './lib/atomic-write.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

// MUST match the enum in .testatlas/schemas/council_session.schema.json#executionMode.
export const VALID_MODES = [
  'parallel-subagents',
  'single-spawn-inline',
  'sequential-fallback',
  'classify-only',
  'inline-simulation',
  'no-op',
];

/**
 * @param {{
 *   cwd?: string,
 *   sessionId: string,
 *   mode: string,
 *   justification?: string,
 *   dryRun?: boolean,
 * }} args
 * @param {{ assertNotUpdate?: typeof assertNotUpdate, atomicWrite?: typeof atomicWrite }} _inject
 */
export async function recordExecutionMode(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const { sessionId, mode, justification } = args;

  if (!sessionId) return { ok: false, error: 'sessionId required' };
  if (!VALID_MODES.includes(mode)) {
    return {
      ok: false,
      error: `invalid mode "${mode}"; valid: ${VALID_MODES.join(', ')}`,
    };
  }

  const sessionPath = path.join(
    cwd,
    '_testatlas',
    'agents',
    'councils',
    'sessions',
    sessionId,
    'session.json',
  );

  let session;
  try {
    session = JSON.parse(await readFile(sessionPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: false, error: `session not found: ${sessionId}` };
    }
    throw err;
  }

  const before = JSON.stringify(session);
  session.executionMode = mode;
  if (justification !== undefined && justification !== null) {
    session.executionMode_justification = justification;
  }
  const after = JSON.stringify(session);
  const changed = before !== after;

  // AJV-validate against council_session.schema.json BEFORE writing.
  const schemaPath = path.join(cwd, '.testatlas', 'schemas', 'council_session.schema.json');
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  } catch (err) {
    // If schema is unreachable (e.g., consumer repo without .testatlas/),
    // fall back to the VALID_MODES enum check (already passed above).
    if (err.code !== 'ENOENT') throw err;
    schema = null;
  }
  if (schema) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    delete schema.$schema;
    const validate = ajv.compile(schema);
    if (!validate(session)) {
      return {
        ok: false,
        error: 'schema validation failed',
        details: validate.errors,
      };
    }
  }

  if (changed && !args.dryRun) {
    await _atomicWrite(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
  }
  return { ok: true, changed, sessionId, mode };
}

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session-id') opts.sessionId = argv[++i];
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--justification') opts.justification = argv[++i];
    else if (a === '--cwd') opts.cwd = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node scripts/record-execution-mode.js --session-id <id> --mode <${VALID_MODES.join('|')}> ` +
          '[--justification <text>] [--cwd <dir>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`record-execution-mode: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await recordExecutionMode(opts);
    console.log(JSON.stringify(r));
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(`record-execution-mode: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
