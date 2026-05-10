// test/scripts/update-brain-after-command-detect-drift.test.js
//
// Plan 22-01 Task 8 (File B) — DEC-007 lifecycle integration.
//
// Pins the contract that update-brain-after-command.js MUST honor an
// `args.detectDrift` flag (and corresponding --detect-drift CLI flag) that
// invokes scripts/detect-drift.js via mock-injection (`_inject.detectDrift`)
// for testability.
//
// Wave 0 RED: the lifecycle hook does NOT yet call detect-drift. Wave 1
// will add an `if (args.detectDrift)` branch.
//
// File A (detect-drift-wired.test.js) tests the producer behavior.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-brain-after-command.js');

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-ubac-detect-drift-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  await writeFile(
    path.join(brainDir, 'state.json'),
    `${JSON.stringify(
      {
        schema_version: '2.0.0',
        status: { phase: '', last_updated: '', last_command: '' },
        counts: { council_sessions: 0, evidence_artifacts: 0 },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(brainDir, 'drift.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: '', drift_records: [] }, null, 2)}\n`,
  );
  await writeFile(path.join(brainDir, 'events.jsonl'), '');
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('B1: detectDrift:true triggers detect-drift producer invocation via _inject mock', async () => {
  const ctx = await setupBrain();
  try {
    const { updateBrainAfterCommand } = await import(SCRIPT);
    const calls = [];
    const mockProducer = async (a) => {
      calls.push(a);
      return { ok: true, drift_records: [] };
    };
    await updateBrainAfterCommand(
      {
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        command: 'explore-codebase',
        actor: 'test',
        summary: 's',
        detectDrift: true,
      },
      { detectDrift: mockProducer },
    );
    assert.equal(calls.length, 1, 'detect-drift producer must be called exactly once');
    assert.equal(calls[0].cwd, ctx.dir);
  } finally {
    await ctx.cleanup();
  }
});

test('B2: default off — drift.json untouched when flag absent', async () => {
  const ctx = await setupBrain();
  try {
    const before = await readFile(path.join(ctx.brainDir, 'drift.json'));
    const { updateBrainAfterCommand } = await import(SCRIPT);
    await updateBrainAfterCommand({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      command: 'explore-codebase',
      actor: 'test',
      summary: 's',
    });
    const after = await readFile(path.join(ctx.brainDir, 'drift.json'));
    assert.ok(before.equals(after), 'drift.json must be untouched when detectDrift flag absent');
  } finally {
    await ctx.cleanup();
  }
});

test('B3: existing drift-detection contract preserved (regression pin)', async () => {
  // Cross-reference pin: existing test/drift-detection.test.js exercises
  // detect-drift.js end-to-end. Wave 1 must not regress that contract.
  // We assert here that the detect-drift.js module remains importable
  // and exports `detectDrift` — a minimal regression check.
  const mod = await import(path.join(REPO_ROOT, 'scripts', 'detect-drift.js'));
  assert.equal(typeof mod.detectDrift, 'function', 'detect-drift.js must export detectDrift');
});
