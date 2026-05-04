// test/update/lockfile.test.js
//
// Plan 07-03 Task 1 — _testatlas/.lock acquire/release/inspect (UPDATE-06).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { WORKSPACE_LOCK_PATH } from '../../scripts/lib/constants.js';
import { acquireLock, isLocked, releaseLock } from '../../scripts/lib/lockfile.js';

async function makeTmp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-lockfile-'));
  await mkdir(path.join(dir, '_testatlas'), { recursive: true });
  return dir;
}

async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true });
}

test('lockfile: acquireLock writes valid JSON with pid/holdReason/acquiredAt', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  await acquireLock(target, { pid: 12345, holdReason: 'update' });
  const lockPath = path.join(target, WORKSPACE_LOCK_PATH);
  const raw = await readFile(lockPath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.pid, 12345);
  assert.equal(parsed.holdReason, 'update');
  assert.match(parsed.acquiredAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('lockfile: isLocked returns {held:false} when lockfile absent', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  const state = await isLocked(target);
  assert.equal(state.held, false);
});

test('lockfile: double acquireLock by current process throws Lock held', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  // Use current process.pid so liveness check classifies as held (not stale).
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  await assert.rejects(
    () => acquireLock(target, { pid: process.pid, holdReason: 'update' }),
    /Lock held/i,
  );
});

test('lockfile: releaseLock removes the lockfile and is idempotent', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  await releaseLock(target);
  const state = await isLocked(target);
  assert.equal(state.held, false);
  // Idempotent: releaseLock again with no lockfile should not throw.
  await releaseLock(target);
});

test('lockfile: after release, acquire again succeeds', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  await releaseLock(target);
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  const state = await isLocked(target);
  assert.equal(state.held, true);
});

test('lockfile: held lock by current pid reports ageMin', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  await acquireLock(target, { pid: process.pid, holdReason: 'validate' });
  const state = await isLocked(target);
  assert.equal(state.held, true);
  assert.equal(state.pid, process.pid);
  assert.equal(state.holdReason, 'validate');
  assert.equal(typeof state.ageMin, 'number');
  assert.ok(state.ageMin >= 0 && state.ageMin < 60);
});

test('lockfile: lockfile has correct relative path under _testatlas/', async (t) => {
  const target = await makeTmp();
  t.after(() => cleanup(target));
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  // Confirm it lives at exactly _testatlas/.lock per WORKSPACE_LOCK_PATH.
  assert.equal(WORKSPACE_LOCK_PATH, '_testatlas/.lock');
  const lockPath = path.join(target, '_testatlas', '.lock');
  const raw = await readFile(lockPath, 'utf8');
  assert.ok(raw.length > 0);
});
