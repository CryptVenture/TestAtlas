// test/scripts/consolidate-council-votes-render.test.js
//
// Plan 22-01 Task 5 — DRIFT-011 regression (motion-keyed votes rendering).
//
// Pins the contract that consolidate-council.js's followups.md "Votes" block
// MUST render motion-keyed `votes.motions[].votes[]` shape AND preserve
// back-compat for the legacy flat `votes.votes[]` shape.
//
// Wave 0 RED: current code only reads `votes.votes` (flat). Tests 1-2 fail.
// Tests 3-5 (back-compat) pass GREEN today.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'consolidate-council.js');

async function setupSession(votes) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-cc-votes-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  const sessionId = 'COUNCIL-VOTES-001';
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
  await writeFile(path.join(sessionDir, 'claims.jsonl'), '');
  await writeFile(path.join(sessionDir, 'votes.json'), JSON.stringify(votes));
  await writeFile(path.join(sessionDir, 'disagreements.md'), '# Disagreements\n');
  return { dir, sessionId, sessionDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function readFollowups(sessionDir) {
  return await readFile(path.join(sessionDir, 'followups.md'), 'utf8');
}

test('Test 1: motion-keyed — single motion with one vote renders persona/value/rationale', async () => {
  const ctx = await setupSession({
    motions: [
      {
        motion_id: 'MOTION-001',
        votes: [{ persona: 'p', value: 'yea', rationale: 'r' }],
      },
    ],
  });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFollowups(ctx.sessionDir);
    assert.match(text, /MOTION-001/, 'followups.md must reference motion id');
    assert.match(text, /p/, 'followups.md must reference persona');
    assert.match(text, /yea/, 'followups.md must reference vote value');
    assert.doesNotMatch(text, /no votes cast/, 'must NOT render placeholder when motions present');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: motion-keyed — 2 motions × 3 votes each → 6 vote lines rendered', async () => {
  const ctx = await setupSession({
    motions: [
      {
        motion_id: 'MOTION-A',
        votes: [
          { persona: 'p1', value: 'yea' },
          { persona: 'p2', value: 'nay' },
          { persona: 'p3', value: 'abstain' },
        ],
      },
      {
        motion_id: 'MOTION-B',
        votes: [
          { persona: 'p1', value: 'yea' },
          { persona: 'p2', value: 'yea' },
          { persona: 'p3', value: 'yea' },
        ],
      },
    ],
  });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFollowups(ctx.sessionDir);
    // Count distinct vote-line markers — each rendered vote should reference a persona+value pair.
    const motionAMatches = (text.match(/MOTION-A/g) ?? []).length;
    const motionBMatches = (text.match(/MOTION-B/g) ?? []).length;
    assert.ok(
      motionAMatches >= 1 && motionBMatches >= 1,
      `expected both MOTION-A and MOTION-B to render; A=${motionAMatches}, B=${motionBMatches}`,
    );
    // Each persona reference should appear at least once per motion they voted in
    // (3 personas × 2 motions = 6 persona-occurrence floor).
    const personaP1 = (text.match(/p1/g) ?? []).length;
    const personaP2 = (text.match(/p2/g) ?? []).length;
    const personaP3 = (text.match(/p3/g) ?? []).length;
    assert.ok(
      personaP1 >= 2 && personaP2 >= 2 && personaP3 >= 2,
      `each persona must appear in both motions; got p1=${personaP1}, p2=${personaP2}, p3=${personaP3}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: back-compat — flat votes.votes[] still renders', async () => {
  const ctx = await setupSession({
    votes: [{ claim_id: 'CLAIM-1', value: 'yea' }],
  });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFollowups(ctx.sessionDir);
    assert.match(text, /CLAIM-1/);
    assert.match(text, /yea/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: empty motions — placeholder rendered', async () => {
  const ctx = await setupSession({ motions: [] });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFollowups(ctx.sessionDir);
    assert.match(text, /no votes cast/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: empty flat votes — placeholder rendered (existing back-compat)', async () => {
  const ctx = await setupSession({ votes: [] });
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFollowups(ctx.sessionDir);
    assert.match(text, /no votes cast/);
  } finally {
    await ctx.cleanup();
  }
});
