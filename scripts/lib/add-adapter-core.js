// scripts/lib/add-adapter-core.js
//
// Quick 260504-q4s Task 2. `testatlas add-adapter <names...>` kernel.
//
// Goal: incrementally add one or more adapters to an existing TestAtlas
// install — does NOT overwrite the suite tree or mutate previously-installed
// adapter files. Re-runs are idempotent.
//
// Flow:
//   1. Resolve target (default cwd; if --global and no target, use $HOME).
//   2. Read+validate the existing manifest at <target>/.testatlas/.install-manifest.json.
//      Missing manifest → throw the actionable "run testatlas init first" error.
//   3. Validate every requested adapter against ALL_ADAPTERS (reuses
//      install-core.js's validateAdapterNames so the error shape matches).
//   4. Compute delta = requested − manifest.adapters. Empty → no-op return.
//   5. dryRun → emit a per-adapter file plan, return { status: 'dry-run' }.
//   6. Otherwise: load capabilities, call install-core's exported
//      copyAdapterCommandFiles for the delta only. In --global mode, adapters
//      missing globalOutputPattern are skipped (consistent with install-core).
//   7. Build a fresh full manifest payload (suite entries unchanged + existing
//      command entries + newly-written command entries) and atomic-write via
//      writeManifest.
//   8. Return { status: 'added', added, adapters, filesWritten, skipped, ... }.

import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { info, success, warning } from './colors.js';
import {
  copyAdapterCommandFiles,
  loadAdapterCapabilities,
  validateAdapterNames,
} from './install-core.js';
import { loadAndValidateManifest, writeManifest } from './manifest.js';
import { verifyCachedPackage } from './verify-package.js';

/**
 * Test seam — set via `addAdapterCore._testHooks.<name> = ...` in tests.
 * Plan 12-01 (ISSUE-016): forwarded into `verifyCachedPackage` so unit
 * tests can inject probeCosign + resolveCachedTarball without mutating
 * process state. Mirrors install-core.js's _testHooks contract.
 *
 * @type {{
 *   probeCosign?: () => Promise<boolean>,
 *   resolveCachedTarball?: () => Promise<string|null>,
 * }}
 */
export const _testHooks = {};

/**
 * @typedef {Object} RunAddAdapterOptions
 * @property {string} [target]      Target install dir. Defaults to cwd
 *                                  (or $HOME when global=true).
 * @property {string} suiteRoot     Absolute path of the suite package root.
 * @property {string[]} adapters    Adapter names to add (must be in ALL_ADAPTERS).
 * @property {boolean} [dryRun]     Print plan without writes.
 * @property {boolean} [force]      Reserved — currently unused; reserved for
 *                                  re-copying already-installed adapters.
 * @property {boolean} [verifySignature]  Reserved.
 * @property {boolean} [global]     Operate on the global ($HOME) install.
 * @property {(msg: string) => void} [logger]
 */

/**
 * @typedef {Object} RunAddAdapterResult
 * @property {'added'|'no-op'|'dry-run'} status
 * @property {string[]} added       Adapters actually written this run.
 * @property {string[]} adapters    Full adapter list after this run.
 * @property {string[]} [skipped]   Adapters skipped (e.g., --global without
 *                                  globalOutputPattern).
 * @property {number} [filesWritten] Count of command files written.
 * @property {boolean} [global]
 */

/**
 * Add one or more adapters to an existing install.
 *
 * @param {RunAddAdapterOptions} opts
 * @returns {Promise<RunAddAdapterResult>}
 */
export async function runAddAdapter(opts) {
  const isGlobal = Boolean(opts.global);
  const target = path.resolve(opts.target ?? (isGlobal ? os.homedir() : process.cwd()));
  const suiteRoot = path.resolve(opts.suiteRoot);
  const log = opts.logger ?? ((msg) => info(msg));

  if (!Array.isArray(opts.adapters) || opts.adapters.length === 0) {
    throw new Error('add-adapter: at least one adapter name is required.');
  }

  // Plan 12-01 (ISSUE-016 + ISSUE-017): npx-path integrity verification.
  // Runs FIRST — before adapter-name validation or manifest load — so a
  // verification failure halts cleanly without touching disk. Mirrors
  // runInit's wiring. Default-opt-in: no-op when neither flag is set.
  if (opts.verifySignature || opts.verifyChecksum) {
    const suiteVersion = JSON.parse(
      await readFile(path.join(suiteRoot, 'package.json'), 'utf8'),
    ).version;
    await verifyCachedPackage({
      verifySignature: Boolean(opts.verifySignature),
      verifyChecksum: Boolean(opts.verifyChecksum),
      version: suiteVersion,
      hooks: _testHooks,
    });
  }

  // Validate first so the user sees the canonical error before we touch disk.
  validateAdapterNames(opts.adapters);

  // Load manifest. ENOENT → actionable error.
  let manifest;
  try {
    manifest = await loadAndValidateManifest(target, { cwd: suiteRoot });
  } catch (err) {
    if (err.code === 'TESTATLAS_MANIFEST_MISSING') {
      throw new Error(
        `add-adapter: requires an existing TestAtlas install at ${target}. ` +
          "Run 'testatlas init' first (or pass --target/--global to point at the right install).",
      );
    }
    throw err;
  }

  // Compute delta — preserve caller order, dedup against manifest.adapters.
  const existing = new Set(manifest.adapters);
  const requested = [...new Set(opts.adapters)];
  const delta = requested.filter((n) => !existing.has(n));

  if (delta.length === 0 && !opts.force) {
    log(`All requested adapters already installed: ${requested.join(', ')}. Nothing to do.`);
    return {
      status: 'no-op',
      added: [],
      adapters: [...manifest.adapters],
      ...(isGlobal ? { global: true } : {}),
    };
  }

  if (opts.dryRun) {
    log(`[dry-run] Would add adapter(s): ${delta.join(', ')}`);
    log(`[dry-run] Target: ${target}${isGlobal ? ' (global)' : ''}`);
    return {
      status: 'dry-run',
      added: delta,
      adapters: [...manifest.adapters, ...delta],
      ...(isGlobal ? { global: true } : {}),
    };
  }

  // Real write path.
  const caps = await loadAdapterCapabilities(suiteRoot);
  const {
    entries: cmdEntries,
    skipped,
    notes,
  } = await copyAdapterCommandFiles(suiteRoot, target, delta, caps, { global: isGlobal });

  if (isGlobal && skipped.length > 0) {
    warning(
      `Skipping ${skipped.length} adapter(s) in --global mode (no globalOutputPattern declared): ${skipped.join(', ')}`,
    );
  }

  const actuallyAdded = delta.filter((n) => !skipped.includes(n));

  // Reconstruct ManifestFileInput[] from the existing manifest's `files` plus
  // the new command entries. The manifest stores `path` (target-relative
  // POSIX) and `source` (suite-relative POSIX); `buildManifest` re-hashes
  // each file so we don't need to carry hashes from the existing manifest.
  /** @type {{absPath: string, source: string, type: 'suite'|'adapter'|'command'}[]} */
  const allFiles = [];
  for (const f of manifest.files) {
    allFiles.push({
      absPath: path.join(target, ...f.path.split('/')),
      source: f.source,
      type: f.type,
    });
  }
  for (const e of cmdEntries) {
    allFiles.push({ absPath: e.absPath, source: e.source, type: 'command' });
  }

  // If everything was skipped (e.g., only no-globalOutputPattern adapters),
  // do NOT mutate the manifest. Surface a no-op-ish result so the caller can
  // see what happened.
  if (actuallyAdded.length === 0) {
    log(`No adapters added (all requested were skipped: ${skipped.join(', ')}).`);
    return {
      status: 'no-op',
      added: [],
      adapters: [...manifest.adapters],
      skipped,
      ...(isGlobal ? { global: true } : {}),
    };
  }

  await writeManifest(
    target,
    {
      suiteVersion: manifest.suiteVersion,
      schemaVersion: manifest.schemaVersion,
      adapters: [...manifest.adapters, ...actuallyAdded],
      files: allFiles,
      ...(manifest.mode ? { mode: manifest.mode } : {}),
    },
    { cwd: suiteRoot },
  );

  if (opts.logger) {
    log(`Added ${actuallyAdded.length} adapter(s): ${actuallyAdded.join(', ')}`);
    for (const n of notes) log(n);
  } else {
    success(`Added ${actuallyAdded.length} adapter(s): ${actuallyAdded.join(', ')}`);
    for (const n of notes) info(n);
  }

  return {
    status: 'added',
    added: actuallyAdded,
    adapters: [...manifest.adapters, ...actuallyAdded],
    filesWritten: cmdEntries.length,
    ...(skipped.length ? { skipped } : {}),
    ...(isGlobal ? { global: true } : {}),
  };
}
