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
import { info, step, success, warning } from './colors.js';
import { INSTALL_MANIFEST_PATH } from './constants.js';
import { hashContent, verifyHashCompat } from './content-hash.js';
import { buildManifest, loadAndValidateManifest, writeManifest } from './manifest.js';
import { assertCapability } from './safety.js';
import { verifyCachedPackage } from './verify-package.js';
import { assertNotUpdate } from './workspace-guard.js';

/**
 * Test seam — set via `installCore._testHooks.<name> = ...` in tests.
 * Plan 12-01 (ISSUE-016): forwarded into `verifyCachedPackage` so unit
 * tests can inject probeCosign + resolveCachedTarball without mutating
 * process state.
 *
 * @type {{
 *   probeCosign?: () => Promise<boolean>,
 *   resolveCachedTarball?: () => Promise<string|null>,
 * }}
 */
export const _testHooks = {};

/**
 * @typedef {Object} RunInitOptions
 * @property {string} target            Absolute path of the install target repo
 *                                      (or os.homedir() when --global).
 * @property {string} suiteRoot         Absolute path of the suite package root
 *                                      (the dir containing `.testatlas/`).
 * @property {string[]} [adapters]      Explicit subset of adapter names. When
 *                                      provided AND non-empty, bypasses
 *                                      auto-detect and `allAdapters`. Each
 *                                      name must be in ALL_ADAPTERS or runInit
 *                                      throws "Unknown adapter '<name>'…".
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

export const ALL_ADAPTERS = Object.freeze([
  'claude-code',
  'cursor',
  'aider',
  'kilocode',
  'opencode',
  'mcp',
  'generic',
  'codex',
  'gemini-cli',
  'cline',
  'windsurf',
  'kiro',
  'continue-dev',
  'github-copilot',
  'sourcegraph-amp',
  'roo-code',
  'zed',
  'amazon-q',
]);

const SUITE_DIR = '.testatlas';
const TEST_WORKSPACE_DIRNAME = 'test-workspace';
const ADAPTERS_DIRNAME = 'adapters';

// Validator runtime + library closure copied into <target>/.testatlas/scripts/
// during `runInit` (Quick 260504-r3q deliverable B). Paths are relative to
// suiteRoot. The destination mirrors the source path under .testatlas/,
// preserving the validator's relative imports (e.g. ./lib/foo.js,
// ../validate/bar.js) without source rewrite.
//
// The check-*.js modules under scripts/lib/validate/ are discovered at copy
// time (via readdir) so partial-wave rollouts and future check additions are
// handled automatically.
//
// Each copied file is manifest-tracked with `type: 'suite'` so uninstall
// reverses cleanly.
export const SUITE_SCRIPTS_TO_COPY = Object.freeze([
  'scripts/validate-workspace.js',
  'scripts/lib/all-workspaces.js',
  'scripts/lib/atomic-write.js',
  'scripts/lib/load-config.js',
  'scripts/lib/schema-loader.js',
  'scripts/lib/workspace-guard.js',
  'scripts/lib/ajv-instance.js',
  'scripts/lib/content-hash.js',
  'scripts/lib/determinism.js',
  'scripts/lib/markers.js',
  'scripts/lib/validate/autoheal.js',
  'scripts/lib/validate/reporter.js',
  'scripts/lib/validate/walk-workspace.js',
]);

// NPM packages required by the copied validator scripts at runtime.
// These are vendored into <target>/.testatlas/node_modules/ so the
// scripts work in target repos that do not have these deps installed.
const RUNTIME_DEPS = Object.freeze([
  'ajv',
  'ajv-formats',
  'fast-deep-equal',
  'fast-uri',
  'json-schema-traverse',
  'require-from-string',
]);

/**
 * Validate a caller-supplied list of adapter names against ALL_ADAPTERS.
 * Throws with a single-line, actionable error containing every valid name on
 * the first unknown entry.
 *
 * Exported so `add-adapter-core.js` (Quick 260504-q4s Task 2) can reuse the
 * exact same error shape.
 *
 * @param {string[]} names
 */
export function validateAdapterNames(names) {
  const unknown = names.filter((n) => !ALL_ADAPTERS.includes(n));
  if (unknown.length > 0) {
    throw new Error(`Unknown adapter '${unknown[0]}'. Known adapters: ${ALL_ADAPTERS.join(', ')}.`);
  }
}

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
export async function loadAdapterCapabilities(suiteRoot) {
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
    const s = await stat(abs);
    if (s.isDirectory()) continue; // directories (vendored node_modules) skipped
    const buf = await readFile(abs);
    // Phase 11 (ISSUE-013): hashContent widened from 16 to 64 hex chars.
    // verifyHashCompat handles both legacy 16-char manifests (pre-Phase-11)
    // and modern 64-char manifests, returning true iff the fresh content's
    // SHA-256 matches the stored hash under the appropriate length-detection
    // path. Returns false on drift OR malformed hashes.
    if (!verifyHashCompat(buf.toString('utf8'), entry.hash)) return null; // drift
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
  // assertCapability('destructive-fs') is enforced once at runInit() entry;
  // this helper inherits that gate for its cp({force:true}) calls below.
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
    // assertCapability('destructive-fs') gated at runInit() entry.
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
export async function copyAdapterCommandFiles(suiteRoot, target, adapters, caps, opts = {}) {
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
      // assertCapability('destructive-fs') gated at runInit() entry.
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
        // assertCapability('destructive-fs') gated at runInit() entry.
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
 * Copy the validator runtime + library closure into <target>/.testatlas/scripts/
 * (Quick 260504-r3q deliverable B). Each source file lands at
 * `<target>/.testatlas/<src-rel>`, preserving the directory structure so the
 * validator's relative imports resolve.
 *
 * Feature-check: if a source file is missing (e.g. dev/stripped install),
 * skip silently so the install never breaks just because the validator
 * runtime hasn't been authored on a given branch. The check-*.js modules
 * under scripts/lib/validate/ are globbed at copy time so future check
 * additions are picked up without editing this list.
 *
 * Returns suite-typed manifest entries.
 *
 * @param {string} suiteRoot
 * @param {string} target
 * @returns {Promise<Array<{absPath: string, source: string, type: 'suite'}>>}
 */
async function copyValidatorScripts(suiteRoot, target) {
  /** @type {Array<{absPath: string, source: string, type: 'suite'}>} */
  const entries = [];
  const dstSuite = path.join(target, SUITE_DIR);

  // Static closure. assertCapability('destructive-fs') gated at runInit() entry.
  for (const srcRel of SUITE_SCRIPTS_TO_COPY) {
    const absSrc = path.join(suiteRoot, srcRel);
    if (!(await pathExists(absSrc))) continue; // feature-check guard
    const dst = path.join(dstSuite, srcRel);
    await mkdir(path.dirname(dst), { recursive: true });
    await cp(absSrc, dst, { force: true });
    entries.push({ absPath: dst, source: srcRel, type: 'suite' });
  }

  // Dynamic check-*.js discovery — the validator dynamically imports these
  // by id and tolerates ERR_MODULE_NOT_FOUND, so we glob whatever is on disk
  // at copy time.
  const checksDir = path.join(suiteRoot, 'scripts', 'lib', 'validate');
  try {
    const checkFiles = await readdir(checksDir);
    for (const f of checkFiles) {
      if (!f.startsWith('check-') || !f.endsWith('.js')) continue;
      const srcRel = ['scripts', 'lib', 'validate', f].join('/');
      const absSrc = path.join(suiteRoot, srcRel);
      const dst = path.join(dstSuite, srcRel);
      await mkdir(path.dirname(dst), { recursive: true });
      // assertCapability('destructive-fs') gated at runInit() entry.
      await cp(absSrc, dst, { force: true });
      entries.push({ absPath: dst, source: srcRel, type: 'suite' });
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // No validate/ dir at all — silent skip.
  }

  return entries;
}

/**
 * Copy the runtime npm dependencies required by the validator scripts into
 * <target>/.testatlas/node_modules/ so the scripts resolve imports correctly
 * in target repos that do not have ajv/ajv-formats installed.
 *
 * Strategy: resolve the primary packages (ajv, ajv-formats) to their real
 * on-disk locations, then scan the *parent* node_modules directories for
 * sibling packages that are also in RUNTIME_DEPS. This catches transitive
 * dependencies (fast-deep-equal, fast-uri, etc.) that pnpm isolates in the
 * same .pnpm/<pkg>/node_modules/ directory but does not expose as top-level
 * symlinks.
 *
 * @param {string} _suiteRoot  unused — resolution is relative to this module
 * @param {string} target
 * @returns {Promise<Array<{absPath: string, source: string, type: 'suite'}>>}
 */
async function copyNodeModules(_suiteRoot, target) {
  /** @type {Array<{absPath: string, source: string, type: 'suite'}>} */
  const entries = [];
  const dstModules = path.join(target, SUITE_DIR, 'node_modules');
  const seen = new Set();

  // Collect candidate source directories: for each primary package, add its
  // parent node_modules dir to the scan list.
  const candidateDirs = new Set();
  for (const primary of ['ajv', 'ajv-formats']) {
    let resolvedUrl;
    try {
      resolvedUrl = import.meta.resolve(`${primary}/package.json`);
    } catch {
      continue;
    }
    const realPkgPath = new URL(resolvedUrl).pathname.replace(/\/package\.json$/, '');
    candidateDirs.add(path.dirname(realPkgPath));
  }

  for (const pkg of RUNTIME_DEPS) {
    if (seen.has(pkg)) continue;
    seen.add(pkg);

    // Find the first candidate dir that contains this package.
    let src = null;
    for (const dir of candidateDirs) {
      const candidate = path.join(dir, pkg);
      if (await pathExists(candidate)) {
        src = candidate;
        break;
      }
    }
    if (!src) continue;

    const dst = path.join(dstModules, pkg);
    await mkdir(path.dirname(dst), { recursive: true });
    // dereference: true follows symlinks (required for pnpm's isolated store).
    // assertCapability('destructive-fs') gated at runInit() entry.
    await cp(src, dst, { recursive: true, dereference: true, force: true });
    entries.push({ absPath: dst, source: `node_modules/${pkg}`, type: 'suite' });
  }

  return entries;
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
  // Default logger routes through colors.info() so all status output picks up
  // the cyan `ℹ` prefix (and ASCII fallback under NO_UNICODE/NO_COLOR).
  // Callers that capture output (tests, programmatic embeds) supply their own.
  const log = opts.logger ?? ((msg) => info(msg));

  // Plan 12-01 (ISSUE-016 + ISSUE-017): npx-path integrity verification.
  // Runs BEFORE any destructive disk writes so a verification failure
  // halts cleanly without touching `<target>/.testatlas/`. The chain
  // mirrors install.sh:79-104 and runUpdate's post-download chain.
  // Default-opt-in: when neither flag is set, verifyCachedPackage is a
  // no-op (zero subprocess cost on the default install path).
  //
  // Halt sentinels surfaced by verifyCachedPackage:
  //   - TESTATLAS_COSIGN_NOT_FOUND          (probeCosign returned false)
  //   - TESTATLAS_INIT_TARBALL_UNAVAILABLE  (resolveCachedTarball returned null)
  //   - TESTATLAS_COSIGN_VERIFY_FAILED      (cosign rejected the bundle)
  //   - TESTATLAS_CHECKSUM_MISMATCH         (sha sidecar disagreed)
  //   - TESTATLAS_SHA_SIDECAR_UNAVAILABLE   (.sha256 fetch 4xx/5xx)
  if (opts.verifySignature || opts.verifyChecksum) {
    const suiteVersion = await readSuiteVersion(suiteRoot);
    await verifyCachedPackage({
      verifySignature: Boolean(opts.verifySignature),
      verifyChecksum: Boolean(opts.verifyChecksum),
      version: suiteVersion,
      hooks: _testHooks,
    });
  }

  // ISSUE-014 defense-in-depth: capability gate for the destructive primitives
  // used during install (cp({force:true}) and rm({recursive:true})). Install
  // is user-initiated by definition, so when no explicit config is threaded
  // through `opts.config` we treat the invocation as permissive (mirrors the
  // existing instruction-side gate in bootstrap.md §3 §4 — instruction-side
  // expects the user/agent to have already acknowledged consent before
  // triggering the install). When a caller DOES pass `opts.config` (e.g. a
  // host-managed flow), the assertion is enforced.
  const cfg = opts.config ?? { safeMode: false, allowDestructiveActions: true };
  const cap = assertCapability(cfg, 'destructive-fs');
  if (!cap.allowed) {
    throw new Error(
      `install-core: ${cap.reason}. Set safeMode:false and allowDestructiveActions:true in testatlas.config.json to proceed.`,
    );
  }

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

  // Step 1/5 — resolution + adapter detection. Emitted before the
  // idempotency check so re-runs still print the leading marker.
  if (!opts.logger) step(1, 6, 'Resolving target & adapters');

  // Idempotency check — reads existing manifest, recomputes hashes.
  if (haveExisting && !opts.force) {
    const already = await checkAlreadyInstalled(target, suiteRoot);
    if (already) {
      success('TestAtlas already installed (no changes).');
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

  // Adapter selection precedence:
  //   1. opts.adapters (explicit non-empty subset; bypasses auto-detect).
  //   2. opts.allAdapters (every adapter from ALL_ADAPTERS).
  //   3. detectAdapters(target) (signal-based heuristic).
  let detected;
  if (Array.isArray(opts.adapters) && opts.adapters.length > 0) {
    validateAdapterNames(opts.adapters);
    // Dedup while preserving caller-supplied order so manifest order is
    // user-deterministic.
    detected = [...new Set(opts.adapters)];
  } else if (opts.allAdapters) {
    detected = [...ALL_ADAPTERS];
  } else {
    detected = await detectAdapters(target);
  }
  const adapterSet = new Set(detected);

  // Dry-run short-circuit.
  if (opts.dryRun) {
    info(`[dry-run] Would install TestAtlas at ${target}${isGlobal ? ' (global)' : ''}`);
    info(`[dry-run] Adapters: ${detected.join(', ')}`);
    info(
      `[dry-run] Validator runtime: copying ${SUITE_SCRIPTS_TO_COPY.length} core files + check-*.js modules into .testatlas/scripts/`,
    );
    info(
      `[dry-run] Runtime deps: copying ${RUNTIME_DEPS.length} packages into .testatlas/node_modules/`,
    );
    info(`[dry-run] Force: ${Boolean(opts.force)}`);
    return {
      status: 'dry-run',
      filesWritten: 0,
      adapters: detected,
      ...(isGlobal ? { global: true } : {}),
    };
  }

  // Force-clean existing .testatlas/ if requested.
  // assertCapability('destructive-fs') gated at runInit() entry above.
  if (opts.force && haveExisting) {
    await rm(targetSuiteDir, { recursive: true, force: true });
  }

  // Step 2/6 — copy the suite tree (filtered). In both local and global modes
  // the suite tree lands at <target>/.testatlas/ so the bootstrap.md preamble
  // can be resolved consistently.
  if (!opts.logger) step(2, 6, 'Copying suite tree');
  const suiteEntries = await copySuiteTree(suiteRoot, target, adapterSet);

  // Step 3/6 — copy the validator runtime + lib closure into
  // <target>/.testatlas/scripts/ (Quick 260504-r3q deliverable B). Manifest-
  // tracked under type:'suite' so uninstall reverses cleanly.
  if (!opts.logger) step(3, 6, 'Copying validator runtime');
  const validatorEntries = await copyValidatorScripts(suiteRoot, target);

  // Step 4/6 — copy runtime npm dependencies (ajv, ajv-formats, etc.) into
  // <target>/.testatlas/node_modules/ so validator scripts resolve imports
  // in target repos that don't have these deps installed.
  if (!opts.logger) step(4, 6, 'Copying runtime dependencies');
  const nodeModulesEntries = await copyNodeModules(suiteRoot, target);

  // Step 5/6 — copy per-adapter command files. In global mode the adapter
  // renderer honors `globalOutputPattern` and skips adapters that don't
  // declare one.
  if (!opts.logger) step(5, 6, 'Installing adapters');
  const caps = await loadAdapterCapabilities(suiteRoot);
  const {
    entries: cmdEntries,
    skipped: skippedAdapters,
    notes: globalNotes,
  } = await copyAdapterCommandFiles(suiteRoot, target, detected, caps, { global: isGlobal });

  if (isGlobal && skippedAdapters.length > 0) {
    warning(
      `Skipping ${skippedAdapters.length} adapter(s) in --global mode (no globalOutputPattern declared): ${skippedAdapters.join(', ')}`,
    );
  }

  // Build the file manifest. Filter out the soon-to-be-overwritten manifest
  // path itself if it slipped into suiteEntries (it shouldn't, since the
  // source suite tree never contains an install-manifest).
  const allEntries = [
    ...suiteEntries,
    ...validatorEntries,
    ...nodeModulesEntries,
    ...cmdEntries,
  ].filter((e) => {
    const rel = path.relative(target, e.absPath).split(path.sep).join('/');
    return rel !== INSTALL_MANIFEST_PATH;
  });

  const suiteVersion = await readSuiteVersion(suiteRoot);

  // Step 6/6 — write manifest. Manifest tracks the actually-installed adapter
  // set so uninstall reverses exactly. In global mode that's
  // `detected − skippedAdapters`.
  if (!opts.logger) step(6, 6, 'Writing manifest');
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
  // Final outcome line as a green ✓ success when running through the default
  // logger. Programmatic callers passing their own `logger` get the legacy
  // raw string (no color, no symbol) for back-compat.
  const summary = `TestAtlas ${result.status}${isGlobal ? ' (global)' : ''}: ${result.filesWritten} files across ${result.adapters.length} adapter(s) (${result.adapters.join(', ')}).`;
  if (opts.logger) {
    log(summary);
    for (const n of globalNotes) log(n);
  } else {
    success(summary);
    for (const n of globalNotes) info(n);
    // Next-steps tip — surfaces the workspace-bootstrap entry-point so the
    // user knows what to do next without hunting through the README.
    info('Next: run /atlas:init inside your AI coding agent to bootstrap the workspace.');
    if (validatorEntries.length > 0) {
      info(
        'Validator: run `npx @webventures/testatlas validate` (or `node .testatlas/scripts/validate-workspace.js` with the package locally installed).',
      );
    }
    info('Docs: https://github.com/CryptVenture/TestAtlas');
  }
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
