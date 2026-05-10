#!/usr/bin/env node
// scripts/append-event.js
//
// Plan 14-02 Task 1 — append a single line to `_testatlas/brain/events.jsonl`,
// AJV-validated against `.testatlas/schemas/event.schema.json`. Allocates a
// monotonically increasing `EVENT-N` id from the existing log.
//
// CLI:
//   node scripts/append-event.js --actor <s> --type <enum> --summary <s> \
//     [--command <s>] [--artifacts-read a,b] [--artifacts-written a,b] \
//     [--evidence a,b] [--status <enum>] [--cwd <dir>] [--suite-cwd <dir>]
//
// Programmatic:
//   import { appendEvent } from './append-event.js';
//   const r = await appendEvent({ cwd, actor, type, summary, ... });

import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isMainModule } from './lib/is-main.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const EVENT_SCHEMA_ID = 'https://testatlas.dev/schemas/v2/event.schema.json';

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function nextEventId(eventsPath) {
  let max = 0;
  try {
    const text = await readFile(eventsPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/"id"\s*:\s*"EVENT-(\d+)"/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return `EVENT-${max + 1}`;
}

/**
 * @param {{
 *   cwd?: string,
 *   suiteCwd?: string,
 *   actor: string,
 *   type: string,
 *   summary: string,
 *   command?: string,
 *   artifactsRead?: string[],
 *   artifactsWritten?: string[],
 *   evidence?: string[],
 *   status?: 'completed'|'aborted'|'in_progress',
 *   timestamp?: string,
 * }} args
 */
export async function appendEvent(args = {}) {
  if (!args.actor) throw err('TESTATLAS_INVALID_ARGS', 'append-event: --actor is required');
  if (!args.type) throw err('TESTATLAS_INVALID_ARGS', 'append-event: --type is required');
  if (!args.summary) throw err('TESTATLAS_INVALID_ARGS', 'append-event: --summary is required');

  const cwd = args.cwd ?? process.cwd();
  const suiteCwd = args.suiteCwd ?? cwd;
  const brainDir = path.join(cwd, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const eventsPath = path.join(brainDir, 'events.jsonl');

  const id = await nextEventId(eventsPath);
  const event = {
    id,
    timestamp: args.timestamp ?? new Date().toISOString(),
    actor: args.actor,
    type: args.type,
    summary: args.summary,
    status: args.status ?? 'completed',
  };
  if (args.command) event.command = args.command;
  if (Array.isArray(args.artifactsRead)) event.artifacts_read = args.artifactsRead;
  if (Array.isArray(args.artifactsWritten)) event.artifacts_written = args.artifactsWritten;
  if (Array.isArray(args.evidence)) event.evidence = args.evidence;

  // Validate before append.
  const ajv = await loadAllSchemas({ cwd: suiteCwd });
  const validate = ajv.getSchema(EVENT_SCHEMA_ID);
  if (!validate)
    throw err('TESTATLAS_SCHEMA_MISSING', `event schema not registered: ${EVENT_SCHEMA_ID}`);
  if (!validate(event)) {
    const e = err(
      'TESTATLAS_INVALID_EVENT',
      `event fails schema: ${validate.errors.map((x) => x.message).join('; ')}`,
    );
    e.validationErrors = validate.errors;
    throw e;
  }

  // Append (no atomic-rename: JSONL is append-only). Use single fh.write to
  // avoid interleaving with concurrent writers.
  const fh = await open(eventsPath, 'a');
  try {
    await fh.write(`${JSON.stringify(event)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }

  return { ok: true, event };
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--actor':
        opts.actor = argv[++i];
        break;
      case '--type':
        opts.type = argv[++i];
        break;
      case '--summary':
        opts.summary = argv[++i];
        break;
      case '--command':
        opts.command = argv[++i];
        break;
      case '--status':
        opts.status = argv[++i];
        break;
      case '--artifacts-read':
        opts.artifactsRead = String(argv[++i])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--artifacts-written':
        opts.artifactsWritten = String(argv[++i])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--evidence':
        opts.evidence = String(argv[++i])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--suite-cwd':
        opts.suiteCwd = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/append-event.js --actor <s> --type <enum> --summary <s> ' +
            '[--command <s>] [--status completed|aborted|in_progress] ' +
            '[--artifacts-read a,b] [--artifacts-written a,b] [--evidence a,b] ' +
            '[--cwd <dir>] [--suite-cwd <dir>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`append-event: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await appendEvent(opts);
    console.log(`append-event: wrote ${r.event.id}`);
  } catch (e) {
    console.error(`append-event: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
