// test/schemas/command-result-execution-mode.test.js
//
// Quick 260505-hld / Task 1: command-result.schema.json gains an OPTIONAL
// `executionMode` enum field for orchestrator commands (e.g. /atlas:explore
// in Option A spawn-and-aggregate mode). Existing rows that omit the field
// MUST continue to validate — back-compat is non-negotiable because Quick
// 260505-ge3 dogfood records already exist on disk under
// _testatlas/10_command_log.md and _testatlas/history/command_history.jsonl.
//
// 5 assertions:
//   1. schema.properties contains the `executionMode` key.
//   2. executionMode.type === "string" AND executionMode.enum deep-equals
//      the canonical 5-value list (classify-only, parallel-subagents,
//      sequential-fallback, single-spawn-inline, no-op).
//   3. executionMode is NOT in schema.required[] (back-compat invariant).
//   4. A sample command-result row WITHOUT executionMode validates GREEN.
//   5a. A sample row WITH executionMode='parallel-subagents' validates GREEN.
//   5b. A sample row WITH executionMode='invalid-value' fails validation.
//
// RED-phase expectation (commit before schema edit): tests 1, 2, and 5a fail.
//   - Test 1 fails: properties has no `executionMode` key today.
//   - Test 2 fails: no enum to read (TypeError on undefined access avoided
//     via early-return; assertion fails on the deep-equal step).
//   - Test 5a fails: AJV rejects unknown property under
//     additionalProperties:false.
// Tests 3, 4, 5b pass against the current schema (3: not in required[];
// 4: row without field is valid; 5b: AJV rejects unknown property too —
// correct outcome by accident pre-edit, correct outcome by enum post-edit).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas/schemas/command-result.schema.json');
const VOCAB_PATH = path.join(REPO_ROOT, '.testatlas/vocabulary.json');

const EXPECTED_ENUM = [
  'classify-only',
  'parallel-subagents',
  'sequential-fallback',
  'single-spawn-inline',
  'no-op',
];

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const vocab = JSON.parse(await readFile(VOCAB_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const add = addFormats.default ?? addFormats;
  add(ajv);
  ajv.addSchema(vocab);
  ajv.addSchema(schema);
  return { schema, validate: ajv.getSchema(schema.$id) };
}

function baseRow() {
  return {
    command: '/atlas:explore',
    invokedAt: '2026-05-05T13:00:00Z',
    completedAt: '2026-05-05T13:01:00Z',
    status: 'success',
    outputs: ['_testatlas/explore-plan.md'],
    errors: [],
    artifactsCreated: ['_testatlas/explore-plan.md'],
    artifactsUpdated: [],
    manifestUpdated: true,
  };
}

test('command-result schema: properties contains executionMode key', async () => {
  const { schema } = await loadValidator();
  assert.ok(
    Object.hasOwn(schema.properties, 'executionMode'),
    'schema.properties.executionMode must exist (Quick 260505-hld / Option A)',
  );
});

test('command-result schema: executionMode is string-enum with the 5 canonical values', async () => {
  const { schema } = await loadValidator();
  const field = schema.properties.executionMode;
  assert.ok(field, 'executionMode field must be defined');
  assert.equal(field.type, 'string', 'executionMode.type must be "string"');
  assert.deepEqual(
    field.enum,
    EXPECTED_ENUM,
    `executionMode.enum must deep-equal ${JSON.stringify(EXPECTED_ENUM)}`,
  );
});

test('command-result schema: executionMode is OPTIONAL (not in required[])', async () => {
  const { schema } = await loadValidator();
  assert.ok(
    !schema.required.includes('executionMode'),
    'executionMode MUST NOT be in required[] — back-compat invariant for Quick 260505-ge3 records',
  );
});

test('command-result schema: row WITHOUT executionMode validates (back-compat)', async () => {
  const { validate } = await loadValidator();
  const row = baseRow();
  const ok = validate(row);
  assert.ok(
    ok,
    `row without executionMode must validate; errors=${JSON.stringify(validate.errors)}`,
  );
});

test('command-result schema: row WITH executionMode="parallel-subagents" validates', async () => {
  const { validate } = await loadValidator();
  const row = { ...baseRow(), executionMode: 'parallel-subagents' };
  const ok = validate(row);
  assert.ok(
    ok,
    `row with executionMode=parallel-subagents must validate; errors=${JSON.stringify(validate.errors)}`,
  );
});

test('command-result schema: row WITH executionMode="invalid-value" fails validation', async () => {
  const { validate } = await loadValidator();
  const row = { ...baseRow(), executionMode: 'invalid-value' };
  const ok = validate(row);
  assert.ok(
    !ok,
    'row with executionMode=invalid-value must fail validation (enum violation OR additionalProperties)',
  );
});
