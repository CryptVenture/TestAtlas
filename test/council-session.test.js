// test/council-session.test.js
//
// Plan 14-04 Task 2 — create-council-session.js generates a session folder
// with all 15 PRD §7.8 artifacts.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'create-council-session.js');

// PRD §7.8 — required session folder layout. outputs/<persona-id>-output.{md,json}
// is per-persona; we assert the outputs/ dir exists.
const REQUIRED_FILES = [
  'session.md',
  'session.json',
  'prompt.md',
  'context_bundle.md',
  'participants.json',
  'transcript.jsonl',
  'transcript.md',
  'claims.jsonl',
  'disagreements.md',
  'votes.json',
  'consolidation.md',
  'consolidation.json',
  'followups.md',
  'generated_issues.md',
  'generated_flows.md',
  'generated_questions.md',
];

const REQUIRED_DIRS = ['outputs'];

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-council-session-'));
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await mkdir(path.join(wsDir, 'agents', 'councils', 'sessions'), { recursive: true });
  await writeFile(
    path.join(wsDir, 'brain', 'agent_sessions.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', sessions: [] }),
  );
  return { dir, wsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test('Test 1: createCouncilSession creates session folder with all 15 required artifacts', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createCouncilSession } = await import(pathToFileURL(SCRIPT).href);
    const r = await createCouncilSession({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      topic: 'Onboarding flow review',
      mode: 'roundtable-review',
      participants: ['qa-lead', 'user-advocate', 'product-strategist'],
    });
    assert.equal(r.ok, true);
    assert.match(r.sessionId, /^COUNCIL-\d{4}-\d{2}-\d{2}-\d+$/);
    for (const f of REQUIRED_FILES) {
      const p = path.join(r.sessionDir, f);
      assert.ok(await fileExists(p), `missing session artifact: ${f}`);
    }
    for (const d of REQUIRED_DIRS) {
      const p = path.join(r.sessionDir, d);
      assert.ok(await fileExists(p), `missing session dir: ${d}`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: session.json validates against council_session.schema.json', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createCouncilSession } = await import(pathToFileURL(SCRIPT).href);
    const r = await createCouncilSession({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      topic: 'API contract drift',
      mode: 'debate',
      participants: ['api-contract-analyst', 'qa-lead', 'adversarial-red-team-tester'],
    });
    const sessionJson = JSON.parse(await readFile(path.join(r.sessionDir, 'session.json'), 'utf8'));
    assert.match(sessionJson.id, /^COUNCIL-\d{4}-\d{2}-\d{2}-\d+$/);
    assert.equal(sessionJson.topic, 'API contract drift');
    assert.deepEqual(sessionJson.participants.sort(), [
      'adversarial-red-team-tester',
      'api-contract-analyst',
      'qa-lead',
    ]);
    assert.ok(['pending', 'active'].includes(sessionJson.status));
    assert.match(sessionJson.created_at, /^\d{4}-\d{2}-\d{2}T/);
    // AJV validation
    const { loadAllSchemas } = await import(
      pathToFileURL(path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')).href
    );
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/council_session.schema.json');
    assert.ok(validate, 'council_session schema must be registered');
    const ok = validate(sessionJson);
    assert.ok(ok, `session.json failed schema: ${JSON.stringify(validate.errors)}`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: createCouncilSession updates brain/agent_sessions.json', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createCouncilSession } = await import(pathToFileURL(SCRIPT).href);
    const r = await createCouncilSession({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      topic: 'Bug triage round',
      mode: 'bug-triage',
      participants: ['qa-lead', 'security-privacy-reviewer'],
    });
    const idx = JSON.parse(
      await readFile(path.join(ctx.wsDir, 'brain', 'agent_sessions.json'), 'utf8'),
    );
    assert.equal(idx.sessions.length, 1);
    assert.equal(idx.sessions[0].id, r.sessionId);
    assert.equal(idx.sessions[0].mode, 'bug-triage');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: missing required arg throws TESTATLAS_INVALID_ARGS', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createCouncilSession } = await import(pathToFileURL(SCRIPT).href);
    await assert.rejects(
      createCouncilSession({ cwd: ctx.dir, suiteCwd: REPO_ROOT }),
      (e) => e.code === 'TESTATLAS_INVALID_ARGS',
    );
    await assert.rejects(
      createCouncilSession({
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        topic: 't',
        mode: 'debate',
        // missing participants
      }),
      (e) => e.code === 'TESTATLAS_INVALID_ARGS',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: participants.json contains entries for every requested persona', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createCouncilSession } = await import(pathToFileURL(SCRIPT).href);
    const r = await createCouncilSession({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      topic: 'Release readiness',
      mode: 'release-readiness',
      participants: ['release-readiness-judge', 'qa-lead', 'security-privacy-reviewer'],
    });
    const p = JSON.parse(await readFile(path.join(r.sessionDir, 'participants.json'), 'utf8'));
    assert.equal(p.session_id, r.sessionId);
    assert.equal(p.participants.length, 3);
    const ids = p.participants.map((x) => x.persona_id).sort();
    assert.deepEqual(ids, ['qa-lead', 'release-readiness-judge', 'security-privacy-reviewer']);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: subsequent sessions on the same date increment the suffix', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createCouncilSession } = await import(pathToFileURL(SCRIPT).href);
    const r1 = await createCouncilSession({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      topic: 'first',
      mode: 'debate',
      participants: ['qa-lead'],
    });
    const r2 = await createCouncilSession({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      topic: 'second',
      mode: 'debate',
      participants: ['qa-lead'],
    });
    assert.notEqual(r1.sessionId, r2.sessionId);
    // Both must follow the COUNCIL-YYYY-MM-DD-N pattern.
    assert.match(r1.sessionId, /^COUNCIL-\d{4}-\d{2}-\d{2}-\d+$/);
    assert.match(r2.sessionId, /^COUNCIL-\d{4}-\d{2}-\d{2}-\d+$/);
  } finally {
    await ctx.cleanup();
  }
});
