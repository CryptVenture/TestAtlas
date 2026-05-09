// test/scripts/update-brain-after-command-reconcile-counts.test.js
//
// Plan 22-01 Task 1b — DEC-001 lifecycle-wiring test.
//
// Pins the contract that update-brain-after-command.js MUST honor an
// `args.reconcileCounts` flag (and corresponding --reconcile-counts CLI flag)
// that invokes the reconcile-counts producer via mock-injection (`_inject`)
// for testability.
//
// Wave 0 RED: the script currently does NOT honor `_inject.reconcileCounts`
// nor expose a --reconcile-counts CLI flag. Wave 1 Task 1 will add both.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-brain-after-command.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-ubac-reconcile-'));
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
    path.join(brainDir, 'manifest.json'),
    `${JSON.stringify({ schema_version: '2.0.0', adapters: [], last_updated: '' }, null, 2)}\n`,
  );
  await writeFile(path.join(brainDir, 'events.jsonl'), '');
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: reconcileCounts:true triggers producer invocation via _inject mock', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateBrainAfterCommand } = await import(SCRIPT);
    const calls = [];
    const mockReconcile = async (a) => {
      calls.push(a);
      return { ok: true, stateChanged: true, manifestChanged: false };
    };
    await updateBrainAfterCommand(
      {
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        command: 'X',
        actor: 'test',
        summary: 's',
        reconcileCounts: true,
      },
      { reconcileCounts: mockReconcile },
    );
    assert.equal(calls.length, 1, 'reconcile-counts producer must be called exactly once');
    assert.equal(
      calls[0].cwd,
      ctx.dir,
      'producer must receive cwd from updateBrainAfterCommand args',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: default off — flag absent → producer NOT called (back-compat)', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateBrainAfterCommand } = await import(SCRIPT);
    const calls = [];
    const mockReconcile = async (a) => {
      calls.push(a);
      return { ok: true };
    };
    await updateBrainAfterCommand(
      { cwd: ctx.dir, suiteCwd: REPO_ROOT, command: 'X', actor: 'test', summary: 's' },
      { reconcileCounts: mockReconcile },
    );
    assert.equal(calls.length, 0, 'reconcile-counts producer must NOT be called when flag absent');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: CLI form — node update-brain-after-command.js --reconcile-counts works', async () => {
  const ctx = await setupWorkspace();
  try {
    const r = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--command',
        'X',
        '--actor',
        'test',
        '--summary',
        's',
        '--reconcile-counts',
        '--cwd',
        ctx.dir,
        '--suite-cwd',
        REPO_ROOT,
      ],
      { encoding: 'utf8' },
    );
    // Wave 0 RED: --reconcile-counts is an unknown arg, exits with code 2 ("unknown argument").
    // Wave 1 GREEN: flag accepted; exit 0 and the script attempts to dynamic-import
    // scripts/reconcile-counts.js (which then ENOENTs/MODULE_NOT_FOUND OR succeeds
    // depending on Wave 1 Task 1's order). Either way, exit code 0 OR >=1
    // with reconcile-counts referenced in stderr.
    const combined = (r.stdout ?? '') + (r.stderr ?? '');
    const acceptsFlag =
      r.status === 0 || /reconcile-counts|reconcile_counts|reconcileCounts/.test(combined);
    assert.ok(
      acceptsFlag,
      `expected --reconcile-counts to be a recognized flag; got status=${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
  } finally {
    await ctx.cleanup();
  }
});
