// scripts/lib/manifest.js
//
// Plan 07-01. Install manifest read/write/validate.
//
// The install manifest at `<target>/.testatlas/.install-manifest.json` tracks
// every file the install kernel writes, with content hash + source path + type.
// Uninstall reverses precisely off this manifest; update consults it for drift
// detection.
//
// Cross-platform path discipline (RESEARCH §Pattern 5):
//   - Manifest stores POSIX paths in `path` and `source` (forward-slashes
//     even when running on Windows). At write time we convert OS-native
//     separators via `.split(path.sep).join('/')`. At read time, callers
//     reverse via `path.join(target, ...entry.path.split('/'))`.
//   - AJV pattern `^[^/].*` enforces relative POSIX form on `path`.
//
// Validation: AJV singleton via `ajv-instance.js`; schema loaded by the
// existing `schema-loader.js` (which auto-discovers every `*.schema.json`).
// We look up the validator by `$id` (NEVER call `ajv.compile` after
// `ajv.addSchema` — that double-registers and throws per ajv-instance.js
// docstring).

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { formatErrors } from './ajv-instance.js';
import { atomicWrite } from './atomic-write.js';
import { INSTALL_MANIFEST_PATH, INSTALL_MANIFEST_SCHEMA_ID } from './constants.js';
import { hashContent, verifyHashCompat } from './content-hash.js';
import { loadAllSchemas } from './schema-loader.js';

// Suite tree dirname under <target>. Mirrors install-core.js / load-config.js
// (both keep their own copy intentionally — adding to constants.js would
// require touching both call sites for no reader benefit).
const SUITE_DIR = '.testatlas';

/**
 * @typedef {Object} ManifestFileInput
 * @property {string} absPath  Absolute path of the file to record.
 * @property {string} source   Suite-relative POSIX path of the source file.
 * @property {'suite'|'adapter'|'command'} type
 */

/**
 * @typedef {Object} ManifestPayload
 * @property {string} suiteVersion
 * @property {number} schemaVersion
 * @property {string[]} adapters
 * @property {ManifestFileInput[]} files
 */

/**
 * Convert any OS-native path separator to POSIX `/` form.
 * @param {string} p
 */
function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Hash the contents of a file on disk (CRLF-normalized; 16-hex SHA-256 prefix).
 * Reuses the canonical `content-hash.js` contract so manifest hashes match
 * marker-section hashes wherever they coincide.
 * @param {string} absPath
 * @returns {Promise<string>}
 */
async function fileHash(absPath) {
  const s = await stat(absPath);
  if (s.isDirectory()) {
    // Directories (e.g., vendored node_modules) get a deterministic placeholder
    // so the manifest schema (which requires a hash for every entry) stays valid.
    return hashContent(`dir:${absPath}`);
  }
  const buf = await readFile(absPath);
  return hashContent(buf.toString('utf8'));
}

/**
 * Look up the install-manifest validator from the AJV singleton, loading
 * schemas if needed. Throws clearly if the schema isn't registered.
 *
 * @param {string} cwd
 */
async function getValidator(cwd) {
  const ajv = await loadAllSchemas({ cwd });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  if (!validate) {
    throw new Error(
      `manifest: install-manifest schema not registered in AJV singleton (id=${INSTALL_MANIFEST_SCHEMA_ID})`,
    );
  }
  return validate;
}

/**
 * Build the manifest object (no IO), AJV-validate, and return it.
 *
 * @param {string} target
 * @param {ManifestPayload} payload
 * @param {{ cwd?: string, now?: () => Date }} [opts]
 * @returns {Promise<object>}
 */
export async function buildManifest(target, payload, opts = {}) {
  const cwd = opts.cwd ?? target;
  const now = opts.now ?? (() => new Date());

  const files = await Promise.all(
    payload.files.map(async ({ absPath, source, type }) => ({
      path: toPosix(path.relative(target, absPath)),
      source: toPosix(source),
      type,
      hash: await fileHash(absPath),
    })),
  );

  const manifest = {
    manifestVersion: '1',
    suiteVersion: payload.suiteVersion,
    schemaVersion: payload.schemaVersion,
    installedAt: now().toISOString(),
    target,
    adapters: payload.adapters,
    files,
    // Optional: passed through verbatim when set to 'global' so uninstall +
    // diagnostics can distinguish home-install from project-install.
    ...(payload.mode ? { mode: payload.mode } : {}),
  };

  const validate = await getValidator(cwd);
  if (!validate(manifest)) {
    const lines = formatErrors(validate.errors ?? [], 'install-manifest');
    throw new Error(`manifest: failed AJV validation:\n  ${lines.join('\n  ')}`);
  }
  return manifest;
}

/**
 * Build, validate, and atomically write the install manifest to
 * `<target>/.testatlas/.install-manifest.json`.
 *
 * @param {string} target
 * @param {ManifestPayload} payload
 * @param {{ cwd?: string, now?: () => Date }} [opts]
 */
export async function writeManifest(target, payload, opts = {}) {
  const manifest = await buildManifest(target, payload, opts);
  const dest = path.join(target, INSTALL_MANIFEST_PATH);
  await atomicWrite(dest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * Read the manifest from disk, parse, AJV-validate, and return it.
 * Throws a clear error containing AJV's `errorsText` if validation fails.
 *
 * @param {string} target
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function loadAndValidateManifest(target, opts = {}) {
  const cwd = opts.cwd ?? target;
  const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
  let raw;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`manifest: not found at ${manifestPath}`);
      e.code = 'TESTATLAS_MANIFEST_MISSING';
      throw e;
    }
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const e = new Error(`manifest: invalid JSON at ${manifestPath}: ${err.message}`);
    e.code = 'TESTATLAS_MANIFEST_INVALID_JSON';
    throw e;
  }
  const validate = await getValidator(cwd);
  if (!validate(parsed)) {
    const lines = formatErrors(validate.errors ?? [], 'install-manifest');
    const e = new Error(`manifest: failed AJV validation:\n  ${lines.join('\n  ')}`);
    e.code = 'TESTATLAS_MANIFEST_INVALID_SHAPE';
    throw e;
  }
  return parsed;
}

/**
 * @typedef {Object} DriftReport
 * @property {'missing'|'no-manifest'|'in-sync'|'drift'} kind
 * @property {Array<{path: string, expectedHash: string}>} [drifted]
 * @property {number} [files]   Count of tracked files (kind='in-sync' / 'drift')
 * @property {string} [reason]  Human-readable detail (e.g., parse failure cause)
 */

/**
 * Detect content drift between the on-disk `.testatlas/` tree and the
 * `.install-manifest.json` written at install time. Quick 260506-jsc.
 *
 * Cases:
 *   - `<target>/.testatlas/` missing entirely → `kind: 'missing'`. The user
 *     ran `update` against a directory with no install at all (common after
 *     an accidental rm or against a fresh tmp dir).
 *   - `.install-manifest.json` missing or invalid → `kind: 'no-manifest'`.
 *     Pre-Phase-7 installs or hand-rolled installs land here. Update should
 *     fall through to its normal version-equal short-circuit (we have no
 *     drift baseline to compare against).
 *   - One or more tracked files differ in hash from the manifest → `kind:
 *     'drift'` with `drifted: [{path, expectedHash}]`.
 *   - All tracked files match → `kind: 'in-sync'`.
 *
 * Directory entries in the manifest (vendored node_modules) are skipped —
 * they get a placeholder hash that's not meaningfully drift-checkable.
 * Mirrors `install-core.checkAlreadyInstalled` precedent.
 *
 * @param {string} target  Absolute path of the install target.
 * @param {{cwd?: string}} [opts]
 * @returns {Promise<DriftReport>}
 */
export async function detectInstallDrift(target, opts = {}) {
  const suiteDir = path.join(target, SUITE_DIR);
  // Step 1: .testatlas/ presence check.
  try {
    const s = await stat(suiteDir);
    if (!s.isDirectory()) {
      return { kind: 'missing', reason: `${suiteDir} exists but is not a directory` };
    }
  } catch {
    return { kind: 'missing' };
  }

  // Step 2: load manifest. If it's absent / corrupt, surface 'no-manifest'
  // (caller falls through; we don't have a hash baseline anyway).
  let manifest;
  try {
    manifest = await loadAndValidateManifest(target, opts);
  } catch (err) {
    return {
      kind: 'no-manifest',
      reason: err?.message ?? String(err),
    };
  }

  // Step 3: walk every tracked file; recompute hash; collect drift.
  const drifted = [];
  for (const entry of manifest.files ?? []) {
    const abs = path.join(target, ...String(entry.path ?? '').split('/'));
    let st;
    try {
      st = await stat(abs);
    } catch {
      // File tracked by manifest but absent on disk = drift.
      drifted.push({ path: entry.path, expectedHash: entry.hash });
      continue;
    }
    if (st.isDirectory()) continue; // vendored dirs (node_modules) skipped
    let buf;
    try {
      buf = await readFile(abs);
    } catch {
      drifted.push({ path: entry.path, expectedHash: entry.hash });
      continue;
    }
    if (!verifyHashCompat(buf.toString('utf8'), entry.hash)) {
      drifted.push({ path: entry.path, expectedHash: entry.hash });
    }
  }

  if (drifted.length > 0) {
    return { kind: 'drift', drifted, files: manifest.files.length };
  }
  return { kind: 'in-sync', files: manifest.files.length };
}
