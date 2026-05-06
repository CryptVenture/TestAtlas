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

import { rename as fsRename, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { info, success, warning } from './colors.js';
import { loadConfig } from './load-config.js';
import { acquireLock, releaseLock } from './lockfile.js';
import { detectInstallDrift, writeManifest } from './manifest.js';
import { applyMigrations } from './migrate.js';
import { evaluatePin, shouldWarn } from './pinning.js';
import {
  fetchExpectedSha,
  fetchSigstoreBundle,
  downloadTarball as tarballDownload,
  extractTarball as tarballExtract,
  verifyChecksum as tarballVerify,
  verifyCosignAttestation,
} from './tarball.js';
import { checkForUpdate } from './update-check.js';

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

const DEFAULT_LOGGER = (msg) => info(msg);

/**
 * @typedef {Object} RunUpdateOptions
 * @property {string}  target                Absolute path of the install target.
 * @property {string}  currentVersion        Currently-installed suite version.
 * @property {string}  [latestVersion]       Target version (Plan 07-04 wires update-check).
 * @property {boolean} [forceReinstall]      Re-extract even if up-to-date.
 * @property {boolean} [dryRun]              Print plan; don't write.
 * @property {boolean} [noUpdateCheck]       Reserved for Plan 07-04 (TTL cache).
 * @property {string}  [expectedSha]         Optional SHA-256 hex; null/undefined skips with warning.
 *                                           Plan 12-01: superseded for the npx
 *                                           CLI path by `verifyChecksum: true`,
 *                                           which fetches the .sha256 sidecar
 *                                           from GitHub Releases. Programmatic
 *                                           callers can still pass expectedSha
 *                                           directly.
 * @property {boolean} [verifySignature]     Plan 12-01: when true, fetch the
 *                                           cosign sigstore bundle and run
 *                                           `cosign verify-blob-attestation`
 *                                           against the downloaded tarball.
 *                                           Halts with TESTATLAS_COSIGN_*
 *                                           sentinels on failure. Default off
 *                                           (opt-in per CONTEXT.md).
 * @property {boolean} [verifyChecksum]      Plan 12-01: when true, fetch the
 *                                           .sha256 sidecar from the GitHub
 *                                           Release and verify the downloaded
 *                                           tarball's SHA-256 matches. Halts
 *                                           with TESTATLAS_CHECKSUM_MISMATCH
 *                                           on mismatch. Default off (opt-in).
 * @property {(msg: string) => void} [logger]
 */

/**
 * @typedef {Object} RunUpdateResult
 * @property {'updated'|'up-to-date'|'dry-run'|'pinned-skip'|'install-missing'|'drift-detected'} status
 * @property {string} [previousVersion]
 * @property {string} [newVersion]
 * @property {string} [backupDir]            Path of the kept backup dir (post-swap).
 * @property {number} [migrationsApplied]
 * @property {object} [pin]                  Pin evaluation result, if any.
 * @property {Array<{path: string, expectedHash: string}>} [drifted]
 *   When status='drift-detected': files whose on-disk hash diverged from
 *   .install-manifest.json. POSIX-relative paths from the install target.
 */

/**
 * Best-effort config load. Returns an empty object when config files don't
 * exist or fail validation — runUpdate must not refuse to run on a
 * degraded config (the user is *trying to update* the suite that owns the
 * config schema; refusing here is a chicken-and-egg). Caller passes through
 * config-driven options as overrideable defaults.
 *
 * @param {string} target
 * @returns {Promise<object>}
 */
async function loadConfigSilent(target) {
  try {
    return await loadConfig({ cwd: target });
  } catch {
    return {};
  }
}

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
 * ISSUE-014 note: invoked only by `runUpdate` (which is itself a destructive,
 * user-initiated operation that the caller has already opted into). The
 * outer flow's intent is the gate; this internal cleanup helper inherits.
 * Documented capability tag: assertCapability(_, 'destructive-fs').
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
/**
 * Quick 260506-jsg Bug C — regenerate `<target>/.testatlas/.install-manifest.json`
 * after an atomic swap. Reads the backup manifest for adapters/mode and
 * (path → source, type) mapping; walks the new .testatlas/ tree; writes a
 * fresh manifest with the new suiteVersion.
 *
 * The npm tarball doesn't ship the manifest — it's created by `runInit`
 * post-copy. Without regen, every update wipes the manifest and drift
 * detection silently disables itself.
 *
 * Non-fatal failure mode: caller wraps this in try/catch and warns.
 *
 * @param {string} target          Install target.
 * @param {string} backupDir       Path of the just-created backup dir
 *                                  (contains the OLD manifest).
 * @param {string} newVersion      The new suite version.
 */
async function regenerateInstallManifest(target, backupDir, newVersion) {
  // 1. Read backup manifest for adapters / mode / (path → source, type) map.
  const backupManifestPath = path.join(backupDir, '.install-manifest.json');
  let oldAdapters = ['generic'];
  let oldMode = null;
  let oldSchemaVersion = 1;
  /** @type {Map<string, {source: string, type: string}>} */
  const oldMap = new Map();
  try {
    const oldRaw = await readFile(backupManifestPath, 'utf8');
    const oldManifest = JSON.parse(oldRaw);
    if (Array.isArray(oldManifest.adapters) && oldManifest.adapters.length > 0) {
      oldAdapters = oldManifest.adapters;
    }
    if (typeof oldManifest.mode === 'string') {
      oldMode = oldManifest.mode;
    }
    if (typeof oldManifest.schemaVersion === 'number') {
      oldSchemaVersion = oldManifest.schemaVersion;
    }
    for (const f of oldManifest.files ?? []) {
      if (typeof f.path === 'string') {
        oldMap.set(f.path, {
          source: typeof f.source === 'string' ? f.source : f.path.replace(/^\.testatlas\//, ''),
          type: f.type === 'adapter' || f.type === 'command' ? f.type : 'suite',
        });
      }
    }
  } catch {
    // No backup manifest (legacy install / first-time-write) — proceed with defaults.
  }

  // 2. Walk new .testatlas/ tree (using Node 20+ recursive readdir).
  const suiteDir = path.join(target, '.testatlas');
  const dirents = await readdir(suiteDir, { recursive: true, withFileTypes: true });
  const entries = [];
  for (const d of dirents) {
    if (!d.isFile()) continue;
    const absPath = path.join(d.parentPath ?? d.path ?? suiteDir, d.name);
    const relFromTarget = path.relative(target, absPath).split(path.sep).join('/');
    // Skip the manifest we're about to write
    if (relFromTarget === '.testatlas/.install-manifest.json') continue;
    // Look up source/type from old manifest; fall back to suite default.
    const old = oldMap.get(relFromTarget);
    const suiteRel = relFromTarget.replace(/^\.testatlas\//, '');
    entries.push({
      absPath,
      source: old?.source ?? suiteRel,
      type: old?.type ?? 'suite',
    });
  }

  // 3. Write the new manifest. cwd: target so loadAllSchemas can resolve
  // .testatlas/schemas/ for AJV validation.
  await writeManifest(
    target,
    {
      suiteVersion: newVersion,
      schemaVersion: oldSchemaVersion,
      adapters: oldAdapters,
      files: entries,
      ...(oldMode ? { mode: oldMode } : {}),
    },
    { cwd: target },
  );
}

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
  const latestVersion = opts.latestVersion;
  const log = opts.logger ?? DEFAULT_LOGGER;
  const forceReinstall = Boolean(opts.forceReinstall);
  const dryRun = Boolean(opts.dryRun);

  if (!opts.currentVersion) {
    throw new TypeError('runUpdate: `currentVersion` is required');
  }

  // Quick 260506-jsf Bug A + Quick 260506-jsg Bug B-followup —
  //   - `cliVersion` is the running CLI's pkg.version (what the caller passed).
  //     Used for cache invalidation in checkForUpdate (the cache should
  //     bypass when the CLI is newer than its claimed latest).
  //   - `currentVersion` is the version of what's INSTALLED at <target>,
  //     sourced from manifest.suiteVersion when present. Used for the
  //     up-to-date verdict + result.previousVersion + log messages.
  // Without separating these, `checkForUpdate` was being called with the
  // manifest version (which can be older than the cached latest), so its
  // cache-self-invalidation logic never fired in the common case where
  // the user has an older install + a stale TTL cache.
  //
  // We also opportunistically read `mode: 'global'` here so the lockfile-
  // target resolution below doesn't need to re-read the file.
  const cliVersion = opts.currentVersion;
  let currentVersion = cliVersion;
  let manifestModeGlobal = null;
  try {
    const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    if (typeof manifest.suiteVersion === 'string' && manifest.suiteVersion.length > 0) {
      currentVersion = manifest.suiteVersion;
    }
    manifestModeGlobal = manifest.mode === 'global';
  } catch {
    // No manifest, unreadable JSON, or missing suiteVersion → keep caller's value.
    // (Drift detection further down surfaces install-missing for kind:'missing'.)
  }

  // Plan 07-04: read config (best-effort) for disableUpdateCheck, pinning,
  // ttlHours. If `latestVersion` was not explicitly passed, consult
  // checkForUpdate (TTL cache + GH Releases) when not disabled.
  const config = await loadConfigSilent(target);
  const disableUpdateCheck = Boolean(opts.noUpdateCheck) || Boolean(config.disableUpdateCheck);
  const ttlHours = typeof config.updateCheckTtlHours === 'number' ? config.updateCheckTtlHours : 24;
  const pinnedVersion = config.pinnedVersion ?? null;
  const pinnedSince = config.pinnedSince ?? null;
  const thresholdDays =
    typeof config.pinAlertThresholdDays === 'number' ? config.pinAlertThresholdDays : 90;

  let resolvedLatest = latestVersion;
  let pin = null;

  if (!resolvedLatest && !disableUpdateCheck) {
    const checkResult = await checkForUpdate({
      target,
      // Pass cliVersion (NOT manifest-derived currentVersion) so the cache
      // invalidation logic compares correctly: when CLI > cached.latestVersion
      // the cache is provably stale and a fresh fetch must run.
      currentVersion: cliVersion,
      ttlHours,
      disabled: false,
    });
    if (checkResult.latestVersion) {
      resolvedLatest = checkResult.latestVersion;
    }
  }

  // Pin evaluation + stale-pin warning (UPDATE-04).
  if (pinnedVersion && resolvedLatest) {
    pin = evaluatePin({
      latestVersion: resolvedLatest,
      pinnedVersion,
      pinnedSince,
      thresholdDays,
    });
    if (shouldWarn(pin)) {
      warning(pin.message, process.stderr);
    }
    if (!forceReinstall && pin && pin.satisfied !== true) {
      // Pinned out of range (suppressed or stale): skip the update.
      const msg = `Pinned to ${pinnedVersion}; latest ${resolvedLatest} is out of range — skipping update.`;
      if (opts.logger) log(msg);
      else warning(msg);
      return { status: 'pinned-skip', previousVersion: currentVersion, pin };
    }
  }

  // Quick 260506-jsc — content-drift / missing-install detection.
  //
  // The legacy short-circuit below ("Already up to date") only consulted
  // package.json version. That said "up to date" against (a) targets with no
  // .testatlas/ at all and (b) targets whose .testatlas/ had drifted from
  // the install-manifest. Both are user-actionable conditions that should
  // surface a distinct status BEFORE the version-equal verdict.
  //
  // Skipped under --force-reinstall (the user is asking for a re-extract
  // regardless) and when an actual version bump is available (the normal
  // update flow will overwrite drift anyway).
  if (!forceReinstall && !shouldUpdate(currentVersion, resolvedLatest)) {
    const drift = await detectInstallDrift(target);
    if (drift.kind === 'missing') {
      const msg =
        `No .testatlas/ install detected at ${target}. ` +
        `Run \`npx @webventures/testatlas init\` (or \`testatlas init\`) to install the suite.`;
      if (opts.logger) log(msg);
      else warning(msg);
      return { status: 'install-missing', previousVersion: currentVersion, pin };
    }
    if (drift.kind === 'drift') {
      const head = `Content drift detected vs install-manifest (${drift.drifted.length} file${drift.drifted.length === 1 ? '' : 's'}):`;
      if (opts.logger) log(head);
      else warning(head);
      for (const d of drift.drifted) {
        const line = `  - ${d.path}`;
        if (opts.logger) log(line);
        else warning(line);
      }
      const tip =
        'Run with --force-reinstall to re-extract the suite ' +
        '(preserves _testatlas/ workspace).';
      if (opts.logger) log(tip);
      else warning(tip);
      return {
        status: 'drift-detected',
        previousVersion: currentVersion,
        pin,
        drifted: drift.drifted,
      };
    }
    // 'no-manifest' (legacy install / hand-rolled) and 'in-sync' fall
    // through to the existing short-circuit below.
  }

  // Up-to-date short-circuit (skipped under --force-reinstall).
  if (!forceReinstall && !shouldUpdate(currentVersion, resolvedLatest)) {
    const msg = `Already up to date (current ${currentVersion}, latest ${resolvedLatest ?? 'unknown'}).`;
    if (opts.logger) log(msg);
    else success(msg);
    return { status: 'up-to-date', previousVersion: currentVersion, pin };
  }

  const newVersion = resolvedLatest ?? currentVersion;
  const ts = nowSlug();
  const stageDir = path.join(target, `${STAGING_PREFIX}${ts}`);
  const backupDir = path.join(target, `${BACKUP_PREFIX}${ts}`);
  const tmpTarball = path.join(target, `${STAGING_PREFIX}${ts}.tgz`);

  if (dryRun) {
    if (opts.logger) {
      log(`[dry-run] Would update ${target} from ${currentVersion} → ${newVersion}`);
      log(`[dry-run] Stage dir: ${stageDir}`);
      log(`[dry-run] Backup dir: ${backupDir}`);
    } else {
      info(`[dry-run] Would update ${target} from ${currentVersion} → ${newVersion}`);
      info(`[dry-run] Stage dir: ${stageDir}`);
      info(`[dry-run] Backup dir: ${backupDir}`);
    }
    return { status: 'dry-run', previousVersion: currentVersion, newVersion };
  }

  // Plan 12-02: global-mode detection. Mirrors `install-core.js:786-791` —
  // when the install manifest declares `mode: "global"` (or, as a fallback
  // heuristic, `target` is the user's home directory), the lockfile must
  // resolve to `~/.testatlas/.lock` instead of `<target>/_testatlas/.lock`.
  // Global installs intentionally never seed `_testatlas/`, so writing the
  // lock under `<target>` would ENOENT on every `runUpdate` invocation.
  // Quick 260506-jsf: reuse the manifest read from the version-source step
  // above (manifestModeGlobal) so we don't re-stat/re-parse the file. When
  // the manifest was unreadable, manifestModeGlobal is null and we fall
  // back to the homedir heuristic.
  const isGlobal = manifestModeGlobal ?? target === os.homedir();
  const lockTarget = isGlobal ? os.homedir() : target;

  // Acquire lock BEFORE any disk mutation. Throws TESTATLAS_LOCK_HELD if held.
  // `lockTarget` is the resolved global-or-project root; `acquireLock`
  // mkdirs the parent (`_testatlas/`) under it before writing.
  await acquireLock(lockTarget, { pid: process.pid, holdReason: 'update' });

  // SIGINT handler — best-effort cleanup + lock release before exit(130).
  let sigintHandler = null;
  let backupCreated = false;
  let swapCompleted = false;
  try {
    sigintHandler = () => {
      // Synchronous best-effort: rm staging, release lock, exit. We can't
      // await async work in a SIGINT handler reliably, so we kick off the
      // cleanup without waiting and then exit.
      // Plan 12-02: release the lock at the SAME `lockTarget` it was
      // acquired at (global → ~/.testatlas, otherwise <target>/_testatlas).
      Promise.allSettled([rmSilent(stageDir), rmSilent(tmpTarball), releaseLock(lockTarget)]).then(
        () => {
          process.exit(130);
        },
      );
    };
    process.once('SIGINT', sigintHandler);

    // 1. Download tarball.
    log(`Downloading testatlas v${newVersion}…`);
    await tarballDownload(newVersion, tmpTarball);

    // 2. Verify integrity. Plan 12-01 (ISSUE-016 + ISSUE-017): the npx
    //    `--verify-signature` and `--verify-checksum` flags now do real work
    //    on this path (previously silent no-ops). Both are opt-in to preserve
    //    default behavior. When neither flag is set AND no programmatic
    //    `expectedSha` was supplied, the legacy stderr-warning path applies
    //    (downstream tooling that doesn't ship a sidecar).
    if (opts.verifySignature) {
      const bundlePath = `${tmpTarball}.sigstore.json`;
      await fetchSigstoreBundle(newVersion, bundlePath);
      await verifyCosignAttestation(tmpTarball, bundlePath);
    }
    if (opts.verifyChecksum) {
      const expectedSha = await fetchExpectedSha(newVersion);
      await tarballVerify(tmpTarball, expectedSha);
    } else if (opts.expectedSha != null) {
      await tarballVerify(tmpTarball, opts.expectedSha);
    } else {
      // Legacy path (no flag, no programmatic SHA). Existing stderr-warning.
      await tarballVerify(tmpTarball, opts.expectedSha);
    }

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

    // Quick 260506-jsg Bug C — regenerate .install-manifest.json.
    //
    // The atomic swap replaced .testatlas/ wholesale with the staged tarball
    // content. The npm tarball doesn't ship the install-manifest (it's
    // created by runInit at install time), so post-swap the new .testatlas/
    // has no manifest. Without this regen, drift detection (Quick 260506-jsc
    // Fix #3) silently dies on the next `update` because detectInstallDrift
    // sees `kind: 'no-manifest'` and falls through to the legacy path.
    //
    // Strategy: read the backup manifest for adapters/mode/(path→source,type)
    // mapping, walk the new tree, hash each file, write a fresh manifest.
    // Non-fatal — a manifest write failure logs a warning but doesn't fail
    // the update (the swap itself already succeeded).
    try {
      await regenerateInstallManifest(target, backupDir, newVersion);
    } catch (err) {
      warning(`Could not regenerate install-manifest after update: ${err.message}`);
    }

    // 7. Prune old backups (keep last 3).
    const pruneResult = await pruneBackups(target, 3);

    const summary =
      `Updated ${currentVersion} → ${newVersion}. ` +
      `Backup: ${path.basename(backupDir)} ` +
      `(pruned ${pruneResult.removed.length} older backup${pruneResult.removed.length === 1 ? '' : 's'}).`;
    if (opts.logger) log(summary);
    else success(summary);

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
    // Plan 12-02: release at the SAME lockTarget the acquire used.
    await releaseLock(lockTarget);
  }
}
