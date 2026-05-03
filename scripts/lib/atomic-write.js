// scripts/lib/atomic-write.js
//
// Atomic file write: write-tmp + fsync + rename. POSIX-atomic by spec; on
// Windows, rename can transiently fail with EPERM/EACCES/EBUSY when antivirus,
// indexers, or other tools have a brief lock — we bound-retry those cases.
//
// Contract (locked):
//   - Tmp file: `<destPath>.tmp.<pid>.<rand8>` where rand8 = randomUUID().slice(0, 8).
//   - Open with `'wx'` (exclusive create). On EEXIST, regenerate rand8 and
//     retry once before giving up.
//   - Write contents → fsync (fh.sync()) → close.
//   - Rename tmp → dest. On Windows-only EPERM/EACCES/EBUSY, retry up to 3
//     attempts total with 50/200/450ms backoff (50 * (attempt+1)^2).
//   - On ANY error path: unlink tmp (best-effort) + rethrow original error.
//     The destination file is never partially overwritten — either rename
//     succeeds (atomic swap) or the original is untouched.
//
// Optional `_injected` parameter (4th arg) is FOR TESTS ONLY. It lets
// test/atomic-write.test.js exercise the Windows retry path on a non-Windows
// CI. Production callers use the 3-arg form.
//
// See .planning/phases/02-schemas-templates-workspace-skeleton/02-RESEARCH.md
// §"Pattern 3: Atomic Write" and §"Pitfall 4".

import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';

const WIN_TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_MAX_ATTEMPTS = 3;

const tmpName = (destPath) => `${destPath}.tmp.${process.pid}.${randomUUID().slice(0, 8)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Atomically write `contents` to `destPath`.
 *
 * @param {string} destPath
 * @param {string | Buffer} contents
 * @param {{ encoding?: BufferEncoding }} [opts]
 * @param {{
 *   open?: typeof open,
 *   rename?: typeof rename,
 *   unlink?: typeof unlink,
 *   isWin?: boolean,
 * }} [_injected] @internal — test-only dependency injection. Do NOT pass in
 *   production code.
 * @returns {Promise<void>}
 */
export async function atomicWrite(destPath, contents, opts = {}, _injected = {}) {
  const { encoding = 'utf8' } = opts;
  const _open = _injected.open ?? open;
  const _rename = _injected.rename ?? rename;
  const _unlink = _injected.unlink ?? unlink;
  const _isWin = _injected.isWin ?? process.platform === 'win32';

  // Tmp filename: try one regenerated suffix on EEXIST collision (vanishingly
  // rare given pid + 8 hex chars of UUIDv4, but cheap to guard).
  let tmp = tmpName(destPath);
  let fh;
  try {
    try {
      fh = await _open(tmp, 'wx');
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      tmp = tmpName(destPath);
      fh = await _open(tmp, 'wx');
    }

    try {
      await fh.writeFile(contents, encoding);
      await fh.sync();
    } finally {
      await fh.close();
      fh = null;
    }

    let lastErr = null;
    for (let attempt = 0; attempt < RENAME_MAX_ATTEMPTS; attempt++) {
      try {
        await _rename(tmp, destPath);
        return;
      } catch (err) {
        lastErr = err;
        if (!_isWin || !WIN_TRANSIENT.has(err.code)) throw err;
        if (attempt === RENAME_MAX_ATTEMPTS - 1) break;
        // Backoff: 50ms, 200ms, 450ms (50 * (attempt+1)^2 for attempt 0,1,2)
        await sleep(50 * (attempt + 1) ** 2);
      }
    }
    throw lastErr;
  } catch (err) {
    if (fh) await fh.close().catch(() => {});
    await _unlink(tmp).catch(() => {});
    throw err;
  }
}
