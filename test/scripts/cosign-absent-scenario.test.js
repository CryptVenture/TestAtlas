// test/scripts/cosign-absent-scenario.test.js
//
// Quick 260506-07b — Wire cosign into dogfood-test environment.
// RED test asserting the new cosign-absent-degrade scenario exists, validates
// against test-scenario.schema.json (via AJV), and references the canonical
// install flow.
//
// Determination (recorded for handoff to Quick B):
//   install.sh's cosign-absent path is FAIL-CLOSED-ON-OPT-IN:
//     - Default flow (TESTATLAS_VERIFY_SIGNATURE unset) → fail-open: signature
//       check skipped entirely; install proceeds with sha256-only.
//     - Opt-in flow (TESTATLAS_VERIFY_SIGNATURE=1, cosign absent on PATH) →
//       fail-closed: install.sh exits 1 with `_err "cosign not found on PATH
//       but --verify-signature requested"`.
//   This is intentional UX: silent sha-only degrade would defeat the user's
//   explicit opt-in. The scenario therefore records `expected: halt` for the
//   opt-in path and `expected: skip-cleanly` for the default path.

import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCENARIO_DIR = path.join(import.meta.dirname, '..', '..', '_testatlas', 'tests', 'scenarios');
const SCENARIO_ID = 'TEST-install-cosign-absent-degrade';
const JSON_FILE = path.join(SCENARIO_DIR, `${SCENARIO_ID}.json`);
const MD_FILE = path.join(SCENARIO_DIR, `${SCENARIO_ID}.md`);

const SCHEMAS_DIR = path.join(import.meta.dirname, '..', '..', '.testatlas', 'schemas');

test('scenario: TEST-install-cosign-absent-degrade.{json,md} both exist', async () => {
  await access(JSON_FILE);
  await access(MD_FILE);
});

test('scenario: JSON validates against test-scenario.schema.json', async () => {
  const ajv = new Ajv2020.default({ strict: false, allErrors: true });
  addFormats.default(ajv);

  // Load + register all schemas in .testatlas/schemas/ so $refs resolve.
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(SCHEMAS_DIR)) {
    if (!entry.endsWith('.schema.json')) continue;
    const buf = await readFile(path.join(SCHEMAS_DIR, entry), 'utf8');
    ajv.addSchema(JSON.parse(buf));
  }
  // The vocabulary file is a schema even though it sits outside schemas/.
  const vocab = JSON.parse(
    await readFile(
      path.join(import.meta.dirname, '..', '..', '.testatlas', 'vocabulary.json'),
      'utf8',
    ),
  );
  ajv.addSchema(vocab);

  const validate = ajv.getSchema('https://testatlas.dev/schemas/v1/test-scenario.schema.json');
  assert.ok(validate, 'test-scenario schema must be registered');

  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const ok = validate(data);
  assert.ok(ok, `AJV errors: ${JSON.stringify(validate.errors, null, 2)}`);
});

test('scenario: references FLOW-install-curl-pipe-install + domain-install', async () => {
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  assert.equal(data.flow, 'FLOW-install-curl-pipe-install');
  assert.equal(data.domain, 'domain-install');
});

test('scenario: type=state, priority=high, status=draft (per brief)', async () => {
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  assert.equal(data.type, 'state');
  assert.equal(data.priority, 'high');
  assert.equal(data.status, 'draft');
});

test('scenario: documents fail-closed-on-opt-in determination', async () => {
  // The expectedResults must record BOTH paths: default skip AND opt-in halt.
  // Quick B will execute against this contract.
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const text = `${data.userGoal}\n${data.steps.join('\n')}\n${data.expectedResults.join('\n')}`;
  assert.match(text, /TESTATLAS_VERIFY_SIGNATURE/, 'must reference the env-var gate');
  assert.match(text, /fail.?closed|halt|exit\s*1/i, 'must record opt-in halt path');
  assert.match(text, /skip|fail.?open|sha256/i, 'must record default skip path');
});

test('scenario: states empty / success / permission appear in steps', async () => {
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const text = data.steps.join('\n').toLowerCase();
  for (const state of ['empty', 'success', 'permission']) {
    assert.ok(text.includes(state), `expected state "${state}" in steps`);
  }
});

test('scenario: matrix.md lists the new scenario row in domain-install table', async () => {
  const matrix = await readFile(
    path.join(import.meta.dirname, '..', '..', '_testatlas', 'tests', 'matrix.md'),
    'utf8',
  );
  assert.match(matrix, new RegExp(SCENARIO_ID));
});
