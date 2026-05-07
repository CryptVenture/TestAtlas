// test/scripts/update-brain-after-command.test.js
//
// Plan 14-02 Task 3 — update-brain-after-command.js automates post-command
// brain update.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-brain-after-command.js');

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-update-brain-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      project: { name: 'test', repo_root: '.', primary_stack: [] },
      status: { phase: 'i', last_updated: '', active_environment: 'local' },
      counts: {
        domains: 0,
        flows: 0,
        issues: 0,
        critical_issues: 0,
        high_issues: 0,
        evidence_artifacts: 0,
        council_sessions: 0,
      },
      confidence: { overall: 'unknown', highest_risk_domains: [], stale_domains: [] },
    }),
  );
  await writeFile(path.join(brainDir, 'events.jsonl'), '');
  return { dir, wsDir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: updateBrainAfterCommand appends event + updates state.last_command', async () => {
  const ctx = await setupBrain();
  try {
    const { updateBrainAfterCommand } = await import(SCRIPT);
    const r = await updateBrainAfterCommand({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      command: 'init',
      actor: 'agent',
      summary: 'Workspace initialized.',
      artifactsRead: ['_testatlas/brain/state.json'],
      artifactsWritten: ['_testatlas/brain/manifest.json'],
    });
    assert.equal(r.ok, true);
    const events = await readFile(path.join(ctx.brainDir, 'events.jsonl'), 'utf8');
    const lines = events.split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const ev = JSON.parse(lines[0]);
    assert.equal(ev.command, 'init');
    assert.equal(ev.type, 'command_completed');
    const state = JSON.parse(await readFile(path.join(ctx.brainDir, 'state.json'), 'utf8'));
    assert.equal(state.status.last_command, 'init');
    assert.notEqual(state.status.last_updated, '');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: updateBrainAfterCommand handles aborted status', async () => {
  const ctx = await setupBrain();
  try {
    const { updateBrainAfterCommand } = await import(SCRIPT);
    const r = await updateBrainAfterCommand({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      command: 'plan',
      actor: 'agent',
      summary: 'User aborted.',
      status: 'aborted',
    });
    assert.equal(r.ok, true);
    const events = await readFile(path.join(ctx.brainDir, 'events.jsonl'), 'utf8');
    const ev = JSON.parse(events.split('\n').filter(Boolean)[0]);
    assert.equal(ev.type, 'command_aborted');
    assert.equal(ev.status, 'aborted');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: updateBrainAfterCommand fails when command missing', async () => {
  const ctx = await setupBrain();
  try {
    const { updateBrainAfterCommand } = await import(SCRIPT);
    await assert.rejects(
      updateBrainAfterCommand({
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        actor: 'agent',
        summary: 'x',
      }),
      (e) => e.code === 'TESTATLAS_INVALID_ARGS',
    );
  } finally {
    await ctx.cleanup();
  }
});
