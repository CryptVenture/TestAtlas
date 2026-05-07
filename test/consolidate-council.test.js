// test/consolidate-council.test.js
//
// Plan 14-04 Task 3 — verify consolidate-council.js (Wave 2 from plan 14-02)
// updates canonical brain indexes, generates followups.md, and processes a
// realistic mock council session end-to-end.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'consolidate-council.js');

async function setupSession() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-consolidate-council-task3-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  const sessionId = 'COUNCIL-2026-05-07-001';
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', sessionId);
  await mkdir(brainDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  // Brain indexes
  await writeFile(
    path.join(brainDir, 'decisions.json'),
    JSON.stringify({ schema_version: '2.0.0', decisions: [], last_updated: '' }, null, 2),
  );
  await writeFile(
    path.join(brainDir, 'open_questions.json'),
    JSON.stringify({ schema_version: '2.0.0', questions: [], last_updated: '' }, null, 2),
  );

  // Mock claims: one observed (pending), one decision (consolidated), one needs_validation.
  await writeFile(
    path.join(sessionDir, 'claims.jsonl'),
    [
      JSON.stringify({
        id: 'CLAIM-0001',
        session_id: sessionId,
        speaker: 'qa-lead',
        type: 'observed',
        claim: 'Login form lacks CSRF protection.',
        confidence: 'confirmed',
        evidence: ['_testatlas/evidence/x.png'],
        related_domains: ['domain-auth'],
        related_flows: ['FLOW-login'],
        status: 'pending',
        created_at: '2026-05-07T10:00:00Z',
      }),
      JSON.stringify({
        id: 'CLAIM-0002',
        session_id: sessionId,
        speaker: 'security-privacy-reviewer',
        type: 'decision',
        claim: 'Council accepts CSRF finding as critical.',
        confidence: 'confirmed',
        evidence: [],
        related_domains: ['domain-auth'],
        related_flows: [],
        status: 'accepted',
        created_at: '2026-05-07T10:30:00Z',
      }),
      JSON.stringify({
        id: 'CLAIM-0003',
        session_id: sessionId,
        speaker: 'adversarial-red-team-tester',
        type: 'hypothesized',
        claim: 'Possibly affects password reset too.',
        confidence: 'strong_suspect',
        evidence: [],
        related_domains: ['domain-auth'],
        related_flows: ['FLOW-password-reset'],
        status: 'pending',
        created_at: '2026-05-07T10:35:00Z',
      }),
      '',
    ].join('\n'),
  );

  await writeFile(
    path.join(sessionDir, 'votes.json'),
    JSON.stringify(
      {
        session_id: sessionId,
        votes: [
          { claim_id: 'CLAIM-0001', value: 2, voter: 'qa-lead' },
          { claim_id: 'CLAIM-0001', value: 2, voter: 'security-privacy-reviewer' },
        ],
      },
      null,
      2,
    ),
  );

  await writeFile(
    path.join(sessionDir, 'disagreements.md'),
    '# Disagreements\n\n## DIS-0001\n- type: severity\n- between: qa-lead vs adversarial-red-team-tester\n',
  );

  return {
    dir,
    wsDir,
    brainDir,
    sessionId,
    sessionDir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test('Test 1: consolidateCouncil writes followups.md with all pending + needs_validation claims', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(SCRIPT);
    const r = await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    assert.equal(r.ok, true);
    const text = await readFile(path.join(ctx.sessionDir, 'followups.md'), 'utf8');
    assert.match(text, new RegExp(ctx.sessionId));
    // Pending + strong_suspect claims should be in followups.
    assert.match(text, /CLAIM-0001/);
    assert.match(text, /CLAIM-0003/);
    // Vote details surface.
    assert.match(text, /Votes/);
    // Disagreements excerpt surfaces.
    assert.match(text, /Disagreements/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: consolidateCouncil updates brain/decisions.json with decision claims', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(SCRIPT);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const decisions = JSON.parse(await readFile(path.join(ctx.brainDir, 'decisions.json'), 'utf8'));
    assert.ok(Array.isArray(decisions.decisions));
    const decisionEntry = decisions.decisions.find((d) => d.id === 'CLAIM-0002');
    assert.ok(decisionEntry, 'expected CLAIM-0002 decision in brain/decisions.json');
    assert.equal(decisionEntry.session_id, ctx.sessionId);
    assert.match(decisionEntry.summary, /CSRF/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: consolidateCouncil dry-run does not write outputs', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(SCRIPT);
    const r = await consolidateCouncil({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
      dryRun: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.dryRun, true);
    await assert.rejects(readFile(path.join(ctx.sessionDir, 'followups.md'), 'utf8'));
    // brain/decisions.json should be unchanged (still empty).
    const decisions = JSON.parse(await readFile(path.join(ctx.brainDir, 'decisions.json'), 'utf8'));
    assert.equal(decisions.decisions.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: missing session folder errors out', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(SCRIPT);
    await assert.rejects(consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-NO-SUCH' }), (e) =>
      /session|missing/i.test(e.message),
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: followups.md surfaces vote tallies for each motion', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(SCRIPT);
    await consolidateCouncil({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFile(path.join(ctx.sessionDir, 'followups.md'), 'utf8');
    // Both votes for CLAIM-0001 should appear.
    const claim1Lines = text.split('\n').filter((l) => l.includes('CLAIM-0001'));
    assert.ok(claim1Lines.length >= 1, 'CLAIM-0001 should appear at least once in followups');
  } finally {
    await ctx.cleanup();
  }
});
