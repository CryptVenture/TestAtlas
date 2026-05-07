// scripts/lib/schema-loader.js
//
// Loads every `*.schema.json` under `.testatlas/schemas/` into the Phase 1
// AJV singleton. Vocabulary loads FIRST (defensive — many schemas `$ref` it
// and explicit ordering avoids surprises with AJV's resolver).
//
// The vocabulary schema lives at `.testatlas/schemas/vocabulary.schema.json`
// alongside every other schema (single source of truth — quick-260507-vn2
// consolidated; the legacy `.testatlas/vocabulary.json` top-level path was
// removed as a copy-leak).
//
// Usage:
//   import { loadAllSchemas } from './schema-loader.js';
//   const ajv = await loadAllSchemas({ cwd });          // returns the singleton
//   const validate = ajv.getSchema('https://testatlas.dev/schemas/v1/issue.schema.json');
//
// Idempotent: subsequent calls are a no-op (module-level _loaded latch). Safe
// to call from anywhere.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getAjv } from './ajv-instance.js';

const SCHEMAS_DIR = '.testatlas/schemas';
const VOCABULARY_FILE = 'vocabulary.schema.json';

/** @type {WeakSet<object>} */
const _loadedAjvs = new WeakSet();

/**
 * Add a schema to AJV iff it isn't already registered. AJV throws on
 * double-add by `$id`, so the guard is required for re-entrant callers.
 *
 * @param {ReturnType<typeof getAjv>} ajv
 * @param {object} schema
 */
function addIfMissing(ajv, schema) {
  if (!schema || typeof schema.$id !== 'string') {
    throw new Error(
      `schema-loader: schema is missing a string $id (got: ${JSON.stringify(schema?.$id)})`,
    );
  }
  if (!ajv.getSchema(schema.$id)) {
    ajv.addSchema(schema);
  }
}

/**
 * Load every schema in `.testatlas/schemas/` into the AJV singleton.
 * Vocabulary (`vocabulary.schema.json`) loads first; all others alphabetical.
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<ReturnType<typeof getAjv>>}
 */
export async function loadAllSchemas({ cwd = process.cwd() } = {}) {
  const ajv = getAjv();
  if (_loadedAjvs.has(ajv)) return ajv;

  const schemasDir = path.join(cwd, SCHEMAS_DIR);
  let entries;
  try {
    entries = await readdir(schemasDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      // No schemas directory present at this cwd. Throw rather than silently
      // latch — callers that recover via try/catch (e.g.
      // scripts/update-coverage.js running against a tmp test workspace) rely
      // on a subsequent call with a different cwd succeeding.
      const wrapped = new Error(`schema-loader: schemas directory not found at ${schemasDir}`);
      wrapped.code = 'TESTATLAS_SCHEMAS_DIR_MISSING';
      wrapped.cause = err;
      throw wrapped;
    }
    throw err;
  }

  const allFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.schema.json'))
    .map((e) => e.name);

  // Vocabulary FIRST (defensive ordering), then alphabetical for everything else.
  const orderedFiles = allFiles.includes(VOCABULARY_FILE)
    ? [VOCABULARY_FILE, ...allFiles.filter((f) => f !== VOCABULARY_FILE).sort()]
    : allFiles.sort();

  for (const fileName of orderedFiles) {
    const filePath = path.join(schemasDir, fileName);
    const text = await readFile(filePath, 'utf8');
    const schema = JSON.parse(text);
    addIfMissing(ajv, schema);
  }

  _loadedAjvs.add(ajv);
  return ajv;
}
