// test/update/update-check.test.js
//
// Plan 07-04 Task 1 — happy-path GitHub Releases fetch + cache write +
// version comparison (UPDATE-01).
//
// Pattern: capture and replace `globalThis.fetch` per-test; restore in
// `t.after`. Uses tmp dirs so cache writes never collide.

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
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-update-check-'));
  await mkdir(path.join(dir, '.testatlas'), { recursive: true });
  return dir;
}

describe('checkForUpdate — happy path', () => {
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

  it('returns updateAvailable when latest > current', async () => {
    globalThis.fetch = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.2.0' }),
    }));

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.updateAvailable, true);
    assert.equal(result.latestVersion, '0.2.0');
    assert.equal(result.currentVersion, '0.1.0');
  });

  it('writes cache file at <target>/.testatlas/.update-cache.json', async () => {
    globalThis.fetch = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.2.0' }),
    }));

    await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    const cachePath = path.join(tmp, '.testatlas/.update-cache.json');
    const text = await readFile(cachePath, 'utf8');
    const json = JSON.parse(text);
    assert.equal(json.latestVersion, '0.2.0');
    assert.equal(typeof json.checkedAt, 'number');
    assert.ok(Date.now() - json.checkedAt < 5000);
  });

  it('returns current=true when latest equals current', async () => {
    globalThis.fetch = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.1.0' }),
    }));

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.current, true);
    assert.equal(result.latestVersion, '0.1.0');
    assert.equal(result.currentVersion, '0.1.0');
    assert.notEqual(result.updateAvailable, true);
  });

  it('honors disabled: true and skips fetch entirely', async () => {
    const stub = makeFetchStub(async () => {
      throw new Error('fetch should not have been called');
    });
    globalThis.fetch = stub;

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: true,
    });

    assert.equal(result.skipped, 'config');
    assert.equal(stub.calls.length, 0);

    // Cache should NOT have been written.
    const cachePath = path.join(tmp, '.testatlas/.update-cache.json');
    await assert.rejects(() => readFile(cachePath, 'utf8'));
  });

  it('strips leading "v" from tag_name', async () => {
    globalThis.fetch = makeFetchStub(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v1.5.3' }),
    }));

    const result = await checkForUpdate({
      target: tmp,
      currentVersion: '1.0.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.equal(result.latestVersion, '1.5.3');
  });

  it('sends User-Agent and Accept headers per GH API guidance', async () => {
    let capturedHeaders;
    globalThis.fetch = makeFetchStub(async (_url, init) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v0.1.0' }),
      };
    });

    await checkForUpdate({
      target: tmp,
      currentVersion: '0.1.0',
      ttlHours: 24,
      disabled: false,
    });

    assert.match(capturedHeaders['User-Agent'], /^testatlas\//);
    assert.equal(capturedHeaders.Accept, 'application/vnd.github+json');
  });
});
