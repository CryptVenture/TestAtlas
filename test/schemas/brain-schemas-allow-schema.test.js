// test/schemas/brain-schemas-allow-schema.test.js
//
// Phase 18 Plan 02 — ISSUE-007 invariant.
//
// The 4 brain schemas (manifest, state, coverage, relationship) declare
// `additionalProperties: false`. Brain JSON files written by
// `init-workspace.js` and `v2-migrate.js` (and other writers) emit a top-level
// `$schema` annotation per JSON-Schema 2020-12. The schemas must whitelist
// that annotation so AJV validation passes.
//
// This test enforces:
//   1. Each of the 4 brain schemas whitelists `$schema` in `properties`.
//   2. A sample document carrying `$schema` validates against each schema.
//   3. (Sweep) every schema in `.testatlas/schemas/` that declares
//      `additionalProperties:false` whitelists `$schema` — prevents siblings
//      from regressing into the same trap.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = path.join(SUITE_ROOT, '.testatlas', 'schemas');

const BRAIN_SCHEMA_FILES = [
  'manifest.schema.json',
  'state.schema.json',
  'coverage.schema.json',
  'relationship.schema.json',
];

/**
 * Build a minimal stub for a property schema. Used to construct a sample
 * document that satisfies `required` so we can isolate whether the
 * `$schema` annotation is the rejection cause.
 */
function stubFor(propSchema) {
  if (!propSchema || typeof propSchema !== 'object') return null;
  // anyOf / oneOf / allOf — pick the first branch.
  if (Array.isArray(propSchema.anyOf) && propSchema.anyOf.length > 0) {
    return stubFor(propSchema.anyOf[0]);
  }
  if (Array.isArray(propSchema.oneOf) && propSchema.oneOf.length > 0) {
    return stubFor(propSchema.oneOf[0]);
  }
  // pattern-constrained strings — try to satisfy the most common patterns.
  if (propSchema.type === 'string') {
    if (propSchema.pattern === '^2\\.0\\.0$') return '2.0.0';
    if (propSchema.format === 'date-time') return new Date().toISOString();
    if (propSchema.format === 'uri') return 'https://example.test/x';
    if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) return propSchema.enum[0];
    return 'x';
  }
  if (propSchema.type === 'integer' || propSchema.type === 'number') return 0;
  if (propSchema.type === 'boolean') return false;
  if (propSchema.type === 'array') return [];
  if (propSchema.type === 'object') {
    const obj = {};
    for (const req of propSchema.required ?? []) {
      obj[req] = stubFor(propSchema.properties?.[req]);
    }
    return obj;
  }
  return null;
}

function buildMinimalSample(schema) {
  const sample = {};
  for (const req of schema.required ?? []) {
    sample[req] = stubFor(schema.properties?.[req]);
  }
  return sample;
}

test('ISSUE-007: each brain schema whitelists top-level $schema in properties', async () => {
  for (const file of BRAIN_SCHEMA_FILES) {
    const schema = JSON.parse(await readFile(path.join(SCHEMA_DIR, file), 'utf8'));
    assert.equal(
      schema.additionalProperties,
      false,
      `${file}: precondition — additionalProperties must remain false`,
    );
    assert.ok(
      schema.properties && Object.hasOwn(schema.properties, '$schema'),
      `${file}: must whitelist "$schema" in properties (ISSUE-007)`,
    );
  }
});

test('ISSUE-007: each brain schema validates a sample carrying $schema annotation', async () => {
  const ajv = await loadAllSchemas({ cwd: SUITE_ROOT });
  for (const file of BRAIN_SCHEMA_FILES) {
    const schema = JSON.parse(await readFile(path.join(SCHEMA_DIR, file), 'utf8'));
    const validate = ajv.getSchema(schema.$id);
    assert.ok(validate, `${file}: schema $id ${schema.$id} not registered with AJV`);
    const sample = buildMinimalSample(schema);
    sample.$schema = schema.$id;
    const ok = validate(sample);
    assert.ok(
      ok,
      `${file}: sample carrying $schema annotation must validate. AJV errors: ${JSON.stringify(
        validate.errors,
      )}`,
    );
  }
});

test('Brain-schema invariant: every schema with additionalProperties:false whitelists $schema', async () => {
  const offenders = [];
  const entries = (await readdir(SCHEMA_DIR)).filter((n) => n.endsWith('.schema.json'));
  for (const f of entries) {
    const schema = JSON.parse(await readFile(path.join(SCHEMA_DIR, f), 'utf8'));
    if (schema.additionalProperties !== false) continue;
    if (!schema.properties || !Object.hasOwn(schema.properties, '$schema')) {
      offenders.push(f);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Schemas with additionalProperties:false must whitelist $schema (ISSUE-007 invariant). Offenders:\n  - ${offenders.join('\n  - ')}`,
  );
});
