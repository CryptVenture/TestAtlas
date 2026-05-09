// test/schemas/drift-record-additivity.test.js
//
// Plan 22-01 Task 10 — HIDDEN drift-record-trim regression.
//
// Pins that _testatlas/brain/drift.json conforms to drift_record.schema.json
// (which has additionalProperties:false). Wave 1 Task 8 trims the per-record
// metadata (source/category/severity/proposed_fix/etc) — preserving content
// in adjacent docs but the brain.json must validate against the schema.
//
// Wave 0 RED: current drift.json records have many extra fields →
// AJV fails additionalProperties on every record.

import { strict as assert } from 'node:assert';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas', 'schemas', 'drift_record.schema.json');
const DRIFT_PATH = path.join(REPO_ROOT, '_testatlas', 'brain', 'drift.json');

async function compileValidate() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  delete schema.$schema;
  return ajv.compile(schema);
}

test('Test 1: every record in drift.json validates against drift_record.schema.json', async () => {
  const validate = await compileValidate();
  const drift = JSON.parse(await readFile(DRIFT_PATH, 'utf8'));
  for (const record of drift.drift_records) {
    const ok = validate(record);
    assert.ok(
      ok,
      `record ${record.id} must validate; errors: ${JSON.stringify(validate.errors)}`,
    );
  }
});

test('Test 2: schema rejects records with additional properties', async () => {
  const validate = await compileValidate();
  const bad = {
    id: 'DRIFT-999',
    git_ref: 'main',
    drift_status: 'fresh',
    detected_at: '2026-05-09T00:00:00Z',
    source: 'extra-not-in-schema',
  };
  const ok = validate(bad);
  assert.equal(ok, false, 'AJV must reject extra properties');
  assert.ok(
    (validate.errors ?? []).some((e) => /additionalProperties/.test(e.keyword ?? '')),
    `expected additionalProperties error; got ${JSON.stringify(validate.errors)}`,
  );
});

test('Test 3: schema rejects records missing git_ref', async () => {
  const validate = await compileValidate();
  const bad = {
    id: 'DRIFT-998',
    drift_status: 'fresh',
    detected_at: '2026-05-09T00:00:00Z',
  };
  const ok = validate(bad);
  assert.equal(ok, false, 'AJV must reject missing required field');
  assert.ok(
    (validate.errors ?? []).some(
      (e) => e.keyword === 'required' && /git_ref/.test(JSON.stringify(e)),
    ),
    `expected required-field error for git_ref; got ${JSON.stringify(validate.errors)}`,
  );
});

test('Test 4: drift.json contains 11 records (DRIFT-001..DRIFT-011)', async () => {
  const drift = JSON.parse(await readFile(DRIFT_PATH, 'utf8'));
  assert.equal(
    drift.drift_records.length,
    11,
    'drift.json must preserve all 11 audit findings post-trim',
  );
});

test('Test 5: every record id matches /^DRIFT-[0-9]+$/', async () => {
  const drift = JSON.parse(await readFile(DRIFT_PATH, 'utf8'));
  for (const record of drift.drift_records) {
    assert.match(record.id, /^DRIFT-[0-9]+$/, `record id "${record.id}" must match /^DRIFT-\\d+$/`);
  }
});
