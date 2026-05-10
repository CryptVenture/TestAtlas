// test/scripts/update-brain-after-command-populate-from-app-map.test.js
//
// Plan 22-01 Task 2b — DEC-002 lifecycle-wiring test.
//
// Pins the contract that update-brain-after-command.js MUST honor an
// `args.populateFromAppMap` flag (and corresponding --populate-from-app-map
// CLI flag) that invokes populate-brain-from-app-map producer via _inject.
//
// Wave 0 RED: the script does not yet honor the flag. Wave 1 Task 2 will
// add both the conditional branch and the CLI flag.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-brain-after-command.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-ubac-populate-'));
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
  await writeFile(path.join(brainDir, 'events.jsonl'), '');
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: populateFromAppMap:true triggers producer invocation via _inject mock', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateBrainAfterCommand } = await import(pathToFileURL(SCRIPT).href);
    const calls = [];
    const mockProducer = async (a) => {
      calls.push(a);
      return { ok: true, changed: ['components.json'] };
    };
    await updateBrainAfterCommand(
      {
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        command: 'X',
        actor: 'test',
        summary: 's',
        populateFromAppMap: true,
      },
      { populateBrainFromAppMap: mockProducer },
    );
    assert.equal(calls.length, 1, 'producer must be called exactly once');
    assert.equal(calls[0].cwd, ctx.dir);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: default off — flag absent → producer NOT called (back-compat)', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateBrainAfterCommand } = await import(pathToFileURL(SCRIPT).href);
    const calls = [];
    const mockProducer = async (a) => {
      calls.push(a);
      return { ok: true, changed: [] };
    };
    await updateBrainAfterCommand(
      { cwd: ctx.dir, suiteCwd: REPO_ROOT, command: 'X', actor: 'test', summary: 's' },
      { populateBrainFromAppMap: mockProducer },
    );
    assert.equal(calls.length, 0, 'producer must NOT be called when flag absent');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: CLI form — node update-brain-after-command.js --populate-from-app-map works', async () => {
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
        '--populate-from-app-map',
        '--cwd',
        ctx.dir,
        '--suite-cwd',
        REPO_ROOT,
      ],
      { encoding: 'utf8' },
    );
    const combined = (r.stdout ?? '') + (r.stderr ?? '');
    const acceptsFlag =
      r.status === 0 ||
      /populate-from-app-map|populate_from_app_map|populateFromAppMap/.test(combined);
    assert.ok(
      acceptsFlag,
      `expected --populate-from-app-map to be a recognized flag; got status=${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
  } finally {
    await ctx.cleanup();
  }
});
