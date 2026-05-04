// scripts/lib/install-core.js
//
// Plan 07-01 Task 2. Shared install kernel — consumed by both
// `bin/testatlas.js init` (npx flow) and top-level `install.js` (git-clone
// flow).
//
// Flow (RESEARCH §Pattern 3):
//   1. Resolve absolute target/suite paths; refuse target === suiteRoot.
//   2. Pre-flight walk source tree; refuse if any symlink (RESEARCH §Pitfall 2).
//   3. If `<target>/.testatlas/` exists:
//        - If !force: load manifest, recompute hashes, print no-change diff,
//          return { status: 'already-installed' } without writes.
//        - If  force: rm `<target>/.testatlas/` (workspace-guard verifies we
//          never touch `_testatlas/`).
//   4. Detect adapters (or all 7 with --all-adapters from adapter-capabilities.json).
//   5. fs.cp .testatlas/ selectively:
//        - skip .testatlas/test-workspace/      (suite-self-test fixture)
//        - skip .testatlas/adapters/<unmatched> (only matched + generic copy in)
//   6. For each matched adapter, copy the adapter's stage-files (command files)
//      to <target>/<outputDir>/ per outputPattern from adapter-capabilities.json.
//      Phase 6 has not yet authored stage-files for all 7 adapters; the kernel
//      tolerates a missing stage-files dir (the adapter ships only its README +
//      capabilities until Phase 8 fleshes it out — non-blocking for INSTALL-01).
//   7. Build manifest entries (suite/adapter/command), write via manifest.js.
//   8. Optionally call init-workspace.js if `_testatlas/` absent.
//   9. Return { status, filesWritten, adapters }.

import { cp, lstat, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectAdapters } from './adapter-detect.js';
import { INSTALL_MANIFEST_PATH } from './constants.js';
import { hashContent } from './content-hash.js';
import { buildManifest, loadAndValidateManifest, writeManifest } from './manifest.js';
import { assertNotUpdate } from './workspace-guard.js';

/**
 * @typedef {Object} RunInitOptions
 * @property {string} target            Absolute path of the install target repo
 *                                      (or os.homedir() when --global).
 * @property {string} suiteRoot         Absolute path of the suite package root
 *                                      (the dir containing `.testatlas/`).
 * @property {boolean} [allAdapters]    Install every adapter regardless of detection.
 * @property {boolean} [force]          Remove existing `.testatlas/` and reinstall.
 * @property {boolean} [noUpdateCheck]  Skip GitHub Releases version probe.
 * @property {boolean} [dryRun]         Print plan, do not write.
 * @property {boolean} [initWorkspace]  Auto-run init-workspace if _testatlas/ absent (default true).
 * @property {boolean} [global]         Install adapter command files into
 *                                      user-home (~/.claude/, ~/.cursor/, etc.)
 *                                      instead of project-local. The suite tree
 *                                      is installed into ~/.testatlas/. The
 *                                      `_testatlas/` workspace is NEVER created
 *                                      in global mode (workspace state is
 *                                      always project-local).
 * @property {(msg: string) => void} [logger]
 */

/**
 * @typedef {Object} RunInitResult
 * @property {'installed'|'already-installed'|'forced'|'dry-run'} status
 * @property {number} filesWritten
 * @property {string[]} adapters
 * @property {boolean} [global]
 * @property {string[]} [globalNotes]   Per-adapter post-install hints surfaced
 *                                      to the caller (rendered to stdout in
 *                                      CLI use; useful for downstream tooling).
 */

const ALL_ADAPTERS = Object.freeze([
  'claude-code',
  'cursor',
  'aider',
  'kilocode',
  'opencode',
  'mcp',
  'generic',
  'codex',
  'gemini-cli',
]);

const SUITE_DIR = '.testatlas';
const TEST_WORKSPACE_DIRNAME = 'test-workspace';
const ADAPTERS_DIRNAME = 'adapters';

/**
 * Walk a directory tree recursively, yielding absolute paths of every file.
 * Pre-flight: refuse symlinks (RESEARCH §Pitfall 2).
 *
 * @param {string} root
 * @param {(absPath: string) => boolean} [filter] returns true to include
 * @returns {AsyncIterable<string>}
 */
async function* walkFiles(root, filter = () => true) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      const e = new Error(
        `install-core: refusing to copy symlink at ${abs} (RESEARCH §Pitfall 2 — adapter trees must be plain files).`,
      );
      e.code = 'TESTATLAS_INSTALL_SYMLINK';
      throw e;
    }
    if (entry.isDirectory()) {
      yield* walkFiles(abs, filter);
    } else if (entry.isFile()) {
      if (filter(abs)) yield abs;
    }
  }
}

/**
 * Pre-flight: refuse if any path in the source tree is a symlink. Walk via
 * lstat (NOT stat) so we don't dereference. We do this even though `cp({...,
 * verbatimSymlinks: false})` would also handle it — fail-loud beats silent
 * partial copies.
 *
 * @param {string} root
 */
async function assertNoSymlinks(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    const st = await lstat(abs);
    if (st.isSymbolicLink()) {
      const e = new Error(
        `install-core: refusing to copy symlink at ${abs} (RESEARCH §Pitfall 2).`,
      );
      e.code = 'TESTATLAS_INSTALL_SYMLINK';
      throw e;
    }
    if (st.isDirectory()) {
      await assertNoSymlinks(abs);
    }
  }
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Read adapter-capabilities.json to enumerate adapter names and outputPatterns.
 * @param {string} suiteRoot
 */
async function loadAdapterCapabilities(suiteRoot) {
  const capPath = path.join(suiteRoot, SUITE_DIR, 'adapters', 'adapter-capabilities.json');
  const text = await readFile(capPath, 'utf8');
  const parsed = JSON.parse(text);
  return parsed;
}

/**
 * Idempotency check: if a manifest already exists and matches all on-disk
 * hashes, return a "already-installed" result. Otherwise return null
 * (caller proceeds with install or warns about drift).
 *
 * @param {string} target
 * @param {string} suiteRoot
 * @returns {Promise<RunInitResult | null>}
 */
async function checkAlreadyInstalled(target, suiteRoot) {
  const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
  if (!(await pathExists(manifestPath))) return null;

  let manifest;
  try {
    manifest = await loadAndValidateManifest(target, { cwd: suiteRoot });
  } catch {
    // Manifest exists but is corrupt — fall through; caller will decide.
    return null;
  }
  // Recompute hashes for every tracked file. If any drift, return null
  // (caller may print a warning).
  for (const entry of manifest.files) {
    const abs = path.join(target, ...entry.path.split('/'));
    if (!(await pathExists(abs))) return null;
    const buf = await readFile(abs);
    const fresh = hashContent(buf.toString('utf8'));
    if (fresh !== entry.hash) return null; // drift
  }
  return {
    status: 'already-installed',
    filesWritten: 0,
    adapters: manifest.adapters,
  };
}

/**
 * Copy `<suiteRoot>/.testatlas/` → `<target>/.testatlas/`, recursively, with
 * filter for test-workspace and unmatched adapter dirs. Returns the list of
 * absolute target paths that were written, with classification (suite vs
 * adapter).
 *
 * @param {string} suiteRoot
 * @param {string} target
 * @param {Set<string>} matchedAdapters
 */
async function copySuiteTree(suiteRoot, target, matchedAdapters) {
  const srcSuite = path.join(suiteRoot, SUITE_DIR);
  const dstSuite = path.join(target, SUITE_DIR);

  /** @type {{absPath: string, source: string, type: 'suite'|'adapter'}[]} */
  const entries = [];

  // Pre-build a list of suite-relative paths to copy.
  for await (const absSrc of walkFiles(srcSuite)) {
    const rel = path.relative(srcSuite, absSrc); // e.g. "adapters/claude-code/README.md"
    const parts = rel.split(path.sep);
    // Skip suite-self-test fixture
    if (parts[0] === TEST_WORKSPACE_DIRNAME) continue;
    // For adapters/<name>/* paths, only include if name is matched.
    let type = 'suite';
    if (parts[0] === ADAPTERS_DIRNAME && parts.length > 1) {
      const adapterName = parts[1];
      // adapter-capabilities.json + README.md at adapters/ root: keep as suite
      if (
        parts.length === 2 &&
        (adapterName === 'README.md' || adapterName === 'adapter-capabilities.json')
      ) {
        type = 'suite';
      } else if (matchedAdapters.has(adapterName)) {
        type = 'adapter';
      } else {
        continue; // unmatched adapter — skip
      }
    }
    const dst = path.join(dstSuite, rel);
    await mkdir(path.dirname(dst), { recursive: true });
    await cp(absSrc, dst, { force: true });
    const srcRelToSuiteRoot = path.relative(suiteRoot, absSrc);
    entries.push({
      absPath: dst,
      source: srcRelToSuiteRoot,
      type,
    });
  }
  return entries;
}

/**
 * For each matched adapter, copy its "stage" command files into the target's
 * configured outputDir (per adapter-capabilities.json outputPattern's leading
 * directory portion). Stage files live under
 * `<suiteRoot>/.testatlas/adapters/<name>/stage/` per the Phase 6 contract.
 * If the stage dir is absent (Phase 6 hasn't published it yet for some
 * adapters), this is a no-op for that adapter (non-fatal).
 *
 * Returns absolute target paths of the command files written.
 *
 * @param {string} suiteRoot
 * @param {string} target
 * @param {string[]} adapters
 * @param {object} caps adapter-capabilities.json parsed
 */
async function copyAdapterCommandFiles(suiteRoot, target, adapters, caps, opts = {}) {
  /** @type {{absPath: string, source: string, type: 'command'}[]} */
  const entries = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const notes = [];
  const byName = Object.fromEntries((caps.adapters ?? []).map((a) => [a.name, a]));

  for (const name of adapters) {
    const cap = byName[name];
    if (!cap) continue; // unknown adapter (shouldn't happen given enum)

    if (opts.global && !cap.globalOutputPattern) {
      // Adapter declares no global pattern — skip cleanly so the manifest
      // doesn't track a partial install.
      skipped.push(name);
      continue;
    }

    // Phase 6 generators write rendered files at
    //   .testatlas/adapters/<name>/<dirname(outputPattern)>/...
    // (e.g. claude-code → .testatlas/adapters/claude-code/.claude/commands/).
    // Concatenated-conventions and mcp-server adapters write a single file at
    //   .testatlas/adapters/<name>/<basename(outputPattern)>.
    // Either way, the source root is `<adapter-dir>` minus README.md and the
    // "source" subdir mirrors the local outputPattern exactly. To install,
    // we walk that source subtree and replace its prefix with the active
    // pattern's prefix (local OR global).
    const adapterDir = path.join(suiteRoot, SUITE_DIR, 'adapters', name);
    const localPattern = cap.outputPattern;
    const activePattern = opts.global ? cap.globalOutputPattern : localPattern;
    const localPrefix = path.dirname(localPattern); // e.g. ".claude/commands"
    const activePrefix = path.dirname(activePattern); // e.g. ".claude/commands" or ".config/..."

    // Identify the source subtree. For per-command-file adapters this is the
    // localPrefix dir (a directory). For concatenated-conventions/mcp-server
    // adapters the pattern is a bare filename (e.g. "CONVENTIONS.md") and the
    // source is the adapter-dir itself; we copy only the matching basename
    // file (avoiding README.md and adapter-specific config side-files).
    const isFilePattern = localPrefix === '.' || localPrefix === '';
    if (isFilePattern) {
      const srcFile = path.join(adapterDir, path.basename(localPattern));
      if (!(await pathExists(srcFile))) continue;
      const dstFile = path.join(target, activePattern);
      await mkdir(path.dirname(dstFile), { recursive: true });
      await cp(srcFile, dstFile, { force: true });
      entries.push({
        absPath: dstFile,
        source: path.relative(suiteRoot, srcFile),
        type: 'command',
      });
    } else {
      const srcDir = path.join(adapterDir, localPrefix);
      if (!(await pathExists(srcDir))) continue;
      const dstBase = path.join(target, activePrefix);
      await mkdir(dstBase, { recursive: true });
      for await (const absSrc of walkFiles(srcDir)) {
        const rel = path.relative(srcDir, absSrc);
        const dst = path.join(dstBase, rel);
        await mkdir(path.dirname(dst), { recursive: true });
        await cp(absSrc, dst, { force: true });
        entries.push({
          absPath: dst,
          source: path.relative(suiteRoot, absSrc),
          type: 'command',
        });
      }
    }

    if (opts.global && cap.globalNotes) {
      notes.push(`[${name}] ${cap.globalNotes}`);
    }
  }
  return { entries, skipped, notes };
}

/**
 * Optionally run init-workspace.js if _testatlas/ is absent. Failure here is
 * a warning, not an error (per locked decision: workspace init is a separate
 * concern from suite install).
 *
 * @param {string} target
 * @param {(msg: string) => void} log
 */
async function maybeInitWorkspace(target, log) {
  const wsDir = path.join(target, '_testatlas');
  if (await pathExists(wsDir)) return;
  try {
    const mod = await import('../init-workspace.js');
    // init-workspace.js's `initWorkspace({ workspaceDir, cwd, force })` takes
    // `cwd` as the install target (not `target`). Forward accordingly.
    if (typeof mod.initWorkspace === 'function') {
      await mod.initWorkspace({ cwd: target });
      log('Initialized _testatlas/ workspace.');
    } else if (typeof mod.default === 'function') {
      await mod.default({ cwd: target });
      log('Initialized _testatlas/ workspace.');
    } else {
      log('init-workspace.js exposes no callable export — skipping workspace init.');
    }
  } catch (err) {
    log(`Workspace init skipped: ${err?.message ?? err}`);
  }
}

/**
 * Read the suite's package.json `version` field for the manifest.
 *
 * @param {string} suiteRoot
 */
async function readSuiteVersion(suiteRoot) {
  const pkg = JSON.parse(await readFile(path.join(suiteRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Run the install kernel. Idempotent on re-run; honors --force; refuses
 * self-overwrite.
 *
 * @param {RunInitOptions} opts
 * @returns {Promise<RunInitResult>}
 */
export async function runInit(opts) {
  // In global mode the install target defaults to os.homedir() unless the
  // caller passed an explicit `target`. Project-local mode is unchanged —
  // target is the cwd (or whatever the caller resolved). This keeps the
  // function signature stable; bin/testatlas.js + install.js pass `target`
  // explicitly when --global is set.
  const isGlobal = Boolean(opts.global);
  const target = path.resolve(opts.target ?? (isGlobal ? os.homedir() : process.cwd()));
  const suiteRoot = path.resolve(opts.suiteRoot);
  const log = opts.logger ?? ((msg) => process.stdout.write(`${msg}\n`));

  // Two-tree invariant — install context never touches workspace state directly.
  // We only mutate <target>/.testatlas/, never <target>/_testatlas/.
  // workspace-guard's API tags context strings; init-workspace.js (called
  // optionally below) carries its own 'init' tag. Here we use 'init' because
  // the install path is conceptually the first-run init of the suite tree.
  assertNotUpdate('init');

  if (target === suiteRoot) {
    throw new Error('install-core: install target equals suite root (would self-overwrite)');
  }

  const srcSuiteDir = path.join(suiteRoot, SUITE_DIR);
  if (!(await pathExists(srcSuiteDir))) {
    throw new Error(`install-core: source suite tree not found at ${srcSuiteDir}`);
  }

  // Pre-flight: no symlinks anywhere in the source suite tree.
  await assertNoSymlinks(srcSuiteDir);

  const targetSuiteDir = path.join(target, SUITE_DIR);
  const haveExisting = await pathExists(targetSuiteDir);

  // Idempotency check — reads existing manifest, recomputes hashes.
  if (haveExisting && !opts.force) {
    const already = await checkAlreadyInstalled(target, suiteRoot);
    if (already) {
      log('TestAtlas already installed (no changes).');
      return already;
    }
    // No clean idempotency match — if a manifest exists at all, refuse without --force.
    const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
    if (await pathExists(manifestPath)) {
      throw new Error(
        `install-core: existing .testatlas/ at ${target} differs from its manifest. ` +
          'Pass --force to reinstall (will remove .testatlas/; _testatlas/ untouched).',
      );
    }
    // Existing .testatlas/ but NO manifest — also refuse without --force,
    // user could lose hand-written content.
    throw new Error(
      `install-core: ${targetSuiteDir} exists but no manifest found. ` +
        'Pass --force to overwrite (will remove .testatlas/; _testatlas/ untouched).',
    );
  }

  // Adapter detection (or all-adapters override).
  const detected = opts.allAdapters ? [...ALL_ADAPTERS] : await detectAdapters(target);
  const adapterSet = new Set(detected);

  // Dry-run short-circuit.
  if (opts.dryRun) {
    log(`[dry-run] Would install TestAtlas at ${target}${isGlobal ? ' (global)' : ''}`);
    log(`[dry-run] Adapters: ${detected.join(', ')}`);
    log(`[dry-run] Force: ${Boolean(opts.force)}`);
    return {
      status: 'dry-run',
      filesWritten: 0,
      adapters: detected,
      ...(isGlobal ? { global: true } : {}),
    };
  }

  // Force-clean existing .testatlas/ if requested.
  if (opts.force && haveExisting) {
    await rm(targetSuiteDir, { recursive: true, force: true });
  }

  // Copy the suite tree (filtered). In both local and global modes the suite
  // tree lands at <target>/.testatlas/ so the bootstrap.md preamble can be
  // resolved consistently.
  const suiteEntries = await copySuiteTree(suiteRoot, target, adapterSet);

  // Copy per-adapter command files. In global mode the adapter renderer
  // honors `globalOutputPattern` and skips adapters that don't declare one.
  const caps = await loadAdapterCapabilities(suiteRoot);
  const {
    entries: cmdEntries,
    skipped: skippedAdapters,
    notes: globalNotes,
  } = await copyAdapterCommandFiles(suiteRoot, target, detected, caps, { global: isGlobal });

  if (isGlobal && skippedAdapters.length > 0) {
    log(
      `Note: skipping ${skippedAdapters.length} adapter(s) in --global mode (no globalOutputPattern declared): ${skippedAdapters.join(', ')}`,
    );
  }

  // Build the file manifest. Filter out the soon-to-be-overwritten manifest
  // path itself if it slipped into suiteEntries (it shouldn't, since the
  // source suite tree never contains an install-manifest).
  const allEntries = [...suiteEntries, ...cmdEntries].filter((e) => {
    const rel = path.relative(target, e.absPath).split(path.sep).join('/');
    return rel !== INSTALL_MANIFEST_PATH;
  });

  const suiteVersion = await readSuiteVersion(suiteRoot);

  // Manifest tracks the actually-installed adapter set so uninstall reverses
  // exactly. In global mode that's `detected − skippedAdapters`.
  const installedAdapters = detected.filter((n) => !skippedAdapters.includes(n));

  await writeManifest(
    target,
    {
      suiteVersion,
      schemaVersion: 1,
      adapters: installedAdapters,
      files: allEntries,
      ...(isGlobal ? { mode: 'global' } : {}),
    },
    { cwd: suiteRoot },
  );

  // Optional workspace init — project-local only. In global mode `_testatlas/`
  // is meaningless (workspace state is per-project), so we never seed one
  // under the user's home dir.
  if (!isGlobal && opts.initWorkspace !== false) {
    await maybeInitWorkspace(target, log);
  }

  const result = {
    status: opts.force && haveExisting ? 'forced' : 'installed',
    filesWritten: allEntries.length,
    adapters: installedAdapters,
    ...(isGlobal ? { global: true } : {}),
    ...(globalNotes.length ? { globalNotes } : {}),
  };
  log(
    `TestAtlas ${result.status}${isGlobal ? ' (global)' : ''}: ${result.filesWritten} files across ${result.adapters.length} adapter(s) (${result.adapters.join(', ')}).`,
  );
  for (const n of globalNotes) log(n);
  return result;
}

/**
 * Build a manifest object without writing it (helper used by tests).
 *
 * @param {string} target
 * @param {string} suiteRoot
 * @param {Array<{absPath: string, source: string, type: 'suite'|'adapter'|'command'}>} files
 * @param {string[]} adapters
 */
export async function buildManifestForFiles(target, suiteRoot, files, adapters) {
  const suiteVersion = await readSuiteVersion(suiteRoot);
  return await buildManifest(
    target,
    { suiteVersion, schemaVersion: 1, adapters, files },
    { cwd: suiteRoot },
  );
}
