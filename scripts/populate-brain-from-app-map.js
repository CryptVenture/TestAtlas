#!/usr/bin/env node
// scripts/populate-brain-from-app-map.js
//
// Phase 22 Plan 02 Task 2 — DEC-002 producer.
//
// Reads `_testatlas/12_app_map.json` and writes
// `_testatlas/brain/{components,routes,commands}.json` from its components/
// routes/cliCommands fields. Idempotent — re-running with unchanged content
// returns `changed: []` (only `last_updated` is excluded from the diff).
//
// CLI:
//   node scripts/populate-brain-from-app-map.js [--cwd <dir>] [--dry-run]
//
// Programmatic:
//   import { populateBrainFromAppMap } from './populate-brain-from-app-map.js';
//   const r = await populateBrainFromAppMap({ cwd, dryRun });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { now } from './lib/determinism.js';
import { isMainModule } from './lib/is-main.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const MAPPINGS = [
  { src: 'components', file: 'components.json', key: 'components' },
  { src: 'routes', file: 'routes.json', key: 'routes' },
  { src: 'cliCommands', file: 'commands.json', key: 'commands' },
];

/**
 * @param {{ cwd?: string, dryRun?: boolean }} args
 * @param {{ assertNotUpdate?: typeof assertNotUpdate, atomicWrite?: typeof atomicWrite }} _inject
 */
export async function populateBrainFromAppMap(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const wsDir = path.join(cwd, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  const appMapPath = path.join(wsDir, '12_app_map.json');

  let appMap;
  try {
    appMap = JSON.parse(await readFile(appMapPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: true, changed: [], dryRun: args.dryRun ?? false };
    }
    throw err;
  }

  const changed = [];
  for (const m of MAPPINGS) {
    const items = Array.isArray(appMap[m.src]) ? appMap[m.src] : [];
    const targetPath = path.join(brainDir, m.file);
    let existing = {};
    try {
      existing = JSON.parse(await readFile(targetPath, 'utf8'));
    } catch {
      /* file may not exist yet */
    }

    const next = {
      schema_version: existing.schema_version ?? '2.0.0',
      last_updated: now(),
      [m.key]: items,
    };

    // Idempotency check excludes last_updated (which bumps every run).
    // BUT: if the existing file's last_updated is missing or empty, treat as
    // first-population — write so the timestamp is materialized.
    const beforeBody = JSON.stringify({ ...existing, last_updated: undefined });
    const afterBody = JSON.stringify({ ...next, last_updated: undefined });
    const needsInitialStamp =
      typeof existing.last_updated !== 'string' || existing.last_updated.length === 0;
    if (beforeBody !== afterBody || needsInitialStamp) {
      if (!args.dryRun) {
        await _atomicWrite(targetPath, `${JSON.stringify(next, null, 2)}\n`);
      }
      changed.push(m.file);
    }
  }

  return { ok: true, changed, dryRun: args.dryRun ?? false };
}
if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') opts.cwd = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/populate-brain-from-app-map.js [--cwd <dir>] [--dry-run]');
      process.exit(0);
    } else {
      console.error(`populate-brain-from-app-map: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await populateBrainFromAppMap(opts);
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error(`populate-brain-from-app-map: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
