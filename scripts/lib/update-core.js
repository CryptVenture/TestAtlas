// scripts/lib/update-core.js
//
// Plan 07-03 Task 3 — atomic update orchestrator (UPDATE-02, UPDATE-06).
//
// Flow (RESEARCH §Pattern 8):
//
//   1. acquireLock(target, {pid, holdReason: 'update'})
//   2. Decide whether to update (semver compare, --force-reinstall override)
//   3. Stage tarball into <target>/.testatlas.staging-<ts>/
//      a. downloadTarball(latestVersion) → tmp .tgz
//      b. verifyChecksum
//      c. extractTarball
//   4. applyMigrations({target, fromVersion, toVersion, migrationsDir: <stage>/migrations})
//      — runs BEFORE the suite swap so the new schema is in place when the new
//        suite (which expects it) takes over. If migration fails: abort, rm
//        the staging dir, lock released by the finally block; suite UNTOUCHED.
//   5. Atomic swap:
//      a. rename(.testatlas, .testatlas.backup-<ts>)
//      b. rename(staging, .testatlas)
//        On failure of (b): rename(backup, .testatlas) — REVERSE — and rethrow.
//   6. pruneBackups(target, 3) — keep newest 3 by ISO-timestamp lexical sort.
//   7. releaseLock (in finally; also on early returns).
//
// SIGINT safety: a one-shot SIGINT handler is registered while the update is
// in progress. On signal, it best-effort-cleans the staging dir, releases the
// lock, and exits with 130. The handler is removed in the finally block so
// nested updates and tests don't leak handlers.
//
// Test seam: the module-level `_testHooks` object accepts overrides for ops
// that are otherwise hard to mock cleanly. See test/update/update-rollback.test.js.

import { rename as fsRename, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { acquireLock, releaseLock } from './lockfile.js';
import { applyMigrations } from './migrate.js';
import {
  downloadTarball as tarballDownload,
  extractTarball as tarballExtract,
  verifyChecksum as tarballVerify,
} from './tarball.js';

/**
 * Test seam — set via `update-core._testHooks.renameImpl = ...` in tests to
 * inject failures at specific rename calls. Production code never sets these.
 *
 * @type {{
 *   renameImpl?: (src: string, dst: string) => Promise<void>,
 * }}
 */
export const _testHooks = {};

const STAGING_PREFIX = '.testatlas.staging-';
const BACKUP_PREFIX = '.testatlas.backup-';

const DEFAULT_LOGGER = (msg) => process.stdout.write(`${msg}\n`);

/**
 * @typedef {Object} RunUpdateOptions
 * @property {string}  target                Absolute path of the install target.
 * @property {string}  currentVersion        Currently-installed suite version.
 * @property {string}  [latestVersion]       Target version (Plan 07-04 wires update-check).
 * @property {boolean} [forceReinstall]      Re-extract even if up-to-date.
 * @property {boolean} [dryRun]              Print plan; don't write.
 * @property {boolean} [noUpdateCheck]       Reserved for Plan 07-04 (TTL cache).
 * @property {string}  [expectedSha]         Optional SHA-256 hex; null/undefined skips with warning.
 * @property {(msg: string) => void} [logger]
 */

/**
 * @typedef {Object} RunUpdateResult
 * @property {'updated'|'up-to-date'|'dry-run'} status
 * @property {string} [previousVersion]
 * @property {string} [newVersion]
 * @property {string} [backupDir]            Path of the kept backup dir (post-swap).
 * @property {number} [migrationsApplied]
 */

/**
 * Generate a sortable timestamp suffix safe for filesystem path components.
 * Format: YYYY-MM-DDTHH-MM-SS-mmmZ (colons/dots replaced with hyphens).
 */
function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Tag-equality short-circuit: if currentVersion is exactly latestVersion (or
 * latestVersion is omitted), update is unnecessary. semver.gt is the strict
 * compare we use elsewhere (latestVersion > currentVersion → update).
 *
 * @param {string} currentVersion
 * @param {string|undefined} latestVersion
 * @returns {boolean}
 */
function shouldUpdate(currentVersion, latestVersion) {
  if (!latestVersion) return false;
  if (currentVersion === latestVersion) return false;
  // semver.gt may throw on non-semver inputs; treat invalid as "update unknown,
  // skip" — the safer default.
  try {
    return semver.gt(latestVersion, currentVersion);
  } catch {
    return false;
  }
}

/**
 * Best-effort rm of a path. Catches and ignores errors so cleanup never
 * masks the original failure.
 *
 * @param {string} p
 */
async function rmSilent(p) {
  await rm(p, { recursive: true, force: true }).catch(() => {});
}

/**
 * List `.testatlas.backup-*` directories under `target`, sorted oldest →
 * newest by lexical name (which is timestamp-ordered for ISO-8601-derived
 * suffixes). Removes all but the newest `keep`.
 *
 * @param {string} target
 * @param {number} keep
 * @returns {Promise<{ kept: string[], removed: string[] }>}
 */
async function pruneBackups(target, keep) {
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(BACKUP_PREFIX))
    .map((e) => e.name)
    .sort(); // ascending lexical = ascending timestamp
  const removed = [];
  while (backups.length > keep) {
    const name = backups.shift();
    await rmSilent(path.join(target, name));
    removed.push(name);
  }
  return { kept: backups, removed };
}

/**
 * Wrap `fs.rename` with the test seam.
 * @param {string} src
 * @param {string} dst
 */
async function doRename(src, dst) {
  if (_testHooks.renameImpl) return _testHooks.renameImpl(src, dst);
  return fsRename(src, dst);
}

/**
 * Atomic update orchestrator. See file header for the full flow.
 *
 * @param {RunUpdateOptions} opts
 * @returns {Promise<RunUpdateResult>}
 */
export async function runUpdate(opts) {
  const target = path.resolve(opts.target);
  const currentVersion = opts.currentVersion;
  const latestVersion = opts.latestVersion;
  const log = opts.logger ?? DEFAULT_LOGGER;
  const forceReinstall = Boolean(opts.forceReinstall);
  const dryRun = Boolean(opts.dryRun);

  if (!currentVersion) {
    throw new TypeError('runUpdate: `currentVersion` is required');
  }

  // Up-to-date short-circuit (skipped under --force-reinstall).
  if (!forceReinstall && !shouldUpdate(currentVersion, latestVersion)) {
    log(`Already up to date (current ${currentVersion}, latest ${latestVersion ?? 'unknown'}).`);
    return { status: 'up-to-date', previousVersion: currentVersion };
  }

  const newVersion = latestVersion ?? currentVersion;
  const ts = nowSlug();
  const stageDir = path.join(target, `${STAGING_PREFIX}${ts}`);
  const backupDir = path.join(target, `${BACKUP_PREFIX}${ts}`);
  const tmpTarball = path.join(target, `${STAGING_PREFIX}${ts}.tgz`);

  if (dryRun) {
    log(`[dry-run] Would update ${target} from ${currentVersion} → ${newVersion}`);
    log(`[dry-run] Stage dir: ${stageDir}`);
    log(`[dry-run] Backup dir: ${backupDir}`);
    return { status: 'dry-run', previousVersion: currentVersion, newVersion };
  }

  // Acquire lock BEFORE any disk mutation. Throws TESTATLAS_LOCK_HELD if held.
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });

  // SIGINT handler — best-effort cleanup + lock release before exit(130).
  let sigintHandler = null;
  let backupCreated = false;
  let swapCompleted = false;
  try {
    sigintHandler = () => {
      // Synchronous best-effort: rm staging, release lock, exit. We can't
      // await async work in a SIGINT handler reliably, so we kick off the
      // cleanup without waiting and then exit.
      Promise.allSettled([rmSilent(stageDir), rmSilent(tmpTarball), releaseLock(target)]).then(
        () => {
          process.exit(130);
        },
      );
    };
    process.once('SIGINT', sigintHandler);

    // 1. Download tarball.
    log(`Downloading testatlas v${newVersion}…`);
    await tarballDownload(newVersion, tmpTarball);

    // 2. Verify checksum (no-op when expectedSha absent — Plan 07-04 plumbs in).
    await tarballVerify(tmpTarball, opts.expectedSha);

    // 3. Extract.
    await mkdir(stageDir, { recursive: true });
    await tarballExtract(tmpTarball, stageDir);

    // 4. Run migrations BEFORE swap. If this throws, we bail out without
    //    touching .testatlas/ — staging dir is rm'd in the catch below.
    const migrationsDir = path.join(stageDir, 'migrations');
    let migrationResult = { migrationsApplied: [], schemaVersion: null };
    try {
      migrationResult = await applyMigrations({
        target,
        fromVersion: currentVersion,
        toVersion: newVersion,
        migrationsDir,
      });
    } catch (err) {
      // Cleanup staging + tarball; rethrow.
      await rmSilent(stageDir);
      await rmSilent(tmpTarball);
      throw err;
    }

    // 5. Atomic swap.
    //    5a. Move current .testatlas/ aside.
    const currentSuite = path.join(target, '.testatlas');
    await doRename(currentSuite, backupDir);
    backupCreated = true;
    //    5b. Move staging into place.
    try {
      await doRename(stageDir, currentSuite);
      swapCompleted = true;
    } catch (err) {
      // ROLLBACK: reverse the backup-rename to restore original .testatlas/.
      try {
        await doRename(backupDir, currentSuite);
      } catch (revErr) {
        // Catastrophic: original is gone AND we couldn't restore. Annotate
        // and rethrow the original error with context.
        const compound = new Error(
          `Update failed AND rollback failed: original .testatlas/ may be at ${backupDir}. ` +
            `Original error: ${err.message}. Rollback error: ${revErr.message}`,
        );
        compound.code = 'TESTATLAS_UPDATE_ROLLBACK_FAILED';
        compound.originalError = err;
        compound.rollbackError = revErr;
        throw compound;
      }
      // Cleanup the now-orphaned staging dir + tarball.
      await rmSilent(stageDir);
      await rmSilent(tmpTarball);
      throw err;
    }

    // 6. Cleanup tarball (staging dir is gone — it became .testatlas/).
    await rmSilent(tmpTarball);

    // 7. Prune old backups (keep last 3).
    const pruneResult = await pruneBackups(target, 3);

    log(
      `Updated ${currentVersion} → ${newVersion}. ` +
        `Backup: ${path.basename(backupDir)} ` +
        `(pruned ${pruneResult.removed.length} older backup${pruneResult.removed.length === 1 ? '' : 's'}).`,
    );

    return {
      status: 'updated',
      previousVersion: currentVersion,
      newVersion,
      backupDir,
      migrationsApplied: migrationResult.migrationsApplied.length,
    };
  } catch (err) {
    // Final-cleanup hooks for the failure path, depending on how far we got.
    // (Backup-rollback already happened above if it was needed.)
    if (!backupCreated || !swapCompleted) {
      await rmSilent(stageDir);
      await rmSilent(tmpTarball);
    }
    throw err;
  } finally {
    if (sigintHandler) process.removeListener('SIGINT', sigintHandler);
    await releaseLock(target);
  }
}
