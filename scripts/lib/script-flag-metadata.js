// scripts/lib/script-flag-metadata.js
//
// Quick 260508-rqx. Explicit catalog of (a) required CLI flags and
// (b) enum-flag values for each TestAtlas accelerator script, used by
// scripts/lint-commands.js sub-invariants 1.1 (flag-completeness) and
// 1.2 (enum-value-validity).
//
// Quick 260508-syv. Extended with on-disk catalogs of (c) schema files,
// (d) vocabulary enums, and (e) default-config keys, used by Round-11
// invariants 8 (schema-file-existence), 10 (vocabulary-enum-presence),
// and 13 (config-key-existence). Memoized at first call; pass an
// explicit `{schemasDir, vocabPath, configPath}` to obtain a fresh
// snapshot for hermetic tests.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const REQUIRED_FLAGS = {
  // Source of truth: scripts/update-brain-after-command.js lines 47-53 throw
  // TESTATLAS_INVALID_ARGS when --command, --actor, or --summary is absent.
  'update-brain-after-command.js': ['--command', '--actor', '--summary'],
};

export const ENUM_FLAGS = {
  // Source of truth: scripts/update-brain-after-command.js status enum is
  // {completed, aborted, in_progress} per the typeFor map (lines 60-64).
  'update-brain-after-command.js': {
    '--status': ['completed', 'aborted', 'in_progress'],
  },
};

// ─── Schema file catalog (Quick 260508-syv invariant 8) ─────────────────────

let _schemaFilesCache = null;
let _schemaFilesCacheKey = null;

/**
 * Return the set of canonical `<X>.schema.json` filenames present under
 * `<schemasDir>` (default: `.testatlas/schemas`).
 *
 * @param {{schemasDir?:string}} [opts]
 * @returns {Set<string>}
 */
export function getSchemaFiles(opts = {}) {
  const schemasDir = opts.schemasDir ?? path.join(PROJECT_ROOT, '.testatlas/schemas');
  const cacheKey = path.resolve(schemasDir);
  if (_schemaFilesCache && _schemaFilesCacheKey === cacheKey) return _schemaFilesCache;
  const out = new Set();
  try {
    for (const e of readdirSync(schemasDir)) {
      if (e.endsWith('.schema.json')) out.add(e);
    }
  } catch {
    /* missing dir → empty set */
  }
  _schemaFilesCache = out;
  _schemaFilesCacheKey = cacheKey;
  return out;
}

// ─── Vocabulary enum catalog (Quick 260508-syv invariant 10) ────────────────

let _vocabEnumsCache = null;
let _vocabEnumsCacheKey = null;

/**
 * Return a map of `enumName → Set<string>` for every `$defs.<enumName>.enum`
 * in `vocabulary.schema.json`.
 *
 * @param {{vocabPath?:string}} [opts]
 * @returns {Object<string, Set<string>>}
 */
export function getVocabEnums(opts = {}) {
  const vocabPath =
    opts.vocabPath ?? path.join(PROJECT_ROOT, '.testatlas/schemas/vocabulary.schema.json');
  const cacheKey = path.resolve(vocabPath);
  if (_vocabEnumsCache && _vocabEnumsCacheKey === cacheKey) return _vocabEnumsCache;
  const out = {};
  try {
    const txt = readFileSync(vocabPath, 'utf8');
    const v = JSON.parse(txt);
    const defs = v?.$defs ?? {};
    for (const [name, def] of Object.entries(defs)) {
      if (Array.isArray(def?.enum)) out[name] = new Set(def.enum);
    }
  } catch {
    /* missing file → empty */
  }
  _vocabEnumsCache = out;
  _vocabEnumsCacheKey = cacheKey;
  return out;
}

// ─── Config keys catalog (Quick 260508-syv invariant 13) ────────────────────

let _configKeysCache = null;
let _configKeysCacheKey = null;

/**
 * Return the set of top-level keys in `.testatlas/default.config.json`.
 *
 * @param {{configPath?:string}} [opts]
 * @returns {Set<string>}
 */
export function getConfigKeys(opts = {}) {
  const configPath = opts.configPath ?? path.join(PROJECT_ROOT, '.testatlas/default.config.json');
  const cacheKey = path.resolve(configPath);
  if (_configKeysCache && _configKeysCacheKey === cacheKey) return _configKeysCache;
  const out = new Set();
  try {
    const txt = readFileSync(configPath, 'utf8');
    const c = JSON.parse(txt);
    for (const k of Object.keys(c)) {
      if (k === '$schema') continue;
      out.add(k);
    }
  } catch {
    /* missing file → empty */
  }
  _configKeysCache = out;
  _configKeysCacheKey = cacheKey;
  return out;
}

// ─── Cache reset (for hermetic tests) ───────────────────────────────────────

export function _resetCatalogCaches() {
  _schemaFilesCache = null;
  _schemaFilesCacheKey = null;
  _vocabEnumsCache = null;
  _vocabEnumsCacheKey = null;
  _configKeysCache = null;
  _configKeysCacheKey = null;
}
