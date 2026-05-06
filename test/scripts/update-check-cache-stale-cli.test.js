// test/scripts/update-check-cache-stale-cli.test.js
//
// Bug B fix — checkForUpdate must self-invalidate the on-disk cache when the
// running CLI's `currentVersion` is provably newer than the cached
// `latestVersion`. The cache cannot truthfully claim "latest is X" when the
// user is already running CLI version > X.
//
// User-observed scenario (post-v1.1.1 ship): `~/tmp/.testatlas/.update-cache.json`
// was written earlier in the day when v1.1.0 was the latest GH release. TTL
// is 24h. Same day, user upgraded the CLI via npx to v1.1.1 and ran
// `update`. checkForUpdate honored the stale cache, returning latestVersion=1.1.0
// — the message read "current 1.1.1, latest 1.1.0", confusing the user.
//
// Contract:
//   - When cached.latestVersion < currentVersion: bypass cache, fetch fresh.
//   - When cached.latestVersion >= currentVersion AND TTL fresh: use cache.
//   - When cached.latestVersion is malformed: bypass cache (defensive).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { UPDATE_CACHE_PATH } from '../../scripts/lib/constants.js';
import { checkForUpdate } from '../../scripts/lib/update-check.js';

async function makeCacheDir(t) {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-cache-stale-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await mkdir(path.join(target, '.testatlas'), { recursive: true });
  return target;
}

async function writeCache(target, body) {
  const p = path.join(target, UPDATE_CACHE_PATH);
  await writeFile(p, JSON.stringify(body), 'utf8');
}

function mockFetchOk(latest) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: `v${latest}` }),
  });
}

test('checkForUpdate bypasses cache when CLI is newer than cached.latestVersion', async (t) => {
  const target = await makeCacheDir(t);
  // Fresh cache (1ms ago) but cached.latestVersion=1.1.0 with CLI=1.1.1.
  await writeCache(target, {
    checkedAt: Date.now() - 1,
    latestVersion: '1.1.0',
  });

  let fetchCalls = 0;
  const fakeFetch = async (...args) => {
    fetchCalls++;
    return mockFetchOk('1.1.1')(...args);
  };

  const result = await checkForUpdate({
    target,
    currentVersion: '1.1.1',
    ttlHours: 24,
    disabled: false,
    __fetchImpl: fakeFetch,
  });

  assert.equal(fetchCalls, 1, 'cache must be bypassed; fetch must be called');
  assert.notEqual(
    result.fromCache,
    true,
    `result must not be flagged fromCache; got ${JSON.stringify(result)}`,
  );
  assert.equal(result.latestVersion, '1.1.1', `result.latestVersion must be the fresh fetch value`);
});

test('checkForUpdate honors cache when CLI matches cached.latestVersion (no false bypass)', async (t) => {
  const target = await makeCacheDir(t);
  await writeCache(target, {
    checkedAt: Date.now() - 1,
    latestVersion: '1.1.1',
  });

  let fetchCalls = 0;
  const fakeFetch = async (...args) => {
    fetchCalls++;
    return mockFetchOk('1.1.1')(...args);
  };

  const result = await checkForUpdate({
    target,
    currentVersion: '1.1.1',
    ttlHours: 24,
    disabled: false,
    __fetchImpl: fakeFetch,
  });

  assert.equal(fetchCalls, 0, 'cache must be honored when CLI <= cached.latestVersion');
  assert.equal(result.fromCache, true);
  assert.equal(result.latestVersion, '1.1.1');
});

test('checkForUpdate honors cache when CLI is older than cached.latestVersion (normal upgrade path)', async (t) => {
  const target = await makeCacheDir(t);
  await writeCache(target, {
    checkedAt: Date.now() - 1,
    latestVersion: '1.2.0',
  });

  let fetchCalls = 0;
  const fakeFetch = async (...args) => {
    fetchCalls++;
    return mockFetchOk('1.2.0')(...args);
  };

  const result = await checkForUpdate({
    target,
    currentVersion: '1.1.0', // older than cached.latestVersion 1.2.0
    ttlHours: 24,
    disabled: false,
    __fetchImpl: fakeFetch,
  });

  assert.equal(fetchCalls, 0, 'cache must be honored when CLI < cached.latestVersion');
  assert.equal(result.fromCache, true);
  assert.equal(result.latestVersion, '1.2.0');
});

test('checkForUpdate bypasses cache when cached.latestVersion is malformed (defensive)', async (t) => {
  const target = await makeCacheDir(t);
  await writeCache(target, {
    checkedAt: Date.now() - 1,
    latestVersion: 'not-a-semver',
  });

  let fetchCalls = 0;
  const fakeFetch = async (...args) => {
    fetchCalls++;
    return mockFetchOk('1.1.1')(...args);
  };

  await checkForUpdate({
    target,
    currentVersion: '1.1.1',
    ttlHours: 24,
    disabled: false,
    __fetchImpl: fakeFetch,
  });
  assert.equal(fetchCalls, 1, 'malformed cache must trigger fresh fetch');
});
