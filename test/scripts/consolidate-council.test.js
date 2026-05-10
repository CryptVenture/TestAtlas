// test/scripts/consolidate-council.test.js
//
// Plan 14-02 Task 2 — consolidate-council.js reads a council session folder,
// updates canonical brain indexes, and writes followups.md.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'consolidate-council.js');

async function setupSession() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-consolidate-council-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', 'COUNCIL-001');
  await mkdir(brainDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(brainDir, 'decisions.json'),
    JSON.stringify({ schema_version: '2.0.0', decisions: [] }),
  );
  await writeFile(
    path.join(brainDir, 'open_questions.json'),
    JSON.stringify({ schema_version: '2.0.0', questions: [] }),
  );
  // Minimal session inputs
  await writeFile(
    path.join(sessionDir, 'claims.jsonl'),
    [
      JSON.stringify({
        id: 'CLAIM-1',
        session_id: 'COUNCIL-001',
        speaker: 'security-reviewer',
        type: 'observation',
        claim: 'Auth flow lacks CSRF protection.',
        confidence: 'strong_suspect',
        status: 'pending',
        created_at: '2026-05-07T00:00:00Z',
      }),
      '',
    ].join('\n'),
  );
  await writeFile(path.join(sessionDir, 'votes.json'), JSON.stringify({ votes: [] }));
  await writeFile(path.join(sessionDir, 'disagreements.md'), '# Disagreements\n');
  return { dir, sessionDir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: consolidateCouncil writes followups.md and updates brain', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    const r = await consolidateCouncil({ cwd: ctx.dir, sessionId: 'COUNCIL-001' });
    assert.equal(r.ok, true);
    const followupsPath = path.join(ctx.sessionDir, 'followups.md');
    const text = await readFile(followupsPath, 'utf8');
    assert.match(text, /COUNCIL-001/);
    assert.match(text, /Auth flow lacks CSRF protection/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: consolidateCouncil dry-run does not write', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    const r = await consolidateCouncil({
      cwd: ctx.dir,
      sessionId: 'COUNCIL-001',
      dryRun: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.dryRun, true);
    const followupsPath = path.join(ctx.sessionDir, 'followups.md');
    await assert.rejects(readFile(followupsPath, 'utf8'));
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: missing session folder errors out', async () => {
  const ctx = await setupSession();
  try {
    const { consolidateCouncil } = await import(pathToFileURL(SCRIPT).href);
    await assert.rejects(consolidateCouncil({ cwd: ctx.dir, sessionId: 'NO-SUCH-SESSION' }), (e) =>
      /session|missing/i.test(e.message),
    );
  } finally {
    await ctx.cleanup();
  }
});
