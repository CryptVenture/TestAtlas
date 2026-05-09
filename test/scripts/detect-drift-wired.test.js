// test/scripts/detect-drift-wired.test.js
//
// Plan 22-01 Task 8 (File A) — DEC-007 regression (script-level).
//
// Pins the contract that detect-drift.js, when invoked, populates
// _testatlas/brain/drift.json with last_updated + drift_records.
//
// File B (update-brain-after-command-detect-drift.test.js) tests the
// lifecycle wiring (--detect-drift flag in update-brain-after-command.js).
//
// Wave 0: detect-drift.js exists and works (tests A1, A4, A5 mostly GREEN
// today). The RED tests live in File B — the lifecycle hook isn't wired yet.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detectDrift } from '../../scripts/detect-drift.js';

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-detect-drift-wired-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });
  await writeFile(
    path.join(brainDir, 'drift.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: '', drift_records: [] }, null, 2)}\n`,
  );
  await writeFile(
    path.join(brainDir, 'domains.json'),
    `${JSON.stringify({ schema_version: '2.0.0', domains: [] }, null, 2)}\n`,
  );
  await writeFile(
    path.join(brainDir, 'flows.json'),
    `${JSON.stringify({ schema_version: '2.0.0', flows: [] }, null, 2)}\n`,
  );
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

// Helper: inject a fake git runner that returns canned stdout for diff + rev-parse.
function makeGitRunner({ changedFiles = [], head = 'abc1234' } = {}) {
  return async (file, args /* , opts */) => {
    if (file !== 'git') throw new Error(`unexpected exec: ${file}`);
    if (args[0] === 'diff' && args.includes('--name-only')) {
      return { stdout: `${changedFiles.join('\n')}\n`, stderr: '' };
    }
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
      return { stdout: `${head}\n`, stderr: '' };
    }
    throw new Error(`unhandled git args: ${args.join(' ')}`);
  };
}

test('A1: detectDrift bumps brain/drift.json#last_updated to ISO-8601', async () => {
  const ctx = await setupBrain();
  try {
    await detectDrift({
      cwd: ctx.dir,
      _inject: { gitRunner: makeGitRunner({ changedFiles: [] }) },
    });
    const drift = JSON.parse(await readFile(path.join(ctx.brainDir, 'drift.json'), 'utf8'));
    assert.match(
      drift.last_updated,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      'last_updated must be ISO-8601',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('A2: drift_records.length > 0 when git diff reports changed files', async () => {
  const ctx = await setupBrain();
  try {
    const r = await detectDrift({
      cwd: ctx.dir,
      _inject: {
        gitRunner: makeGitRunner({ changedFiles: ['src/a.js', 'src/b.js', 'README.md'] }),
      },
    });
    assert.ok(r.drift_records.length > 0, 'expected drift_records when files changed');
    const drift = JSON.parse(await readFile(path.join(ctx.brainDir, 'drift.json'), 'utf8'));
    assert.ok(drift.drift_records.length > 0);
  } finally {
    await ctx.cleanup();
  }
});

test('A3: clean tree → last_updated bumped, drift_records may be 0, no error', async () => {
  const ctx = await setupBrain();
  try {
    await detectDrift({
      cwd: ctx.dir,
      _inject: { gitRunner: makeGitRunner({ changedFiles: [] }) },
    });
    const drift = JSON.parse(await readFile(path.join(ctx.brainDir, 'drift.json'), 'utf8'));
    assert.notEqual(drift.last_updated, '');
    assert.equal(drift.drift_records.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('A4: idempotent — two consecutive invocations produce equivalent record content', async () => {
  const ctx = await setupBrain();
  try {
    const inject = { gitRunner: makeGitRunner({ changedFiles: ['src/a.js'] }) };
    await detectDrift({ cwd: ctx.dir, _inject: inject });
    const after1 = JSON.parse(await readFile(path.join(ctx.brainDir, 'drift.json'), 'utf8'));
    await detectDrift({ cwd: ctx.dir, _inject: inject });
    const after2 = JSON.parse(await readFile(path.join(ctx.brainDir, 'drift.json'), 'utf8'));
    // last_updated bumps + detected_at on each record bumps. Other fields stable.
    assert.equal(after1.drift_records.length, after2.drift_records.length);
    for (let i = 0; i < after1.drift_records.length; i++) {
      const a = { ...after1.drift_records[i] };
      const b = { ...after2.drift_records[i] };
      delete a.detected_at;
      delete b.detected_at;
      assert.deepEqual(a, b);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('A5: degraded mode — gitChangedFiles returns null → degradedMode "mtime-only"', async () => {
  const ctx = await setupBrain();
  try {
    // Inject a git runner that always throws (simulating git absent).
    const failingGit = async () => {
      const e = new Error('ENOENT');
      e.code = 'ENOENT';
      throw e;
    };
    const r = await detectDrift({
      cwd: ctx.dir,
      _inject: { gitRunner: failingGit },
    });
    assert.equal(r.degradedMode, 'mtime-only');
  } finally {
    await ctx.cleanup();
  }
});
