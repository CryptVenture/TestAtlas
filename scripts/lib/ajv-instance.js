// scripts/lib/ajv-instance.js
//
// Singleton AJV factory — Draft 2020-12 + ajv-formats. The compile-once-share
// pattern (live-probed against ajv@8.20.0 / ajv-formats@3.0.1 on 2026-05-03):
//
//   1. Create exactly one Ajv2020 instance per process.
//   2. Register schemas with `ajv.addSchema(schema)` (uses schema.$id automatically).
//   3. Use sites call `ajv.getSchema('<id>')` to retrieve the compiled validator.
//
// Anti-pattern: calling `ajv.compile(schema)` AFTER `ajv.addSchema(schema)` for
// the same $id throws "schema with key or id ... already exists". Use addSchema
// + getSchema only.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

let _ajv = null;

/**
 * Lazy singleton. Subsequent calls return the same instance.
 *
 * @returns {import('ajv/dist/2020.js').default}
 */
export function getAjv() {
  if (_ajv) return _ajv;
  _ajv = new Ajv2020({ allErrors: true, strict: true });
  // ajv-formats ESM/CJS interop — both forms exist in the wild as of v3.0.1.
  const add = addFormats.default ?? addFormats;
  add(_ajv);
  return _ajv;
}

/**
 * Map AJV's error[] to readable lines: `<sourceFile>: <path>: <message>`.
 * AJV already populates `error.message` with a plain-English string.
 *
 * @param {ReadonlyArray<import('ajv').ErrorObject>} errors
 * @param {string} [sourceFile='<config>']
 * @returns {string[]}
 */
export function formatErrors(errors, sourceFile = '<config>') {
  return errors.map((e) => {
    const path = e.instancePath || '/';
    return `${sourceFile}: ${path}: ${e.message}`;
  });
}
