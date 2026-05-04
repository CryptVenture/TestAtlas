// scripts/lib/update-check.js
//
// Plan 07-04 Task 1 — GitHub Releases auto-check + TTL cache + offline
// tolerance (UPDATE-01, UPDATE-03).
//
// Calls `https://api.github.com/repos/<org>/testatlas/releases/latest` with a
// 5s `AbortController` timeout. Caches the response in
// `<target>/.testatlas/.update-cache.json` honoring `ttlHours` (default 24
// elsewhere; this module is TTL-agnostic — caller passes the value).
//
// Behavior contract:
//   - `disabled: true`           → returns `{skipped: 'config'}` immediately;
//                                  fetch NOT called; cache NOT written.
//   - cache fresh (within TTL)   → returns `{fromCache: true, ...evalCache}`;
//                                  fetch NOT called.
//   - fetch ok                   → writes cache; returns `evalCache(fresh)`.
//   - fetch non-2xx              → returns `{skipped: 'http-<status>',
//                                  latestVersion?}` (cached value if any).
//   - fetch throws               → returns `{skipped: 'offline', error,
//                                  latestVersion?}` (cached value if any).
//
// Per RESEARCH §Pattern 7 (Code Example 5).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { GH_LATEST_RELEASE_API, UPDATE_CACHE_PATH } from './constants.js';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Read the on-disk cache, returning null on missing/malformed.
 * @param {string} cacheFile
 * @returns {Promise<{checkedAt: number, latestVersion: string}|null>}
 */
async function readCache(cacheFile) {
  try {
    const text = await readFile(cacheFile, 'utf8');
    const json = JSON.parse(text);
    if (typeof json?.checkedAt !== 'number') return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * Write the cache atomically-ish (mkdir + writeFile).
 * @param {string} cacheFile
 * @param {{checkedAt: number, latestVersion: string}} body
 */
async function writeCache(cacheFile, body) {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(body, null, 2));
}

/**
 * Compare cached/fresh latestVersion against current; build the public result
 * shape.
 *
 * @param {{latestVersion?: string}} body
 * @param {string} currentVersion
 * @returns {{updateAvailable?: true, current?: true, latestVersion?: string, currentVersion: string}}
 */
function evalCache(body, currentVersion) {
  const latestVersion = body?.latestVersion;
  if (!latestVersion) return { current: true, currentVersion };
  let isNewer = false;
  try {
    isNewer = semver.gt(latestVersion, currentVersion);
  } catch {
    isNewer = false;
  }
  if (isNewer) {
    return { updateAvailable: true, latestVersion, currentVersion };
  }
  return { current: true, latestVersion, currentVersion };
}

/**
 * @typedef {Object} CheckForUpdateOptions
 * @property {string}  target            Absolute path to the install target.
 * @property {string}  currentVersion    Currently-installed suite version.
 * @property {number}  ttlHours          Cache TTL in hours.
 * @property {boolean} [disabled]        If true, skip immediately.
 * @property {number}  [__timeoutMs]     Internal: override 5s timeout (tests).
 * @property {typeof fetch} [__fetchImpl] Internal: override fetch (tests).
 */

/**
 * @typedef {Object} CheckForUpdateResult
 * @property {true}    [updateAvailable]
 * @property {true}    [current]
 * @property {true}    [fromCache]
 * @property {string}  [skipped]   'config' | 'offline' | 'http-<status>'
 * @property {string}  [error]     Error code/name when skipped='offline'
 * @property {string}  [latestVersion]
 * @property {string}  [currentVersion]
 */

/**
 * Check GitHub Releases for the latest testatlas version. See file header.
 *
 * @param {CheckForUpdateOptions} opts
 * @returns {Promise<CheckForUpdateResult>}
 */
export async function checkForUpdate(opts) {
  const { target, currentVersion, ttlHours, disabled } = opts;
  if (disabled) return { skipped: 'config' };

  const cacheFile = path.join(target, UPDATE_CACHE_PATH);
  const cached = await readCache(cacheFile);
  const ttlMs = Math.max(0, Number(ttlHours) || 0) * 60 * 60 * 1000;

  if (cached && Date.now() - cached.checkedAt < ttlMs) {
    return { fromCache: true, ...evalCache(cached, currentVersion) };
  }

  // Fresh fetch.
  const fetchImpl = opts.__fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.__timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(GH_LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `testatlas/${currentVersion}`,
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const code = err?.code || err?.name || 'unknown';
    const result = { skipped: 'offline', error: code };
    if (cached?.latestVersion) result.latestVersion = cached.latestVersion;
    return result;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const result = { skipped: `http-${res.status}` };
    if (cached?.latestVersion) result.latestVersion = cached.latestVersion;
    return result;
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    const result = { skipped: 'offline', error: err?.code || err?.name || 'parse' };
    if (cached?.latestVersion) result.latestVersion = cached.latestVersion;
    return result;
  }

  const tagName = typeof body?.tag_name === 'string' ? body.tag_name : null;
  const latestVersion = tagName ? tagName.replace(/^v/, '') : undefined;

  const fresh = { checkedAt: Date.now(), latestVersion };
  await writeCache(cacheFile, fresh);

  return evalCache(fresh, currentVersion);
}
