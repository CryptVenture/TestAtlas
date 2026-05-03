// scripts/lib/schema-loader.js
//
// Loads `.testatlas/vocabulary.json` FIRST, then every `*.schema.json` under
// `.testatlas/schemas/`, into the Phase 1 AJV singleton. Vocabulary must be
// registered before any schema that `$ref`s it; otherwise AJV's lazy resolver
// throws at first `getSchema()`.
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

const VOCABULARY_PATH = '.testatlas/vocabulary.json';
const SCHEMAS_DIR = '.testatlas/schemas';

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
 * Load vocabulary + every schema in `.testatlas/schemas/` into the AJV singleton.
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<ReturnType<typeof getAjv>>}
 */
export async function loadAllSchemas({ cwd = process.cwd() } = {}) {
  const ajv = getAjv();
  if (_loadedAjvs.has(ajv)) return ajv;

  // 1. Vocabulary FIRST (so subsequent $refs resolve at compile time).
  const vocabPath = path.join(cwd, VOCABULARY_PATH);
  const vocabText = await readFile(vocabPath, 'utf8');
  const vocab = JSON.parse(vocabText);
  addIfMissing(ajv, vocab);

  // 2. Iterate `.testatlas/schemas/*.schema.json`.
  const schemasDir = path.join(cwd, SCHEMAS_DIR);
  let entries;
  try {
    entries = await readdir(schemasDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      // No schemas directory yet — vocabulary alone is fine.
      _loadedAjvs.add(ajv);
      return ajv;
    }
    throw err;
  }

  // Sort for deterministic load order across platforms.
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.schema.json'))
    .map((e) => e.name)
    .sort();

  for (const fileName of files) {
    const filePath = path.join(schemasDir, fileName);
    const text = await readFile(filePath, 'utf8');
    const schema = JSON.parse(text);
    addIfMissing(ajv, schema);
  }

  _loadedAjvs.add(ajv);
  return ajv;
}
