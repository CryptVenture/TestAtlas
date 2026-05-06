#!/usr/bin/env node
// scripts/uninstall.js
//
// Plan 07-02 Task 2 (INSTALL-04). Manifest-driven uninstall.
//
// Behavior matrix (RESEARCH §Pattern 4):
//
//   Flags                | Manifest valid          | Manifest missing/invalid
//   ---------------------|-------------------------|-------------------------
//   (default)            | rm tracked; preserve _t | refuse
//   --purge              | rm tracked + _testatlas | refuse
//   --force-untracked    | rm tracked normally     | nuke .testatlas/ blindly
//   --force-untracked    |                         |   (with warning)
//        + --purge       | rm tracked + _testatlas | nuke + remove _testatlas/
//   --dry-run            | print plan, no writes   | print plan, no writes
//
// Manifest paths are POSIX (forward-slash) by contract; we convert at read
// time via `path.join(target, ...entry.path.split('/'))` (RESEARCH §Pattern 5).
//
// `_testatlas/` is the workspace tree; under `--purge` we explicitly nuke it.
// This is the single uninstall callsite where workspace-guard's two-tree
// invariant is bypassed (uninstall is by definition the destructive removal
// path; the user opted in via --purge).

import { readdir, readFile, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';

import { renderBanner } from './lib/banner.js';
import { info, success, warning } from './lib/colors.js';
import { INSTALL_MANIFEST_PATH } from './lib/constants.js';
import { loadConfig } from './lib/load-config.js';
import { loadAndValidateManifest } from './lib/manifest.js';
import { assertCapability } from './lib/safety.js';

/**
 * @typedef {Object} RunUninstallOptions
 * @property {string} [target]          Absolute path of the target repo (default: cwd).
 * @property {boolean} [purge]          Also remove _testatlas/ workspace state.
 * @property {boolean} [forceUntracked] Allow uninstall when manifest is missing/invalid.
 * @property {boolean} [dryRun]         Print planned removals without writing.
 * @property {(msg: string) => void} [logger]
 */

/**
 * @typedef {Object} RunUninstallResult
 * @property {'uninstalled'|'dry-run'} status
 * @property {number} filesRemoved
 * @property {boolean} [purged]
 * @property {'force-untracked'} [fallback]
 */

const DEFAULT_LOGGER = (msg) => {
  info(msg);
};

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

/**
 * Best-effort empty-parent-directory cleanup. Walks every directory mentioned
 * in `dirs` (deduped) sorted from deepest to shallowest, attempts non-recursive
 * `rmdir`. Failures (ENOTEMPTY, ENOENT) are silently ignored — this is purely
 * cosmetic.
 *
 * @param {Set<string>} dirs
 */
async function pruneEmptyDirs(dirs) {
  const sorted = [...dirs].sort((a, b) => b.length - a.length);
  for (const d of sorted) {
    try {
      const entries = await readdir(d);
      if (entries.length === 0) {
        await rmdir(d);
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Programmatic API for uninstalling the suite from a target.
 *
 * @param {RunUninstallOptions} opts
 * @returns {Promise<RunUninstallResult>}
 */
export async function runUninstall(opts = {}) {
  const target = path.resolve(opts.target ?? process.cwd());
  const log = opts.logger ?? DEFAULT_LOGGER;
  const dryRun = Boolean(opts.dryRun);
  const purge = Boolean(opts.purge);
  const forceUntracked = Boolean(opts.forceUntracked);

  // ISSUE-014 defense-in-depth: code-side capability gate. The
  // instruction-side gate in bootstrap.md §3 §4 is unchanged; this is
  // additive. Uninstall is user-initiated by definition (the user/agent has
  // to explicitly invoke `testatlas uninstall`), so when no explicit config
  // is loadable from `target` we treat the invocation as permissive — the
  // user already opted in by running the command. When a caller DOES pass
  // `opts.config` (host-managed flow) OR the target has a real config with
  // safeMode:true, the assertion is enforced and we hard-fail.
  let cfg = opts.config ?? null;
  if (!cfg) {
    try {
      cfg = await loadConfig({ cwd: target });
    } catch {
      // Config not loadable (e.g. mid-uninstall the .testatlas/ tree may
      // already be partially gone). Default permissive — uninstall must
      // remain runnable without a config file.
      cfg = { safeMode: false, allowDestructiveActions: true };
    }
  }
  const cap = assertCapability(cfg, 'destructive-fs');
  if (!cap.allowed) {
    throw new Error(
      `Refusing to uninstall: ${cap.reason}. Set safeMode:false and ` +
        'allowDestructiveActions:true in .testatlas/testatlas.config.json to proceed.',
    );
  }

  let manifest = null;
  try {
    manifest = await loadAndValidateManifest(target);
  } catch (err) {
    if (!forceUntracked) {
      const msg =
        `Manifest missing or invalid at ${path.join(target, INSTALL_MANIFEST_PATH)}. ` +
        'Refusing to uninstall — pass --force-untracked to remove .testatlas/ blindly. ' +
        `Original error: ${err.message}`;
      throw new Error(msg);
    }
    // forceUntracked: fall through to fallback path
    if (opts.logger) {
      log(
        `[testatlas:warn] manifest absent — fallback to .testatlas/ rm (${err.code ?? 'unknown'})`,
      );
    } else {
      warning(`Manifest absent — fallback to .testatlas/ rm (${err.code ?? 'unknown'})`);
    }
  }

  let filesRemoved = 0;
  const parentDirs = new Set();

  if (manifest) {
    // assertCapability('destructive-fs') above gates the entire fs.rm loop below.
    for (const entry of manifest.files) {
      const osPath = path.join(target, ...entry.path.split('/'));
      if (dryRun) {
        if (opts.logger) log(`[dry-run] rm ${osPath}`);
        else info(`[dry-run] rm ${osPath}`);
      } else {
        try {
          await rm(osPath, { force: true, recursive: true });
          filesRemoved++;
        } catch (err) {
          // Logged but non-fatal; uninstall is best-effort once started.
          if (opts.logger) log(`[testatlas:warn] failed to remove ${osPath}: ${err.message}`);
          else warning(`Failed to remove ${osPath}: ${err.message}`);
        }
      }
      parentDirs.add(path.dirname(osPath));
    }

    if (!dryRun) {
      // Also remove the manifest file itself (it's not in manifest.files).
      // Already gated above by assertCapability('destructive-fs').
      const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
      try {
        await rm(manifestPath, { force: true });
        parentDirs.add(path.dirname(manifestPath));
      } catch {
        // ignore
      }
      await pruneEmptyDirs(parentDirs);
    }
  } else {
    // forceUntracked + missing manifest: nuke .testatlas/ blindly.
    // Already gated above by assertCapability('destructive-fs').
    const ttDir = path.join(target, '.testatlas');
    if (dryRun) {
      if (opts.logger) log(`[dry-run] rm -r ${ttDir}`);
      else info(`[dry-run] rm -r ${ttDir}`);
    } else if (await exists(ttDir)) {
      await rm(ttDir, { recursive: true, force: true });
    }
  }

  let purged = false;
  if (purge) {
    // Already gated above by assertCapability('destructive-fs').
    const wsDir = path.join(target, '_testatlas');
    if (dryRun) {
      if (opts.logger) log(`[dry-run] rm -r ${wsDir}`);
      else info(`[dry-run] rm -r ${wsDir}`);
    } else if (await exists(wsDir)) {
      // NB: this is the ONE uninstall callsite that bypasses the two-tree
      // invariant. Documented in the file header comment.
      await rm(wsDir, { recursive: true, force: true });
      purged = true;
    } else {
      // _testatlas/ wasn't there; treat as already-purged for the result tag.
      purged = true;
    }
  }

  if (dryRun) {
    const dryMsg = 'Dry-run complete (no changes written).';
    if (opts.logger) log(dryMsg);
    else success(dryMsg);
    return { status: 'dry-run', filesRemoved };
  }

  const summary =
    `Uninstall complete: removed ${filesRemoved} files; ` +
    `${purge ? '_testatlas/ purged' : '_testatlas/ preserved'}.`;
  if (opts.logger) log(summary);
  else success(summary);

  /** @type {RunUninstallResult} */
  const result = { status: 'uninstalled', filesRemoved };
  if (purge) result.purged = purged;
  if (!manifest && forceUntracked) result.fallback = 'force-untracked';
  return result;
}

/**
 * CLI entry point. Imports against this module's URL to detect direct invocation.
 */
async function cliMain() {
  // Read the suite version for the banner. Direct invocation only — the
  // bin/testatlas.js path renders its own banner upstream.
  const PKG_PATH = path.join(import.meta.dirname, '..', 'package.json');
  const pkg = JSON.parse(await readFile(PKG_PATH, 'utf8'));

  const program = new Command();
  program
    .name('testatlas-uninstall')
    .description('Remove the TestAtlas suite from the current repo')
    .version(pkg.version)
    .addHelpText('beforeAll', () => renderBanner({ version: pkg.version }))
    .showHelpAfterError()
    .option('--target <dir>', 'Target repo (default: cwd)')
    .option('--purge', 'Also remove _testatlas/ workspace state (DESTRUCTIVE)')
    .option('--force-untracked', 'Allow uninstall when manifest is missing/corrupt')
    .option('--dry-run', 'Print planned removals; do not delete')
    .parse(process.argv);
  const opts = program.opts();
  // Brand polish before kernel logs (matches install.js + update.js).
  process.stdout.write(renderBanner({ version: pkg.version }));
  await runUninstall({
    target: opts.target,
    purge: Boolean(opts.purge),
    forceUntracked: Boolean(opts.forceUntracked),
    dryRun: Boolean(opts.dryRun),
  });
}

// Direct-invocation detection (Node 20+: `import.meta.url`-vs-argv check).
if (import.meta.url === `file://${process.argv[1]}`) {
  await cliMain();
}
