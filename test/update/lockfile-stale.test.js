// test/update/lockfile-stale.test.js
//
// Plan 07-03 Task 1 — Stale-detect via PID liveness AND age (UPDATE-06).
//
// Two stale triggers (either alone releases the lock):
//   1. PID not running (process.kill(pid, 0) → ESRCH).
//   2. acquiredAt > 24h ago.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { WORKSPACE_LOCK_PATH } from '../../scripts/lib/constants.js';
import { acquireLock, isLocked } from '../../scripts/lib/lockfile.js';

async function makeTmp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-lockfile-stale-'));
  await mkdir(path.join(dir, '_testatlas'), { recursive: true });
  return dir;
}

async function plantLock(target, payload) {
  const lockPath = path.join(target, WORKSPACE_LOCK_PATH);
  await writeFile(lockPath, JSON.stringify(payload), 'utf8');
}

// A pid we are extremely unlikely to find on any real system. POSIX max pid is
// typically 32768 by default; 999999 is well above any plausible value.
const NONEXISTENT_PID = 999999;

test('lockfile-stale: lock with acquiredAt 25h ago is stale (age trigger)', async (t) => {
  const target = await makeTmp();
  t.after(() => rm(target, { recursive: true, force: true }));
  const stale = new Date(Date.now() - 25 * 3_600_000).toISOString();
  await plantLock(target, { pid: process.pid, holdReason: 'update', acquiredAt: stale });
  const state = await isLocked(target);
  assert.equal(state.held, false);
  assert.equal(state.stale, true);
  assert.equal(state.holdReason, 'update');
});

test('lockfile-stale: lock held by non-running PID is stale (pid trigger)', async (t) => {
  const target = await makeTmp();
  t.after(() => rm(target, { recursive: true, force: true }));
  const fresh = new Date().toISOString();
  await plantLock(target, { pid: NONEXISTENT_PID, holdReason: 'update', acquiredAt: fresh });
  const state = await isLocked(target);
  assert.equal(state.held, false);
  assert.equal(state.stale, true);
  assert.equal(state.pid, NONEXISTENT_PID);
});

test('lockfile-stale: lock held by current process is fresh (NOT stale)', async (t) => {
  const target = await makeTmp();
  t.after(() => rm(target, { recursive: true, force: true }));
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  const state = await isLocked(target);
  assert.equal(state.held, true);
  assert.notEqual(state.stale, true);
});

test('lockfile-stale: stale lock allows re-acquire by another caller', async (t) => {
  const target = await makeTmp();
  t.after(() => rm(target, { recursive: true, force: true }));
  // Plant stale-by-pid lock.
  const fresh = new Date().toISOString();
  await plantLock(target, { pid: NONEXISTENT_PID, holdReason: 'update', acquiredAt: fresh });
  // Should succeed — the stale lock is overwritten.
  await acquireLock(target, { pid: process.pid, holdReason: 'update' });
  const state = await isLocked(target);
  assert.equal(state.held, true);
  assert.equal(state.pid, process.pid);
});
