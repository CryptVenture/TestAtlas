// Tests for Phase 2 — WORK-04 (atomic write).
//
// Covers:
//   - Fresh-file write
//   - Overwrite of an existing file
//   - Binary Buffer round-trip
//   - Tmp cleanup on rename failure (POSIX simulation: rename file → directory)
//   - Encoding option respected
//   - No leftover *.tmp.* files after a successful write
//   - Windows transient-error retry path (via _injected dependency injection):
//       * succeeds after 2 transient EPERMs
//       * gives up after RENAME_MAX_ATTEMPTS
//
// The Windows-retry path is exercised by passing test doubles for
// `rename`/`unlink`/`isWin` through the `_injected` parameter. This is the
// only sane way to cover the retry loop on a non-Windows CI.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { atomicWrite } from '../scripts/lib/atomic-write.js';

async function makeTmpDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atomic-write-'));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test('WORK-04: writes contents to a fresh file', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'fresh.txt');

  await atomicWrite(dest, 'hello world');

  const contents = await readFile(dest, 'utf8');
  assert.equal(contents, 'hello world');
});

test('WORK-04: overwrites an existing file (atomic swap)', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'existing.txt');
  await writeFile(dest, 'original', 'utf8');

  await atomicWrite(dest, 'replacement');

  const contents = await readFile(dest, 'utf8');
  assert.equal(contents, 'replacement');
});

test('WORK-04: handles binary Buffer contents', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'bin.dat');
  const payload = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x42]);

  await atomicWrite(dest, payload);

  const read = await readFile(dest);
  assert.ok(Buffer.isBuffer(read));
  assert.deepEqual([...read], [...payload]);
});

test('WORK-04: respects encoding option', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'utf8.txt');

  await atomicWrite(dest, 'café', { encoding: 'utf8' });

  const utf8 = await readFile(dest, 'utf8');
  assert.equal(utf8, 'café');

  // Reading the same bytes as latin1 should differ (different decoding of
  // the multi-byte é sequence) — confirms encoding flowed through.
  const latin1 = await readFile(dest, 'latin1');
  assert.notEqual(latin1, 'café');
});

test('WORK-04: returns undefined on success', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'ret.txt');

  const result = await atomicWrite(dest, 'x');
  assert.equal(result, undefined);
});

test('WORK-04: leaves no orphan tmp files after a successful write', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'cleanup-success.txt');

  await atomicWrite(dest, 'content');

  const entries = await readdir(dir);
  const orphans = entries.filter((e) => e.includes('.tmp.'));
  assert.deepEqual(orphans, [], `expected no .tmp.* leftovers, got: ${entries.join(', ')}`);
  assert.ok(entries.includes('cleanup-success.txt'));
});

test('WORK-04: cleans up tmp on rename failure (rename file → over directory)', async (t) => {
  // POSIX simulation of "rename fails" — make destPath a directory; renaming
  // a regular tmp file ON TOP of a directory throws EISDIR (Linux) or similar.
  // Skip on Windows because semantics differ (rename to a non-empty dir
  // throws ENOTEMPTY, etc., and the symbolic intent of the test is the same).
  if (process.platform === 'win32') {
    t.skip('POSIX-only failure-mode simulation');
    return;
  }

  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'is-a-dir');
  await mkdir(dest); // pre-create as dir → atomicWrite's rename will fail

  await assert.rejects(() => atomicWrite(dest, 'should-fail'));

  // The destination directory is still there (untouched); no orphan tmp files
  // remain in the parent dir.
  const entries = await readdir(dir);
  const orphans = entries.filter((e) => e.startsWith('is-a-dir.tmp.'));
  assert.deepEqual(orphans, [], `tmp leftovers: ${entries.join(', ')}`);
  assert.ok(entries.includes('is-a-dir'));
});

test('WORK-04: Windows retry path succeeds after transient EPERMs', async (t) => {
  // Exercise the Windows retry loop on a non-Windows CI by injecting test
  // doubles. The mock rename throws EPERM twice, then succeeds on the third
  // attempt — the loop must total 3 calls.
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'win-retry-ok.txt');

  let renameCalls = 0;
  const mockRename = async (_tmp, _dest) => {
    renameCalls++;
    if (renameCalls < 3) {
      const err = new Error('mock EPERM');
      err.code = 'EPERM';
      throw err;
    }
    // On success, perform the real rename so the file actually shows up on
    // disk (the test then verifies contents).
    const { rename: realRename } = await import('node:fs/promises');
    await realRename(_tmp, _dest);
  };

  await atomicWrite(dest, 'persisted-after-retries', {}, { rename: mockRename, isWin: true });

  assert.equal(renameCalls, 3, 'rename must be retried up to 3 attempts');
  const contents = await readFile(dest, 'utf8');
  assert.equal(contents, 'persisted-after-retries');
});

test('WORK-04: Windows retry path gives up after RENAME_MAX_ATTEMPTS', async (t) => {
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'win-retry-fail.txt');

  let renameCalls = 0;
  const mockRename = async () => {
    renameCalls++;
    const err = new Error('mock EPERM persistent');
    err.code = 'EPERM';
    throw err;
  };

  // Track the unlinks too — atomicWrite should clean up the tmp on final fail.
  let unlinkedTmp = false;
  const mockUnlink = async (p) => {
    if (p.includes('.tmp.')) unlinkedTmp = true;
    const { unlink: realUnlink } = await import('node:fs/promises');
    await realUnlink(p).catch(() => {});
  };

  await assert.rejects(
    () =>
      atomicWrite(
        dest,
        'never-arrives',
        {},
        { rename: mockRename, unlink: mockUnlink, isWin: true },
      ),
    (err) => err.code === 'EPERM',
  );

  assert.equal(renameCalls, 3, 'rename must be tried RENAME_MAX_ATTEMPTS times');
  assert.ok(unlinkedTmp, 'tmp file must be cleanup-unlinked on final failure');

  // Destination file must NOT exist (original was untouched / never created).
  const entries = await readdir(dir);
  assert.ok(
    !entries.includes('win-retry-fail.txt'),
    `dest must not exist after exhaustion; saw: ${entries.join(', ')}`,
  );
});

test('WORK-04: non-Windows + non-transient rename error throws immediately (no retry)', async (t) => {
  // Defensive assertion: on POSIX, even an EPERM should NOT be retried.
  const dir = await makeTmpDir(t);
  const dest = path.join(dir, 'posix-eperm.txt');

  let renameCalls = 0;
  const mockRename = async () => {
    renameCalls++;
    const err = new Error('mock EPERM on POSIX');
    err.code = 'EPERM';
    throw err;
  };

  await assert.rejects(() => atomicWrite(dest, 'x', {}, { rename: mockRename, isWin: false }));

  assert.equal(renameCalls, 1, 'POSIX must NOT retry');
});
