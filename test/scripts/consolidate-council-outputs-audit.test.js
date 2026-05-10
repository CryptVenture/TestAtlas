// test/scripts/consolidate-council-outputs-audit.test.js
//
// Plan 22-01 Task 4 — DEC-005 regression.
//
// Pins the contract that consolidate-council.js MUST populate session.json
// `outputs_audit` field on close, comparing declared participants[] to
// materialized outputs/<persona-id>-output.{md,json} files.
//
// Wave 0 RED: outputs_audit is never populated. Wave 1 Task 4 will add it.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'consolidate-council.js');
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas', 'schemas', 'council_session.schema.json');

async function setupSession(opts) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-cc-outputs-audit-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  const sessionId = 'COUNCIL-2026-05-09-100';
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', sessionId);
  await mkdir(brainDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(brainDir, 'decisions.json'),
    `${JSON.stringify({ schema_version: '2.0.0', decisions: [] }, null, 2)}\n`,
  );
  await writeFile(
    path.join(brainDir, 'open_questions.json'),
    `${JSON.stringify({ schema_version: '2.0.0', questions: [] }, null, 2)}\n`,
  );

  // session.json minimal valid per council_session.schema.json
  await writeFile(
    path.join(sessionDir, 'session.json'),
    `${JSON.stringify(
      {
        id: sessionId,
        topic: 'test',
        participants: opts.participants,
        status: 'consolidating',
        created_at: '2026-05-09T00:00:00Z',
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(path.join(sessionDir, 'claims.jsonl'), '');
  await writeFile(path.join(sessionDir, 'votes.json'), JSON.stringify({ votes: [] }));
  await writeFile(path.join(sessionDir, 'disagreements.md'), '# Disagreements\n');

  // Optionally create outputs/ with selected files.
  if (opts.outputs !== null) {
    const outDir = path.join(sessionDir, 'outputs');
    await mkdir(outDir, { recursive: true });
    for (const out of opts.outputs ?? []) {
      await writeFile(path.join(outDir, out.name), out.content ?? '');
    }
  }

  return { dir, sessionId, sessionDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function readSession(sessionDir) {
  return JSON.parse(await readFile(path.join(sessionDir, 'session.json'), 'utf8'));
}

test('Test 1: partial materialization → outputs_audit lists missing persona', async () => {
  const ctx = await setupSession({
    participants: ['p1', 'p2', 'p3'],
    outputs: [
      { name: 'p1-output.md', content: 'x' },
      { name: 'p2-output.json', content: '{}' },
    ],
  });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const session = await readSession(ctx.sessionDir);
    assert.ok(session.outputs_audit, 'outputs_audit must be populated');
    assert.equal(session.outputs_audit.declared_participants_count, 3);
    assert.equal(session.outputs_audit.materialized_outputs_count, 2);
    assert.deepEqual(session.outputs_audit.missing_persona_ids, ['p3']);
    assert.equal(typeof session.outputs_audit.mismatch_reason, 'string');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: full materialization → missing_persona_ids:[] and no mismatch_reason', async () => {
  const ctx = await setupSession({
    participants: ['p1', 'p2'],
    outputs: [{ name: 'p1-output.md' }, { name: 'p2-output.json' }],
  });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const session = await readSession(ctx.sessionDir);
    assert.ok(session.outputs_audit, 'outputs_audit must be populated');
    assert.equal(session.outputs_audit.declared_participants_count, 2);
    assert.equal(session.outputs_audit.materialized_outputs_count, 2);
    assert.deepEqual(session.outputs_audit.missing_persona_ids, []);
    assert.ok(
      !('mismatch_reason' in session.outputs_audit),
      'mismatch_reason must be absent when no mismatch',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: zero participants → all-zero audit, no missing', async () => {
  const ctx = await setupSession({ participants: [], outputs: [] });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const session = await readSession(ctx.sessionDir);
    assert.ok(session.outputs_audit, 'outputs_audit must be populated');
    assert.equal(session.outputs_audit.declared_participants_count, 0);
    assert.equal(session.outputs_audit.materialized_outputs_count, 0);
    assert.deepEqual(session.outputs_audit.missing_persona_ids, []);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: outputs/ dir absent → all participants in missing, mismatch_reason set', async () => {
  const ctx = await setupSession({ participants: ['p1', 'p2'], outputs: null });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const session = await readSession(ctx.sessionDir);
    assert.ok(session.outputs_audit, 'outputs_audit must be populated');
    assert.equal(session.outputs_audit.materialized_outputs_count, 0);
    assert.deepEqual(
      session.outputs_audit.missing_persona_ids.sort(),
      ['p1', 'p2'],
      'all participants must appear in missing list',
    );
    assert.ok(
      typeof session.outputs_audit.mismatch_reason === 'string' &&
        session.outputs_audit.mismatch_reason.length > 0,
      'mismatch_reason must be a non-empty string when outputs/ absent',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: populated session.json validates against council_session.schema.json', async () => {
  const ctx = await setupSession({
    participants: ['p1', 'p2', 'p3'],
    outputs: [{ name: 'p1-output.md' }, { name: 'p2-output.json' }],
  });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const session = await readSession(ctx.sessionDir);

    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const ok = validate(session);
    assert.ok(
      ok,
      `populated session.json must validate against schema; errors: ${JSON.stringify(validate.errors)}`,
    );
  } finally {
    await ctx.cleanup();
  }
});
