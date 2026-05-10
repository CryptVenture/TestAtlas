// test/scripts/consolidate-council-decisions.test.js
//
// Plan 22-01 Task 3 — DEC-004 regression (CRITICAL).
//
// Pins the contract that consolidate-council.js's decisions filter MUST
// also accept claims of type 'observed'/'inferred'/'hypothesized' when
// status==='accepted' OR confidence==='confirmed', in addition to the
// existing 'decision'/'consolidated_decision' types.
//
// Wave 0 RED: the current filter (consolidate-council.js:137) only accepts
// type === 'decision' || 'consolidated_decision'. Tests 1-4 produce zero
// decisions. Tests 5-7 (back-compat) pass GREEN today.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'consolidate-council.js');

async function setupSession(claims) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-cc-decisions-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', 'COUNCIL-TEST-001');
  await mkdir(brainDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(brainDir, 'decisions.json'),
    `${JSON.stringify({ schema_version: '2.0.0', decisions: [], last_updated: '' }, null, 2)}\n`,
  );
  await writeFile(
    path.join(brainDir, 'open_questions.json'),
    `${JSON.stringify({ schema_version: '2.0.0', questions: [] }, null, 2)}\n`,
  );
  // Author claims.jsonl from supplied array.
  const lines = claims
    .map((c) =>
      JSON.stringify({
        id: c.id,
        session_id: 'COUNCIL-TEST-001',
        speaker: c.speaker ?? 'tester',
        type: c.type,
        claim: c.claim ?? `claim ${c.id}`,
        confidence: c.confidence,
        status: c.status,
        created_at: '2026-05-09T00:00:00Z',
      }),
    )
    .join('\n');
  await writeFile(path.join(sessionDir, 'claims.jsonl'), `${lines}\n`);
  await writeFile(path.join(sessionDir, 'votes.json'), JSON.stringify({ votes: [] }));
  await writeFile(path.join(sessionDir, 'disagreements.md'), '# Disagreements\n');
  return { dir, sessionDir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function readDecisions(brainDir) {
  return JSON.parse(await readFile(path.join(brainDir, 'decisions.json'), 'utf8'));
}

test('Test 1: positive — accepted observed claim → 1 decision entry (DEC-004 fix)', async () => {
  const ctx = await setupSession([
    { id: 'CLAIM-001', type: 'observed', status: 'accepted', confidence: 'confirmed' },
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    assert.equal(decisions.decisions.length, 1, 'accepted observed claim must produce 1 decision');
    assert.equal(decisions.decisions[0].id, 'CLAIM-001');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: positive — strong-suspect hypothesized → REJECTED (only confirmed/accepted promote)', async () => {
  // Per RESEARCH §"DEC-004 Verdict — Path (a)" the broadened filter accepts
  // observed/inferred/hypothesized when status='accepted' OR confidence='confirmed'.
  // 'strong-suspect' alone is NOT a promote trigger; this guards over-acceptance.
  const ctx = await setupSession([
    {
      id: 'CLAIM-002',
      type: 'hypothesized',
      status: 'pending',
      confidence: 'strong-suspect',
    },
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    assert.equal(
      decisions.decisions.length,
      0,
      'strong-suspect alone (no accepted status, no confirmed confidence) must NOT promote',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: negative — pending observed weak-suspect → 0 decisions', async () => {
  const ctx = await setupSession([
    {
      id: 'CLAIM-003',
      type: 'observed',
      status: 'pending',
      confidence: 'weak-suspect',
    },
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    assert.equal(decisions.decisions.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: negative — disputed type stays rejected even if accepted', async () => {
  const ctx = await setupSession([
    {
      id: 'CLAIM-004',
      type: 'disputed',
      status: 'accepted',
      confidence: 'confirmed',
    },
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    assert.equal(decisions.decisions.length, 0, 'disputed type must NOT promote even if accepted');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: back-compat — type=decision still produces decision (existing path)', async () => {
  const ctx = await setupSession([
    { id: 'CLAIM-005', type: 'decision', status: 'pending', confidence: 'unknown' },
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    assert.equal(decisions.decisions.length, 1);
    assert.equal(decisions.decisions[0].id, 'CLAIM-005');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: back-compat — type=consolidated_decision still produces decision', async () => {
  const ctx = await setupSession([
    {
      id: 'CLAIM-006',
      type: 'consolidated_decision',
      status: 'pending',
      confidence: 'unknown',
    },
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    assert.equal(decisions.decisions.length, 1);
    assert.equal(decisions.decisions[0].id, 'CLAIM-006');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 7: mixed fixture — 4 accepted/confirmed (observed/inferred/hypothesized) + 1 pending + 1 disputed-accepted + 1 decision-type → 5 decisions', async () => {
  const ctx = await setupSession([
    { id: 'CLAIM-A', type: 'observed', status: 'accepted', confidence: 'confirmed' },
    { id: 'CLAIM-B', type: 'inferred', status: 'accepted', confidence: 'confirmed' },
    { id: 'CLAIM-C', type: 'hypothesized', status: 'accepted', confidence: 'confirmed' },
    { id: 'CLAIM-D', type: 'observed', status: 'pending', confidence: 'confirmed' }, // confidence triggers
    { id: 'CLAIM-E', type: 'observed', status: 'pending', confidence: 'weak-suspect' }, // rejected
    { id: 'CLAIM-F', type: 'disputed', status: 'accepted', confidence: 'confirmed' }, // disputed → rejected
    { id: 'CLAIM-G', type: 'decision', status: 'pending', confidence: 'unknown' }, // back-compat
  ]);
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-TEST-001' });
    const decisions = await readDecisions(ctx.brainDir);
    // Expected: A, B, C, D (4 accepted/confirmed observed-class) + G (decision-type) = 5
    const ids = decisions.decisions.map((d) => d.id).sort();
    assert.deepEqual(ids, ['CLAIM-A', 'CLAIM-B', 'CLAIM-C', 'CLAIM-D', 'CLAIM-G']);
  } finally {
    await ctx.cleanup();
  }
});
