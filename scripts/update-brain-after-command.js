#!/usr/bin/env node
// scripts/update-brain-after-command.js
//
// Plan 14-02 Task 3 — automate post-command brain update.
//
// Called by every V2 command after the command body completes. Responsibilities:
//   - Append an event to brain/events.jsonl (via append-event.js).
//   - Update brain/state.json status.last_command + status.last_updated.
//   - When `--reindex` is passed, also rebuild brain indexes from artifacts
//     (delegates to scripts/index-artifacts.js).
//
// CLI:
//   node scripts/update-brain-after-command.js --command <s> --actor <s> \
//     --summary <s> [--status completed|aborted|in_progress] \
//     [--artifacts-read a,b] [--artifacts-written a,b] [--evidence a,b] \
//     [--reindex] [--cwd <dir>] [--suite-cwd <dir>]
//
// Programmatic:
//   import { updateBrainAfterCommand } from './update-brain-after-command.js';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { appendEvent } from './append-event.js';
import { atomicWrite } from './lib/atomic-write.js';
import { now } from './lib/determinism.js';

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * @param {{
 *   cwd?: string,
 *   suiteCwd?: string,
 *   command: string,
 *   actor: string,
 *   summary: string,
 *   status?: 'completed'|'aborted'|'in_progress',
 *   artifactsRead?: string[],
 *   artifactsWritten?: string[],
 *   evidence?: string[],
 *   reindex?: boolean,
 *   reconcileCounts?: boolean,
 *   populateFromAppMap?: boolean,
 *   detectDrift?: boolean,
 * }} args
 * @param {{
 *   reconcileCounts?: Function,
 *   populateBrainFromAppMap?: Function,
 *   detectDrift?: Function,
 * }} _inject — TEST ONLY. Lets test harnesses replace the dynamic imports
 *   for reconcile-counts.js / populate-brain-from-app-map.js / detect-drift.js
 *   with mock functions. Production callers do NOT pass _inject.
 */
export async function updateBrainAfterCommand(args = {}, _inject = {}) {
  if (!args.command)
    throw err('TESTATLAS_INVALID_ARGS', 'update-brain-after-command: --command is required');
  if (!args.actor)
    throw err('TESTATLAS_INVALID_ARGS', 'update-brain-after-command: --actor is required');
  if (!args.summary)
    throw err('TESTATLAS_INVALID_ARGS', 'update-brain-after-command: --summary is required');

  const cwd = args.cwd ?? process.cwd();
  const suiteCwd = args.suiteCwd ?? cwd;

  const status = args.status ?? 'completed';
  // Map status → event.type per event.schema.json enum.
  const typeFor = {
    completed: 'command_completed',
    aborted: 'command_aborted',
    in_progress: 'command_started',
  };
  const eventType = typeFor[status] ?? 'command_completed';

  const ev = await appendEvent({
    cwd,
    suiteCwd,
    actor: args.actor,
    command: args.command,
    type: eventType,
    summary: args.summary,
    status,
    artifactsRead: args.artifactsRead,
    artifactsWritten: args.artifactsWritten,
    evidence: args.evidence,
  });

  // Bump state.json last_command + last_updated (best-effort).
  const statePath = path.join(cwd, '_testatlas', 'brain', 'state.json');
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    if (state.status) {
      state.status.last_command = args.command;
      state.status.last_updated = now();
      await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
    }
  } catch {
    // state.json missing — ignore (event still recorded).
  }

  if (args.reindex) {
    const { indexArtifacts } = await import('./index-artifacts.js');
    await indexArtifacts({ cwd });
  }

  if (args.reconcileCounts) {
    const fn =
      _inject.reconcileCounts ??
      (await import('./reconcile-counts.js')).reconcileCounts;
    await fn({ cwd });
  }

  if (args.populateFromAppMap) {
    const fn =
      _inject.populateBrainFromAppMap ??
      (await import('./populate-brain-from-app-map.js')).populateBrainFromAppMap;
    await fn({ cwd });
  }

  if (args.detectDrift) {
    const fn =
      _inject.detectDrift ?? (await import('./detect-drift.js')).detectDrift;
    await fn({ cwd });
  }

  return { ok: true, event: ev.event };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--command':
        opts.command = argv[++i];
        break;
      case '--actor':
        opts.actor = argv[++i];
        break;
      case '--summary':
        opts.summary = argv[++i];
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
      case '--reindex':
        opts.reindex = true;
        break;
      case '--reconcile-counts':
        opts.reconcileCounts = true;
        break;
      case '--populate-from-app-map':
        opts.populateFromAppMap = true;
        break;
      case '--detect-drift':
        opts.detectDrift = true;
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
          'Usage: node scripts/update-brain-after-command.js --command <s> --actor <s> --summary <s> ' +
            '[--status completed|aborted|in_progress] [--artifacts-read a,b] [--artifacts-written a,b] ' +
            '[--evidence a,b] [--reindex] [--reconcile-counts] [--populate-from-app-map] ' +
            '[--detect-drift] [--cwd <dir>] [--suite-cwd <dir>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`update-brain-after-command: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await updateBrainAfterCommand(opts);
    console.log(`update-brain-after-command: recorded ${r.event.id}`);
  } catch (e) {
    console.error(`update-brain-after-command: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
