// scripts/lib/lockfile.js
//
// Plan 07-03 Task 1 — workspace lockfile (UPDATE-06).
// Plan 12-02 — explicit narrow exception to the two-tree invariant + mkdir-parent.
//
// =============================================================================
//  TWO-TREE INVARIANT — EXPLICIT NARROW EXCEPTION
// =============================================================================
//
//  TestAtlas's two-tree invariant (see workspace-guard.js) forbids the
//  suite-update flow from mutating workspace state at `_testatlas/`. The
//  workspace lockfile at `_testatlas/.lock` is the SINGLE, DOCUMENTED
//  exception to that invariant: it is a per-process advisory file used to
//  coordinate concurrent `runUpdate` invocations, NOT user/workspace data.
//
//  We deliberately do NOT call the workspace-guard's `assertNotUpdate` helper
//  with the update-flow context here. The workspace-guard's existing contract
//  treats the update-flow context string as the FORBIDDEN context (the helper
//  is named `assertNotUpdate` precisely because it asserts the caller is NOT
//  in update context); calling it here would throw
//  `TESTATLAS_TWO_TREE_VIOLATION` on every legitimate update flow's lock
//  acquisition. See RESEARCH.md Phase 12 Open Q §1 (Option B — document the
//  exception, do not bypass the guard).
//
//  Mitigation against silent regression: a regression test at
//  `test/update/lockfile-workspace-guard.test.js` greps `scripts/lib/**/*.js`
//  for the literal forbidden-context callsite and fails the suite if any
//  such callsite is added.
//
// =============================================================================
//
// `_testatlas/.lock` is a JSON file with `{pid, holdReason, acquiredAt}` where
// `acquiredAt` is an ISO-8601 string. Long-running operations that mutate the
// workspace acquire the lock; concurrent attempts throw with a diagnostic
// `Lock held: pid=..., reason=..., age=...min` so users can see who holds it
// and decide whether to wait or force-take.
//
// Stale detection (either trigger releases the lock automatically):
//   1. PID-based: `process.kill(pid, 0)` throws ESRCH → owner gone.
//      `process.kill` works on Windows (signal 0 is just an existence check).
//   2. Age-based: `acquiredAt` more than STALE_HOURS ago → owner abandoned.
//
// We deliberately avoid `proper-lockfile` / `lockfile-lock` (transitive deps for
// what is a JSON file + PID check). The lockfile is human-inspectable per
// RESEARCH §Pattern 12.
//
// `acquireLock` is NOT itself atomic across processes — two concurrent
// acquireLock calls could both pass the `isLocked` check and race the
// writeFile. For Phase 7 the only consumer is `update.js`, which is invoked
// by humans (or CI), not by autonomous concurrent processes. If a stronger
// guarantee is needed in v2, switch to `open(file, 'wx')` to fail-fast on
// EEXIST.

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_LOCK_PATH } from './constants.js';

const STALE_HOURS = 24;

function lockPath(target) {
  return path.join(target, WORKSPACE_LOCK_PATH);
}

/**
 * Probe whether `pid` is alive on the host OS.
 *
 * `process.kill(pid, 0)` is the POSIX existence-check idiom — signal 0 doesn't
 * actually deliver a signal; it just verifies the kernel can route to the pid.
 * Behavior:
 *   - pid alive and we own it → returns void (caller treats as alive).
 *   - pid alive but we lack permission → throws EPERM (still alive).
 *   - pid dead → throws ESRCH.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = exists but we don't have permission to signal — still alive.
    return e.code === 'EPERM';
  }
}

/**
 * @typedef {Object} LockState
 * @property {boolean} held         True iff a fresh lock is currently held.
 * @property {boolean} [stale]      True iff a lockfile exists but is stale.
 * @property {number}  [pid]        Owner PID (when state was found on disk).
 * @property {string}  [holdReason] Owner-supplied reason for the hold.
 * @property {string}  [acquiredAt] ISO timestamp when lock was acquired.
 * @property {number}  [ageMin]     Lock age in minutes (held=true case).
 */

/**
 * Inspect the lockfile state for a target without mutating anything.
 *
 * Returns:
 *   - `{held: false}` when no lockfile exists.
 *   - `{held: false, stale: true, ...data}` when the lockfile exists but is
 *     stale (age>24h OR pid dead). Caller may overwrite via `acquireLock`.
 *   - `{held: true, ageMin, ...data}` when the lockfile is fresh and the owner
 *     pid is alive.
 *
 * @param {string} target
 * @returns {Promise<LockState>}
 */
export async function isLocked(target) {
  const file = lockPath(target);
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { held: false };
    throw e;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Corrupt lockfile — treat as stale so callers can recover.
    return { held: false, stale: true };
  }
  const ageMs = Date.now() - new Date(data.acquiredAt).getTime();
  const ageHours = ageMs / 3_600_000;
  if (Number.isNaN(ageMs) || ageHours > STALE_HOURS) {
    return { held: false, stale: true, ...data };
  }
  if (!isPidAlive(data.pid)) {
    return { held: false, stale: true, ...data };
  }
  return { held: true, ageMin: Math.floor(ageMs / 60_000), ...data };
}

/**
 * Acquire the workspace lock. Throws if a fresh (non-stale) lock is already
 * held; otherwise (re-)writes the lockfile with the supplied identity.
 *
 * Two-tree invariant: writes to `<target>/_testatlas/.lock`, which is the
 * single explicit narrow exception to the two-tree invariant (see top-of-file
 * comment block + workspace-guard.js). DO NOT add the workspace-guard
 * forbidden-context callsite here — it would throw on every legitimate
 * update flow.
 *
 * Plan 12-02: `mkdir(parent, {recursive:true})` is called BEFORE the
 * `writeFile` so global installs and fresh `.testatlas/`-only targets that do
 * not pre-exist `_testatlas/` no longer ENOENT on the lock acquisition. This
 * is defense-in-depth: even when the caller has resolved a global lock target
 * via `update-core.js`'s `isGlobal` branch, mkdir-parent guarantees the parent
 * directory exists at write time.
 *
 * @param {string} target
 * @param {{ pid: number, holdReason: string }} owner
 * @returns {Promise<void>}
 */
export async function acquireLock(target, { pid, holdReason }) {
  if (typeof pid !== 'number' || !Number.isFinite(pid)) {
    throw new TypeError('lockfile.acquireLock: `pid` must be a finite number');
  }
  if (typeof holdReason !== 'string' || holdReason.length === 0) {
    throw new TypeError('lockfile.acquireLock: `holdReason` must be a non-empty string');
  }
  const state = await isLocked(target);
  if (state.held) {
    const err = new Error(
      `Lock held: pid=${state.pid}, reason=${state.holdReason}, age=${state.ageMin}min`,
    );
    err.code = 'TESTATLAS_LOCK_HELD';
    err.lockState = state;
    throw err;
  }
  const file = lockPath(target);
  // Plan 12-02: mkdir-parent before write. Removes the ENOENT failure path
  // for both project-local and global-install layouts (defense-in-depth).
  await mkdir(path.dirname(file), { recursive: true });
  const payload = JSON.stringify({ pid, holdReason, acquiredAt: new Date().toISOString() });
  await writeFile(file, payload, 'utf8');
}

/**
 * Release the workspace lock. No-op (and does not throw) if the lockfile is
 * already absent.
 *
 * ISSUE-014: this is a best-effort cleanup of a lockfile we ourselves wrote.
 * Capability tag: assertCapability(_, 'destructive-fs'). The unlink is
 * scoped to a single internal state file (`_testatlas/.lock`) — soft-fail
 * semantics (log-and-skip on denial) would just leak the lockfile until
 * stale-detection cleans it up on the next acquireLock. We accept the
 * implicit gate — releaseLock is only ever called from acquireLock-paired
 * flows that have themselves been gated upstream.
 *
 * @param {string} target
 * @returns {Promise<void>}
 */
export async function releaseLock(target) {
  await unlink(lockPath(target)).catch(() => {});
}
