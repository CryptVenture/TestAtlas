// test/scripts/create-council-session-execution-mode.test.js
//
// Phase 21 Wave 0 — pins the contract that scripts/create-council-session.js
// accepts an executionMode argument from the 6-value enum, writes it into
// session.json, and that AJV validation rejects invalid enum values.
//
// Test 5 pins the Tier-5 contract (HIGH-1 fix): when both executionMode AND
// hostHasSubagentSpawn are omitted with participants >= 2, the field is
// ABSENT from session.json (not auto-defaulted) AND the result still
// validates — the orchestrator records mode post-hoc; the script does NOT
// guess.
//
// Wave 0 expectation: Tests 1 + 5 FAIL (script doesn't accept the arg yet —
// Wave 2 / 21-03 will turn them green); Tests 2-4 PASS (back-compat already
// works; AJV correctly accepts/rejects per the schema Task 1 already extended).

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createCouncilSession } from '../../scripts/create-council-session.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas', 'schemas', 'council_session.schema.json');
const ENUM = [
  'parallel-subagents',
  'single-spawn-inline',
  'sequential-fallback',
  'classify-only',
  'inline-simulation',
  'no-op',
];

async function compileSchema() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  delete schema.$schema;
  return ajv.compile(schema);
}

async function makeWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'phase21-w0-'));
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'agents', 'councils', 'sessions'), { recursive: true });
  await mkdir(path.join(wsDir, 'agents', 'personas', 'system'), { recursive: true });
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await writeFile(
    path.join(wsDir, 'brain', 'agent_sessions.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', sessions: [] }),
  );
  return dir;
}

test('Test 1: createCouncilSession accepts executionMode arg and writes it to session.json', async () => {
  const ws = await makeWorkspace();
  try {
    const result = await createCouncilSession({
      cwd: ws,
      suiteCwd: REPO_ROOT,
      topic: 'phase 21 wave 0 smoke',
      scope: 'tests',
      participants: ['qa-lead', 'codebase-mapper'],
      mode: 'roundtable-review',
      executionMode: 'inline-simulation',
    });
    const sess = JSON.parse(await readFile(path.join(result.sessionDir, 'session.json'), 'utf8'));
    assert.equal(
      sess.executionMode,
      'inline-simulation',
      'session.json must record executionMode when passed as arg',
    );
    const validate = await compileSchema();
    assert.ok(validate(sess), `AJV: ${JSON.stringify(validate.errors)}`);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test('Test 2: createCouncilSession without executionMode succeeds and session.json validates (back-compat)', async () => {
  const ws = await makeWorkspace();
  try {
    const result = await createCouncilSession({
      cwd: ws,
      suiteCwd: REPO_ROOT,
      topic: 't',
      scope: 's',
      participants: ['qa-lead'],
      mode: 'roundtable-review',
    });
    const sess = JSON.parse(await readFile(path.join(result.sessionDir, 'session.json'), 'utf8'));
    const validate = await compileSchema();
    assert.ok(validate(sess), `back-compat AJV: ${JSON.stringify(validate.errors)}`);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test('Test 3: All 6 enum values are accepted by AJV', async () => {
  const validate = await compileSchema();
  for (const mode of ENUM) {
    const sess = {
      id: 'COUNCIL-2026-05-09-099',
      topic: 't',
      participants: ['p'],
      status: 'pending',
      created_at: '2026-05-09T00:00:00.000Z',
      executionMode: mode,
    };
    assert.ok(
      validate(sess),
      `enum value ${mode} must validate; errors: ${JSON.stringify(validate.errors)}`,
    );
  }
});

test('Test 4: Invalid enum value is rejected by AJV', async () => {
  const validate = await compileSchema();
  const sess = {
    id: 'COUNCIL-2026-05-09-099',
    topic: 't',
    participants: ['p'],
    status: 'pending',
    created_at: '2026-05-09T00:00:00.000Z',
    executionMode: 'invalid-mode-xyz',
  };
  assert.ok(!validate(sess), 'invalid executionMode must be rejected by AJV');
});

test('Test 5: Tier-5 contract — when both executionMode AND hostHasSubagentSpawn omitted, executionMode field is ABSENT from session.json AND result still validates', async () => {
  const ws = await makeWorkspace();
  try {
    const result = await createCouncilSession({
      cwd: ws,
      suiteCwd: REPO_ROOT,
      topic: 't',
      scope: 's',
      participants: ['qa-lead', 'codebase-mapper', 'pm'],
      mode: 'roundtable-review',
      // executionMode AND hostHasSubagentSpawn intentionally omitted — Tier-5 path.
    });
    const sess = JSON.parse(await readFile(path.join(result.sessionDir, 'session.json'), 'utf8'));
    // HIGH-1 fix: Tier-5 must OMIT the field rather than write a wrong default.
    // The orchestrator agent records executionMode post-hoc; the script does NOT guess.
    assert.equal(
      sess.executionMode,
      undefined,
      'Tier-5 contract: when both executionMode and hostHasSubagentSpawn args are omitted with participants >= 2, session.json MUST omit the executionMode field (not auto-default to inline-simulation — that would produce systematically-wrong audit data)',
    );
    // Schema must still accept this shape (the field is optional for back-compat).
    const validate = await compileSchema();
    assert.ok(
      validate(sess),
      `Tier-5 sessions must still validate against the extended schema; AJV errors: ${JSON.stringify(validate.errors)}`,
    );
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});
