// test/scripts/cosign-absent-scenario.test.js
//
// Quick 260506-07b — Wire cosign into dogfood-test environment.
// Dogfood-local test asserting the new cosign-absent-degrade scenario exists,
// validates against test-scenario.schema.json (via AJV), and references the
// canonical install flow.
//
// Why every test below is gated on file presence:
//   The `_testatlas/` directory is gitignored by design (`.gitignore` line 31).
//   It is a dogfood-product workspace — local on a maintainer's machine after
//   running /atlas:* commands, NOT a checked-in source artifact. CI runs
//   `pnpm test` against a fresh clone where `_testatlas/` is absent. Tests
//   that require the file MUST skip cleanly, not fail. Locally, all 7 sub-
//   tests run and protect the dogfood scenario contract.
//
// Determination (recorded for handoff to Quick B):
//   install.sh's cosign-absent path is FAIL-CLOSED-ON-OPT-IN:
//     - Default flow (TESTATLAS_VERIFY_SIGNATURE unset) → fail-open: signature
//       check skipped entirely; install proceeds with sha256-only.
//     - Opt-in flow (TESTATLAS_VERIFY_SIGNATURE=1, cosign absent on PATH) →
//       fail-closed: install.sh exits 1 with `_err "cosign not found on PATH
//       but --verify-signature requested"`.
//   This is intentional UX: silent sha-only degrade would defeat the user's
//   explicit opt-in.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCENARIO_DIR = path.join(import.meta.dirname, '..', '..', '_testatlas', 'tests', 'scenarios');
const SCENARIO_ID = 'TEST-install-cosign-absent-degrade';
const JSON_FILE = path.join(SCENARIO_DIR, `${SCENARIO_ID}.json`);
const MD_FILE = path.join(SCENARIO_DIR, `${SCENARIO_ID}.md`);
const MATRIX_FILE = path.join(import.meta.dirname, '..', '..', '_testatlas', 'tests', 'matrix.md');

const SCHEMAS_DIR = path.join(import.meta.dirname, '..', '..', '.testatlas', 'schemas');

const HAS_DOGFOOD_WORKSPACE =
  existsSync(JSON_FILE) && existsSync(MD_FILE) && existsSync(MATRIX_FILE);

test('scenario: TEST-install-cosign-absent-degrade.{json,md} both exist', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE)
    return t.skip('dogfood _testatlas/ not present (CI/fresh-clone path)');
  // existsSync above already proved both files; no further assertion needed.
  assert.ok(true);
});

test('scenario: JSON validates against test-scenario.schema.json', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE) return t.skip('dogfood _testatlas/ not present');
  const ajv = new Ajv2020.default({ strict: false, allErrors: true });
  addFormats.default(ajv);

  // Load + register all schemas in .testatlas/schemas/ so $refs resolve.
  // (vocabulary.schema.json lives here too post-Quick-260507-vn2.)
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(SCHEMAS_DIR)) {
    if (!entry.endsWith('.schema.json')) continue;
    const buf = await readFile(path.join(SCHEMAS_DIR, entry), 'utf8');
    ajv.addSchema(JSON.parse(buf));
  }

  const validate = ajv.getSchema('https://testatlas.dev/schemas/v1/test-scenario.schema.json');
  assert.ok(validate, 'test-scenario schema must be registered');

  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const ok = validate(data);
  assert.ok(ok, `AJV errors: ${JSON.stringify(validate.errors, null, 2)}`);
});

test('scenario: references FLOW-install-curl-pipe-install + domain-install', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE) return t.skip('dogfood _testatlas/ not present');
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  assert.equal(data.flow, 'FLOW-install-curl-pipe-install');
  assert.equal(data.domain, 'domain-install');
});

test('scenario: type=state, priority=high, status=draft (per brief)', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE) return t.skip('dogfood _testatlas/ not present');
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  assert.equal(data.type, 'state');
  assert.equal(data.priority, 'high');
  assert.equal(data.status, 'draft');
});

test('scenario: documents fail-closed-on-opt-in determination', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE) return t.skip('dogfood _testatlas/ not present');
  // The expectedResults must record BOTH paths: default skip AND opt-in halt.
  // Quick B will execute against this contract.
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const text = `${data.userGoal}\n${data.steps.join('\n')}\n${data.expectedResults.join('\n')}`;
  assert.match(text, /TESTATLAS_VERIFY_SIGNATURE/, 'must reference the env-var gate');
  assert.match(text, /fail.?closed|halt|exit\s*1/i, 'must record opt-in halt path');
  assert.match(text, /skip|fail.?open|sha256/i, 'must record default skip path');
});

test('scenario: states empty / success / permission appear in steps', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE) return t.skip('dogfood _testatlas/ not present');
  const data = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const text = data.steps.join('\n').toLowerCase();
  for (const state of ['empty', 'success', 'permission']) {
    assert.ok(text.includes(state), `expected state "${state}" in steps`);
  }
});

test('scenario: matrix.md lists the new scenario row in domain-install table', async (t) => {
  if (!HAS_DOGFOOD_WORKSPACE) return t.skip('dogfood _testatlas/ not present');
  const matrix = await readFile(MATRIX_FILE, 'utf8');
  assert.match(matrix, new RegExp(SCENARIO_ID));
});
