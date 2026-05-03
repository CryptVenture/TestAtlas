// scripts/lib/load-config.js
//
// Reads .testatlas/default.config.json + ./testatlas.config.json (override),
// deep-merges (override wins on primitives, recurses on objects, replaces arrays
// wholesale), AJV-validates the merged config against .testatlas/config.schema.json,
// and returns the frozen result.
//
// Throws on:
//   - SyntaxError in override:  Error{code: 'TESTATLAS_INVALID_JSON',  path: <override-path>}
//   - AJV failure:              Error{code: 'TESTATLAS_INVALID_CONFIG', validationErrors: [...]}
//
// Per .planning/phases/01-bootstrap-constitution-config-layer/01-RESEARCH.md
// §"Pattern 4" + §"Pitfall 3" + §"Pitfall 5".

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatErrors, getAjv } from './ajv-instance.js';

const SUITE_DIR = '.testatlas';
const PROJECT_OVERRIDE = 'testatlas.config.json';

/**
 * Recursive deep-merge:
 *   - undefined override → keep base
 *   - null override → force null (validated by AJV)
 *   - array → replace wholesale (clone)
 *   - non-object primitive → replace
 *   - plain object → recurse on keys present in override
 *
 * Does NOT mutate either input.
 */
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (over === null) return null;
  if (Array.isArray(over)) return [...over];
  if (typeof over !== 'object') return over;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return structuredClone(over);
  }
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = deepMerge(base[k], over[k]);
  }
  return out;
}

async function readJson(filePath) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      const wrapped = new Error(`${filePath}: invalid JSON syntax — ${err.message}`);
      wrapped.code = 'TESTATLAS_INVALID_JSON';
      wrapped.path = filePath;
      wrapped.cause = err;
      throw wrapped;
    }
    throw err;
  }
}

/**
 * Load and validate the TestAtlas config.
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<Readonly<object>>}
 */
export async function loadConfig({ cwd = process.cwd() } = {}) {
  const defaultsPath = path.join(cwd, SUITE_DIR, 'default.config.json');
  const overridePath = path.join(cwd, PROJECT_OVERRIDE);
  const schemaPath = path.join(cwd, SUITE_DIR, 'config.schema.json');

  const defaults = await readJson(defaultsPath);
  if (defaults === undefined) {
    throw new Error(`TestAtlas defaults missing: ${defaultsPath}`);
  }

  const override = (await readJson(overridePath)) ?? {};

  const merged = deepMerge(structuredClone(defaults), override);

  const schema = await readJson(schemaPath);
  if (schema === undefined) {
    throw new Error(`TestAtlas schema missing: ${schemaPath}`);
  }

  const ajv = getAjv();
  if (!ajv.getSchema(schema.$id)) ajv.addSchema(schema);
  const validate = ajv.getSchema(schema.$id);

  if (!validate(merged)) {
    const lines = formatErrors(validate.errors, overridePath);
    const err = new Error(`Invalid TestAtlas config:\n  ${lines.join('\n  ')}`);
    err.code = 'TESTATLAS_INVALID_CONFIG';
    err.validationErrors = validate.errors;
    throw err;
  }

  return Object.freeze(merged);
}
