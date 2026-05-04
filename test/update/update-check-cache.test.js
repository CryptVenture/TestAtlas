// test/update/update-check-cache.test.js
//
// Plan 07-04 Task 1 — TTL cache hit/miss behavior (UPDATE-01).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { checkForUpdate } from '../../scripts/lib/update-check.js';

function makeFetchStub(impl) {
  const stub = (...args) => {
    stub.calls.push(args);
    return impl(...args);
  };
  stub.calls = [];
  return stub;
}

async function setupTmp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-update-cache-'));
  await mkdir(path.join(dir, '.testatlas'), { recursive: true });
  return dir;
}

async function writeCache(target, body) {
  const cachePath = path.join(target, '.testatlas/.update-cache.json');
  await writeFile(cachePath, JSON.stringify(body, null, 2));
  return cachePath;
}

describe('checkForUpdate — cache TTL', () => {
  let originalFetch;
  let tmp;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    tmp = await setupTmp();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tmp, { recursive: true, force: true });
  });

  it('uses cache when within TTL (does NOT call fetch)', async () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    await writeCache(tmp, { checkedAt: oneHourAgo, latestVersion: '0.5.0' });

    const stub = makeFetchStub(async () => {
      throw new Error('fetch should not be called when cache is fresh');
    });
    globalThis.fetch = stub;

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(stub.calls.length, 0);
    assert.equal(result.fromCache, true);
    assert.equal(result.updateAvailable, true);
    assert.equal(result.latestVersion, '0.5.0');
  });

  it('refetches when cache is stale (>TTL)', async () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    await writeCache(tmp, { checkedAt: twentyFiveHoursAgo, latestVersion: '0.5.0' });

    const stub = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.6.0' }),
    }));
    globalThis.fetch = stub;

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(stub.calls.length, 1);
    assert.equal(result.updateAvailable, true);
    assert.equal(result.latestVersion, '0.6.0');

    // Cache should have been rewritten with the new value.
    const cacheAfter = JSON.parse(
      await readFile(path.join(tmp, '.testatlas/.update-cache.json'), 'utf8'),
    );
    assert.equal(cacheAfter.latestVersion, '0.6.0');
  });

  it('uses cache from-cache flag when within TTL but evaluation says current', async () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    await writeCache(tmp, { checkedAt: oneHourAgo, latestVersion: '0.1.0' });

    const stub = makeFetchStub(async () => {
      throw new Error('fetch should not be called when cache is fresh');
    });
    globalThis.fetch = stub;

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(stub.calls.length, 0);
    assert.equal(result.fromCache, true);
    assert.equal(result.current, true);
  });

  it('handles missing cache file gracefully (fetches fresh)', async () => {
    const stub = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.2.0' }),
    }));
    globalThis.fetch = stub;

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(stub.calls.length, 1);
    assert.equal(result.updateAvailable, true);
  });

  it('handles malformed cache file gracefully (treats as missing, fetches)', async () => {
    const cachePath = path.join(tmp, '.testatlas/.update-cache.json');
    await writeFile(cachePath, '{ not-valid-json');

    const stub = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.2.0' }),
    }));
    globalThis.fetch = stub;

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(stub.calls.length, 1);
    assert.equal(result.updateAvailable, true);
  });
});
