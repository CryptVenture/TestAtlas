// scripts/sync-system-map.js
//
// Quick 260505-wjp Task 3 (G5): Thin CLI wrapper around
// scripts/lib/sync/sync-system-map.js. Persists fresh section hashes into
// manifest.generatedSections['01_system_map.md'] and bumps lastUpdatedAt.
//
// CLI:
//   node scripts/sync-system-map.js [--workspace <p>] [--cwd <p>] [--dry-run] [--help]

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { now } from './lib/determinism.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { syncSystemMap } from './lib/sync/sync-system-map.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const FILE = '01_system_map.md';
const MANIFEST = '11_workspace_manifest.json';

export async function syncSystemMapCli(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);

  const r = await syncSystemMap(
    { wsDir },
    { atomicWrite: args.dryRun ? async () => {} : _atomicWrite },
  );

  // Persist hashes into manifest.
  const manifestPath = path.join(wsDir, MANIFEST);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`sync-system-map: ${MANIFEST} not found at ${manifestPath}`);
      e.code = 'TESTATLAS_MANIFEST_MISSING';
      throw e;
    }
    throw err;
  }
  manifest.generatedSections ??= {};
  if (!manifest.generatedSections[FILE]) manifest.generatedSections[FILE] = {};
  Object.assign(manifest.generatedSections[FILE], r.hashes);
  manifest.lastUpdatedAt = now();
  if (!args.dryRun) {
    await _atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return { ...r, dryRun: !!args.dryRun };
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
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/sync-system-map.js [--workspace <p>] [--cwd <p>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`sync-system-map: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await syncSystemMapCli(opts);
    console.log(`sync-system-map: ${r.dryRun ? 'would update' : 'updated'} system-map=${r.wrote}`);
  } catch (e) {
    console.error(`sync-system-map: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
