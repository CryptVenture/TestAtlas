// scripts/lib/migrate.js
//
// Plan 07-03 Task 2 — workspace migration framework (UPDATE-05).
//
// Discovery: scan a migrations dir for files matching `^v\d+-to-v\d+\.js$`,
// dynamic-import each to read its `fromSchema` / `toSchema` / `description`
// exports, return descriptors sorted by `fromSchema`.
//
// Composition: run every migration whose `fromSchema >= cur` in sort order.
// Throw `Migration gap: at v<cur>, next available is v<m.fromSchema>` when the
// next available migration is not exactly `cur`.
//
// Idempotency: each `up()` is responsible for its own no-op-on-repeat
// behavior. The runner additionally skips migrations whose `fromSchema < cur`,
// so a second `applyMigrations` call after success will simply observe
// `schemaVersion === lastMigration.toSchema` and skip everything.
//
// Two-tree invariant: migrations are the explicit-bypass call site for
// workspace-guard. The runner sets `assertNotUpdate('migration')` before each
// up() — purely as a sanity gate that the bypass is correctly registered in
// VALID_CONTEXTS. Production migrations may also call assertNotUpdate
// themselves; that's harmless.
//
// SchemaVersion bump: the runner — NOT individual `up()` functions — updates
// the install manifest's `schemaVersion` after all migrations succeed, by
// rewriting the manifest JSON in place (we deliberately don't re-hash files
// via `writeManifest`, since the migration changed `_testatlas/` but not the
// suite tree the manifest tracks).

import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTALL_MANIFEST_PATH } from './constants.js';
import { loadAndValidateManifest } from './manifest.js';
import { assertNotUpdate } from './workspace-guard.js';

const MIGRATION_FILE_RE = /^v(\d+)-to-v(\d+)\.js$/;

/**
 * @typedef {Object} MigrationDescriptor
 * @property {string} file        Filename (e.g. 'v1-to-v2.js').
 * @property {string} absPath     Absolute path of the migration module.
 * @property {number} fromSchema
 * @property {number} toSchema
 * @property {string} description
 */

/**
 * Discover migration files under `migrationsDir`. Returns descriptors sorted
 * by `fromSchema` ascending. Missing dirs return `[]` (so v0.1.0 — which
 * ships zero migrations — is safe to call against).
 *
 * @param {string} migrationsDir Absolute path of the migrations directory.
 * @returns {Promise<MigrationDescriptor[]>}
 */
export async function discoverMigrations(migrationsDir) {
  let entries;
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  /** @type {MigrationDescriptor[]} */
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!MIGRATION_FILE_RE.test(entry.name)) continue;
    const absPath = path.join(migrationsDir, entry.name);
    const url = pathToFileURL(absPath).href;
    const mod = await import(url);
    if (typeof mod.fromSchema !== 'number' || typeof mod.toSchema !== 'number') {
      throw new Error(
        `migrate.discoverMigrations: ${entry.name} missing numeric fromSchema/toSchema exports`,
      );
    }
    out.push({
      file: entry.name,
      absPath,
      fromSchema: mod.fromSchema,
      toSchema: mod.toSchema,
      description: typeof mod.description === 'string' ? mod.description : '',
    });
  }
  out.sort((a, b) => a.fromSchema - b.fromSchema);
  return out;
}

/**
 * Apply every migration in `migrationsDir` against the workspace at `target`,
 * advancing `manifest.schemaVersion` by composition. Each `up()` is invoked
 * with `(workspaceDir=<target>/_testatlas, ctx={fromVersion, toVersion})`.
 *
 * Errors from `up()` propagate; the manifest is NOT rewritten on partial
 * failure (the orchestrator in update-core.js aborts BEFORE the suite swap so
 * a failed migration leaves _testatlas/ in whatever state up() left it, and a
 * subsequent retry — relying on idempotency — picks up where it stopped).
 *
 * @param {{
 *   target: string,
 *   fromVersion: string,
 *   toVersion: string,
 *   migrationsDir: string,
 *   onlyUpToSchema?: number,
 * }} opts
 * @returns {Promise<{
 *   migrationsApplied: MigrationDescriptor[],
 *   schemaVersion: number,
 * }>}
 */
export async function applyMigrations(opts) {
  const { target, fromVersion, toVersion, migrationsDir } = opts;
  const onlyUpToSchema = typeof opts.onlyUpToSchema === 'number' ? opts.onlyUpToSchema : Infinity;

  const migrations = await discoverMigrations(migrationsDir);

  const manifest = await loadAndValidateManifest(target);
  let cur = manifest.schemaVersion;

  /** @type {MigrationDescriptor[]} */
  const applied = [];

  for (const m of migrations) {
    if (m.fromSchema < cur) continue; // already applied
    if (m.toSchema > onlyUpToSchema) break; // test-restricted upper bound
    if (m.fromSchema !== cur) {
      const err = new Error(
        `Migration gap: at v${cur}, next available is v${m.fromSchema} (file ${m.file}). ` +
          'The migrations directory is missing one or more vN-to-vM.js files between these schemas.',
      );
      err.code = 'TESTATLAS_MIGRATION_GAP';
      err.fromSchema = cur;
      err.nextAvailable = m.fromSchema;
      throw err;
    }
    // Sanity gate the workspace-guard contract. Migration is the ONE caller
    // context allowed to mutate _testatlas/ during an update flow; this call
    // verifies the contract is wired correctly (it never throws unless the
    // VALID_CONTEXTS set is mis-configured).
    assertNotUpdate('migration');
    const url = pathToFileURL(m.absPath).href;
    const mod = await import(url);
    if (typeof mod.up !== 'function') {
      throw new Error(`migrate.applyMigrations: ${m.file} missing async up() export`);
    }
    await mod.up(path.join(target, '_testatlas'), { fromVersion, toVersion });
    cur = m.toSchema;
    applied.push(m);
  }

  // Persist the updated schemaVersion. We rewrite the manifest JSON in place
  // (NOT via writeManifest — that would re-hash every file, which is the job
  // of update-core.js post-swap, not migrate.js).
  if (manifest.schemaVersion !== cur) {
    manifest.schemaVersion = cur;
    const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  return { migrationsApplied: applied, schemaVersion: cur };
}
