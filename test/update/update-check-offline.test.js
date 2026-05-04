// test/update/update-check-offline.test.js
//
// Plan 07-04 Task 1 — offline-tolerance + rate-limit fallback (UPDATE-01).

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
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-update-offline-'));
  await mkdir(path.join(dir, '.testatlas'), { recursive: true });
  return dir;
}

async function writeCache(target, body) {
  const cachePath = path.join(target, '.testatlas/.update-cache.json');
  await writeFile(cachePath, JSON.stringify(body, null, 2));
}

describe('checkForUpdate — offline + error tolerance', () => {
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

  it('returns skipped:offline on network error (no throw)', async () => {
    globalThis.fetch = makeFetchStub(async () => {
      const err = new Error('getaddrinfo ENETUNREACH');
      err.code = 'ENETUNREACH';
      throw err;
    });

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.skipped, 'offline');
    assert.equal(result.error, 'ENETUNREACH');
  });

  it('returns skipped:offline AND falls back to cached value when present', async () => {
    // Stale cache (older than TTL) with a known latestVersion. Fetch fails
    // → we should still get latestVersion echoed back from cache.
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    await writeCache(tmp, { checkedAt: twentyFiveHoursAgo, latestVersion: '0.7.0' });

    globalThis.fetch = makeFetchStub(async () => {
      const err = new Error('ENETUNREACH');
      err.code = 'ENETUNREACH';
      throw err;
    });

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.skipped, 'offline');
    assert.equal(result.error, 'ENETUNREACH');
    assert.equal(result.latestVersion, '0.7.0');
  });

  it('returns skipped:offline on AbortError (5s timeout)', async () => {
    globalThis.fetch = makeFetchStub(async (_url, init) => {
      // Simulate the AbortController firing.
      return new Promise((_resolve, reject) => {
        if (init.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    // ttlHours=0 forces fresh fetch; ensure we receive an aborted promise.
    const start = Date.now();
    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 0,
      disabled: false,
      // Override timeout for fast test (impl supports __timeoutMs internal opt
      // for testability — see implementation).
      __timeoutMs: 50,
    });
    const elapsed = Date.now() - start;

    assert.equal(result.skipped, 'offline');
    assert.match(result.error ?? '', /Abort/i);
    assert.ok(elapsed < 1000, `expected fast abort, took ${elapsed}ms`);
  });

  it('returns skipped:http-403 on rate-limit response (no cache write)', async () => {
    globalThis.fetch = makeFetchStub(async () => ({
      ok: false,
      status: 403,
      statusText: 'rate limit exceeded',
      json: async () => ({ message: 'API rate limit exceeded' }),
    }));

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.skipped, 'http-403');

    // Cache file should not have been written.
    const cachePath = path.join(tmp, '.testatlas/.update-cache.json');
    await assert.rejects(() => readFile(cachePath, 'utf8'));
  });

  it('returns skipped:http-503 on server error', async () => {
    globalThis.fetch = makeFetchStub(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.skipped, 'http-503');
  });

  it('rate-limit falls back to cached value when present', async () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    await writeCache(tmp, { checkedAt: twentyFiveHoursAgo, latestVersion: '0.4.0' });

    globalThis.fetch = makeFetchStub(async () => ({
      ok: false,
      status: 403,
      statusText: 'rate limit',
    }));

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.skipped, 'http-403');
    assert.equal(result.latestVersion, '0.4.0');
  });
});
