#!/usr/bin/env node
// scripts/create-council-session.js
//
// Plan 14-04 Task 2 — generate a council session folder under
// `_testatlas/agents/councils/sessions/COUNCIL-<id>/` with all 15 PRD §7.8
// artifacts (session.{md,json}, prompt.md, context_bundle.md, participants.json,
// transcript.{jsonl,md}, claims.jsonl, disagreements.md, votes.json,
// consolidation.{md,json}, followups.md, generated_{issues,flows,questions}.md
// + outputs/ subdir for per-persona output files).
//
// Validates session.json against council_session.schema.json before write.
// Updates _testatlas/brain/agent_sessions.json index.
//
// CLI:
//   node scripts/create-council-session.js \
//     --topic "Topic" --mode roundtable-review \
//     --participants persona-a,persona-b,persona-c \
//     [--scope <scope>] [--cwd <dir>] [--suite-cwd <dir>]
//
// Programmatic:
//   import { createCouncilSession } from './create-council-session.js';
//   const r = await createCouncilSession({ cwd, topic, mode, participants, scope });

import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const COUNCIL_SESSION_SCHEMA_ID = 'https://testatlas.dev/schemas/v2/council_session.schema.json';

/**
 * The 6-value executionMode enum mirrors the bounded enum in
 * `.testatlas/schemas/council_session.schema.json` (Plan 21-01) and the
 * `executionMode` table in `.testatlas/reference/council-protocol.md` §7.2.
 * Records HOW a council was actually executed so future audits can tell the
 * difference between a real per-persona spawn and inline simulation.
 */
export const EXECUTION_MODE_ENUM = Object.freeze([
  'parallel-subagents',
  'single-spawn-inline',
  'sequential-fallback',
  'classify-only',
  'inline-simulation',
  'no-op',
]);

/**
 * Detect the executionMode for a council session via the 5-tier table.
 *
 * Tier 1: caller passed `executionMode` explicitly → returned by caller; this
 *          fn is not invoked in that path.
 * Tier 2: participants.length < 2 → degenerate spawn case.
 *          length === 0 → 'classify-only' (no review rounds run);
 *          length === 1 → 'single-spawn-inline' (one degenerate spawn).
 * Tier 3: hostHasSubagentSpawn === true  AND participants ≥ 2 → 'parallel-subagents'.
 * Tier 4: hostHasSubagentSpawn === false AND participants ≥ 2 → 'sequential-fallback'.
 * Tier 5: hostHasSubagentSpawn undefined  AND participants ≥ 2 → undefined.
 *          Caller MUST OMIT the `executionMode` field from session.json — the
 *          orchestrator agent (which knows whether it actually spawned) records
 *          the mode post-hoc. Recording 'inline-simulation' as a default would
 *          systematically produce wrong audit data — that's the bug Wave 0
 *          Test 5 prevents (HIGH-1 contract).
 *
 * @param {{participants?: string[]|undefined, hostHasSubagentSpawn?: boolean|undefined}} input
 * @returns {string|undefined} one of EXECUTION_MODE_ENUM, or undefined for Tier 5
 */
export function detectExecutionMode({ participants, hostHasSubagentSpawn } = {}) {
  const n = Array.isArray(participants) ? participants.length : 0;
  if (n === 0) return 'classify-only'; // Tier 2 (length 0)
  if (n === 1) return 'single-spawn-inline'; // Tier 2 (length 1)
  if (hostHasSubagentSpawn === true) return 'parallel-subagents'; // Tier 3
  if (hostHasSubagentSpawn === false) return 'sequential-fallback'; // Tier 4
  return undefined; // Tier 5 — caller must OMIT the field
}

// PRD §7.8 — 15 required artifact files, plus outputs/ dir.
const TEMPLATE_FILES = [
  { name: 'session.md', tmpl: 'session.md' },
  { name: 'session.json', tmpl: 'session.json' },
  { name: 'prompt.md', tmpl: 'prompt.md' },
  { name: 'context_bundle.md', tmpl: 'context_bundle.md' },
  { name: 'participants.json', tmpl: 'participants.json' },
  { name: 'transcript.jsonl', tmpl: 'transcript.jsonl' },
  { name: 'transcript.md', tmpl: 'transcript.md' },
  { name: 'claims.jsonl', tmpl: 'claims.jsonl' },
  { name: 'disagreements.md', tmpl: 'disagreements.md' },
  { name: 'votes.json', tmpl: 'votes.json' },
  { name: 'consolidation.md', tmpl: 'consolidation.md' },
  { name: 'consolidation.json', tmpl: 'consolidation.json' },
  { name: 'followups.md', tmpl: 'followups.md' },
  { name: 'generated_issues.md', tmpl: 'generated_issues.md' },
  { name: 'generated_flows.md', tmpl: 'generated_flows.md' },
  { name: 'generated_questions.md', tmpl: 'generated_questions.md' },
];

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function loadTemplate(suiteCwd, name) {
  const p = path.join(suiteCwd, '.testatlas', 'templates', 'council', name);
  return readFile(p, 'utf8');
}

async function nextSessionSuffix(sessionsDir, dateStr) {
  let entries = [];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return 1;
  }
  const re = new RegExp(`^COUNCIL-${dateStr}-(\\d+)$`);
  let max = 0;
  for (const e of entries) {
    const m = re.exec(e);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function substitute(text, vars) {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    // Token "COUNCIL-YYYY-MM-DD-NNN" → session_id
    if (k === 'session_id') {
      out = out.replace(/COUNCIL-YYYY-MM-DD-NNN/g, v);
    }
    // Generic <!-- comment --> token replacements would go here; for now we
    // intentionally keep the templates as-is (they're scaffolds for the agent).
  }
  return out;
}

/**
 * @param {{
 *   cwd?: string,
 *   suiteCwd?: string,
 *   topic: string,
 *   mode: string,
 *   participants: string[],
 *   scope?: string,
 *   orchestrator?: string,
 *   executionMode?: string,
 *   executionMode_justification?: string,
 *   hostHasSubagentSpawn?: boolean,
 * }} args
 */
export async function createCouncilSession(args = {}) {
  if (!args.topic)
    throw err('TESTATLAS_INVALID_ARGS', 'create-council-session: --topic is required');
  if (!args.mode) throw err('TESTATLAS_INVALID_ARGS', 'create-council-session: --mode is required');
  if (!Array.isArray(args.participants) || args.participants.length === 0) {
    throw err(
      'TESTATLAS_INVALID_ARGS',
      'create-council-session: --participants must be a non-empty list',
    );
  }

  // executionMode dispatch — Tier 1 (explicit) vs Tier 2-5 (auto-detect via
  // detectExecutionMode; Tier 5 returns undefined to signal "OMIT the field").
  let mode_actual;
  if (args.executionMode === undefined || args.executionMode === null) {
    mode_actual = detectExecutionMode({
      participants: args.participants,
      hostHasSubagentSpawn: args.hostHasSubagentSpawn,
    });
  } else if (!EXECUTION_MODE_ENUM.includes(args.executionMode)) {
    throw err(
      'TESTATLAS_INVALID_ARGS',
      `Invalid executionMode "${args.executionMode}". Must be one of: ${EXECUTION_MODE_ENUM.join(', ')}`,
    );
  } else {
    mode_actual = args.executionMode;
  }

  const cwd = args.cwd ?? process.cwd();
  const suiteCwd = args.suiteCwd ?? cwd;
  const wsDir = path.join(cwd, '_testatlas');
  const sessionsDir = path.join(wsDir, 'agents', 'councils', 'sessions');
  await mkdir(sessionsDir, { recursive: true });

  const dateStr = isoDate();
  const suffix = await nextSessionSuffix(sessionsDir, dateStr);
  const sessionId = `COUNCIL-${dateStr}-${String(suffix).padStart(3, '0')}`;
  const sessionDir = path.join(sessionsDir, sessionId);
  const outputsDir = path.join(sessionDir, 'outputs');
  await mkdir(outputsDir, { recursive: true });

  const createdAt = new Date().toISOString();
  const orchestrator = args.orchestrator ?? 'testatlas-orchestrator';
  const scope = args.scope ?? args.topic;

  // Conditional spread: Tier 5 (mode_actual === undefined) MUST leave
  // executionMode ABSENT from session.json (HIGH-1 contract — orchestrator
  // records post-hoc; the script does NOT guess a default).
  const sessionRecord = {
    id: sessionId,
    topic: args.topic,
    scope,
    participants: args.participants,
    status: 'pending',
    created_at: createdAt,
    orchestrator,
    ...(mode_actual !== undefined ? { executionMode: mode_actual } : {}),
    ...(args.executionMode_justification
      ? { executionMode_justification: args.executionMode_justification }
      : {}),
  };

  // Validate sessionRecord against council_session.schema.json BEFORE write.
  const ajv = await loadAllSchemas({ cwd: suiteCwd });
  const validate = ajv.getSchema(COUNCIL_SESSION_SCHEMA_ID);
  if (!validate) {
    throw err(
      'TESTATLAS_SCHEMA_MISSING',
      `council_session schema not registered: ${COUNCIL_SESSION_SCHEMA_ID}`,
    );
  }
  if (!validate(sessionRecord)) {
    const e = err(
      'TESTATLAS_INVALID_SESSION',
      `session record fails schema: ${validate.errors.map((x) => x.message).join('; ')}`,
    );
    e.validationErrors = validate.errors;
    throw e;
  }

  // Render template + write each file.
  const writes = [];

  for (const f of TEMPLATE_FILES) {
    let content;
    try {
      content = await loadTemplate(suiteCwd, f.tmpl);
    } catch {
      content = '';
    }
    if (f.name === 'session.json') {
      content = `${JSON.stringify(sessionRecord, null, 2)}\n`;
    } else if (f.name === 'participants.json') {
      const participants = args.participants.map((id) => ({
        persona_id: id,
        role: 'participant',
        joined_at: createdAt,
      }));
      content = `${JSON.stringify({ session_id: sessionId, participants }, null, 2)}\n`;
    } else {
      content = substitute(content, { session_id: sessionId });
    }
    writes.push(atomicWrite(path.join(sessionDir, f.name), content));
  }

  await Promise.all(writes);

  // Update _testatlas/brain/agent_sessions.json index.
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });
  const indexPath = path.join(brainDir, 'agent_sessions.json');
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    index = { schema_version: '2.0.0', last_updated: '', sessions: [] };
  }
  if (!Array.isArray(index.sessions)) index.sessions = [];
  index.sessions.push({
    id: sessionId,
    topic: args.topic,
    mode: args.mode,
    participants: args.participants,
    status: 'pending',
    created_at: createdAt,
  });
  index.last_updated = createdAt;
  await atomicWrite(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  return { ok: true, sessionId, sessionDir, outputsDir };
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = { participants: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--topic':
        opts.topic = argv[++i];
        break;
      case '--mode':
        opts.mode = argv[++i];
        break;
      case '--participants':
        opts.participants = String(argv[++i])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--scope':
        opts.scope = argv[++i];
        break;
      case '--orchestrator':
        opts.orchestrator = argv[++i];
        break;
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--suite-cwd':
        opts.suiteCwd = path.resolve(argv[++i]);
        break;
      case '--execution-mode':
        opts.executionMode = argv[++i];
        break;
      case '--execution-mode-justification':
        opts.executionMode_justification = argv[++i];
        break;
      case '--host-has-subagent-spawn': {
        const v = String(argv[++i]).toLowerCase();
        if (v === 'true') opts.hostHasSubagentSpawn = true;
        else if (v === 'false') opts.hostHasSubagentSpawn = false;
        else {
          console.error(
            `create-council-session: --host-has-subagent-spawn must be "true" or "false" (got "${v}")`,
          );
          process.exit(2);
        }
        break;
      }
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/create-council-session.js --topic <s> --mode <s> ' +
            '--participants <a,b,c> [--scope <s>] [--orchestrator <s>] [--cwd <dir>] [--suite-cwd <dir>] ' +
            `[--execution-mode <${EXECUTION_MODE_ENUM.join('|')}>] ` +
            '[--execution-mode-justification <text>] [--host-has-subagent-spawn <true|false>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`create-council-session: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await createCouncilSession(opts);
    console.log(`create-council-session: created ${r.sessionId} at ${r.sessionDir}`);
  } catch (e) {
    console.error(`create-council-session: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
