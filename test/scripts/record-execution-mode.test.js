// test/scripts/record-execution-mode.test.js
//
// Plan 22-01 Task 6 — DEC-006 regression (post-hoc executionMode setter).
//
// Pins the contract that scripts/record-execution-mode.js (NEW Wave 1)
// stamps `executionMode` + `executionMode_justification` onto an existing
// session.json post-hoc, idempotently, with AJV-enum validation.
//
// Wave 0 RED: scripts/record-execution-mode.js does NOT exist (Tests 1-6
// fail with ERR_MODULE_NOT_FOUND). Test 7 cross-checks Tier-5 contract on
// existing create-council-session.js (passes GREEN — unchanged).

import { strict as assert } from 'node:assert';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'record-execution-mode.js');
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas', 'schemas', 'council_session.schema.json');

async function setupSession(opts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-record-exec-mode-'));
  const wsDir = path.join(dir, '_testatlas');
  const sessionId = opts.sessionId ?? 'COUNCIL-2026-05-09-200';
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', sessionId);
  if (opts.createSessionFile !== false) {
    await mkdir(sessionDir, { recursive: true });
    const session = {
      id: sessionId,
      topic: 't',
      participants: ['p1', 'p2'],
      status: 'active',
      created_at: '2026-05-09T00:00:00Z',
      ...(opts.priorMode ? { executionMode: opts.priorMode } : {}),
    };
    await writeFile(path.join(sessionDir, 'session.json'), `${JSON.stringify(session, null, 2)}\n`);
  }
  return { dir, sessionId, sessionDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function readSessionJson(sessionDir) {
  return JSON.parse(await readFile(path.join(sessionDir, 'session.json'), 'utf8'));
}

async function compileSchema() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  delete schema.$schema;
  return ajv.compile(schema);
}

test('Test 1: undefined → set — stamps executionMode + justification', async () => {
  const ctx = await setupSession();
  try {
    const { recordExecutionMode } = await import(SCRIPT);
    const r = await recordExecutionMode({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
      mode: 'parallel-subagents',
      justification: 'host advertised spawn',
    });
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    const session = await readSessionJson(ctx.sessionDir);
    assert.equal(session.executionMode, 'parallel-subagents');
    assert.equal(session.executionMode_justification, 'host advertised spawn');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: idempotent — re-record with identical args reports changed:false', async () => {
  const ctx = await setupSession();
  try {
    const { recordExecutionMode } = await import(SCRIPT);
    await recordExecutionMode({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
      mode: 'parallel-subagents',
      justification: 'first',
    });
    const before = await readFile(path.join(ctx.sessionDir, 'session.json'));
    const r2 = await recordExecutionMode({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
      mode: 'parallel-subagents',
      justification: 'first',
    });
    const after = await readFile(path.join(ctx.sessionDir, 'session.json'));
    assert.equal(r2.changed, false);
    assert.equal(before.equals(after), true, 'session.json must be byte-equal on idempotent call');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: overwrite existing — prior mode replaced with new', async () => {
  const ctx = await setupSession({ priorMode: 'inline-simulation' });
  try {
    const { recordExecutionMode } = await import(SCRIPT);
    await recordExecutionMode({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
      mode: 'parallel-subagents',
      justification: 'upgraded after spawn confirmed',
    });
    const session = await readSessionJson(ctx.sessionDir);
    assert.equal(session.executionMode, 'parallel-subagents');
    assert.equal(session.executionMode_justification, 'upgraded after spawn confirmed');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: back-compat — pre-Phase-21 session (no executionMode) still validates after stamp', async () => {
  const ctx = await setupSession();
  try {
    const { recordExecutionMode } = await import(SCRIPT);
    await recordExecutionMode({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
      mode: 'sequential-fallback',
      justification: 'spawn unavailable',
    });
    const session = await readSessionJson(ctx.sessionDir);
    const validate = await compileSchema();
    assert.ok(
      validate(session),
      `post-stamp session.json must validate; errors: ${JSON.stringify(validate.errors)}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: invalid mode rejected — session.json untouched', async () => {
  const ctx = await setupSession();
  try {
    const { recordExecutionMode } = await import(SCRIPT);
    const before = await readFile(path.join(ctx.sessionDir, 'session.json'));
    let threw = false;
    let okFalse = false;
    try {
      const r = await recordExecutionMode({
        cwd: ctx.dir,
        sessionId: ctx.sessionId,
        mode: 'frobnicate',
        justification: 'x',
      });
      okFalse = r && r.ok === false;
    } catch {
      threw = true;
    }
    const after = await readFile(path.join(ctx.sessionDir, 'session.json'));
    assert.ok(
      threw || okFalse,
      'invalid mode must either throw or return {ok:false}',
    );
    assert.ok(before.equals(after), 'session.json must be untouched on invalid mode');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: missing session — returns {ok:false} or throws ENOENT', async () => {
  const ctx = await setupSession({ createSessionFile: false });
  try {
    const { recordExecutionMode } = await import(SCRIPT);
    let threw = false;
    let okFalse = false;
    try {
      const r = await recordExecutionMode({
        cwd: ctx.dir,
        sessionId: 'COUNCIL-DOES-NOT-EXIST',
        mode: 'parallel-subagents',
        justification: 'x',
      });
      okFalse = r && r.ok === false;
    } catch (e) {
      threw = true;
      assert.ok(
        /not found|ENOENT|missing/i.test(e.message ?? ''),
        `error must mention not-found / ENOENT / missing; got "${e.message}"`,
      );
    }
    assert.ok(
      threw || okFalse,
      'missing session must either throw or return {ok:false}',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 7: Tier-5 contract preservation — create-council-session leaves executionMode ABSENT when both args undefined', async () => {
  // This pins that record-execution-mode.js is a SEPARATE post-hoc producer
  // and does NOT change create-council-session.js's Tier-5 behavior.
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-tier5-pin-'));
  try {
    const wsDir = path.join(dir, '_testatlas');
    await mkdir(path.join(wsDir, 'agents', 'councils', 'sessions'), { recursive: true });
    await mkdir(path.join(wsDir, 'agents', 'personas', 'system'), { recursive: true });
    await mkdir(path.join(wsDir, 'brain'), { recursive: true });
    await writeFile(
      path.join(wsDir, 'brain', 'agent_sessions.json'),
      JSON.stringify({ schema_version: '2.0.0', last_updated: '', sessions: [] }),
    );
    const { createCouncilSession } = await import(
      path.join(REPO_ROOT, 'scripts', 'create-council-session.js')
    );
    const result = await createCouncilSession({
      cwd: dir,
      suiteCwd: REPO_ROOT,
      topic: 'tier-5 pin',
      scope: 'tests',
      participants: ['qa-lead', 'codebase-mapper'],
      mode: 'roundtable-review',
      // both executionMode AND hostHasSubagentSpawn intentionally omitted
    });
    const sess = JSON.parse(
      await readFile(path.join(result.sessionDir, 'session.json'), 'utf8'),
    );
    assert.ok(
      !('executionMode' in sess),
      `Tier-5 contract: executionMode must be ABSENT when both args undefined. Got: ${JSON.stringify(sess.executionMode)}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
