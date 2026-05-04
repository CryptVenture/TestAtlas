// scripts/lib/tarball.js
//
// Plan 07-03 Task 1 — download + checksum-verify + extract a testatlas
// release tarball.
//
// Sources (in order):
//   1. npm registry: https://registry.npmjs.org/testatlas/-/testatlas-<v>.tgz
//   2. Fallback to GitHub Releases tarball if (1) returns non-2xx.
//
// Extract uses a spawned `tar -xzf` so we don't depend on a JS tar library.
// Windows 10+ ships `tar.exe` natively in System32 so the same command works
// across platforms (RESEARCH §Don't Hand-Roll: tar/extract).
//
// Test seam: the module-level `_testHooks` object can be overridden at test
// time to bypass network operations and inject canned responses. See
// `test/update/update-atomic.test.js` for the pattern.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { REPO_OWNER_REPO } from './constants.js';

/**
 * Test seam — set via `tarball.setTestHooks({...})` before importing modules
 * that use these helpers. Each hook, if present, replaces the live
 * implementation. Production code never sets these.
 *
 * @type {{
 *   downloadTarball?: typeof downloadTarball,
 *   verifyChecksum?: typeof verifyChecksum,
 *   extractTarball?: typeof extractTarball,
 * }}
 */
export const _testHooks = {};

/**
 * Compute the npm registry URL for a versioned testatlas tarball.
 * @param {string} version
 */
function npmTarballUrl(version) {
  return `https://registry.npmjs.org/testatlas/-/testatlas-${version}.tgz`;
}

/**
 * Compute the GitHub Releases tarball URL (fallback).
 * @param {string} version
 */
function githubTarballUrl(version) {
  return `https://github.com/${REPO_OWNER_REPO}/releases/download/v${version}/testatlas-${version}.tgz`;
}

/**
 * Download the tarball for `version` to `dst`. Tries the npm registry first,
 * falls back to GitHub Releases on non-2xx. Throws on transport failure or
 * 4xx/5xx from both sources.
 *
 * @param {string} version       Version string (e.g. "0.2.0", no leading "v").
 * @param {string} dst           Absolute path of the destination .tgz file.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<string>} Resolves to `dst`.
 */
export async function downloadTarball(version, dst, opts = {}) {
  if (_testHooks.downloadTarball) return _testHooks.downloadTarball(version, dst, opts);
  const fetchImpl = opts.fetchImpl ?? fetch;
  await mkdir(path.dirname(dst), { recursive: true });
  const sources = [npmTarballUrl(version), githubTarballUrl(version)];
  const errors = [];
  for (const url of sources) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        errors.push(`${url} → ${res.status} ${res.statusText}`);
        continue;
      }
      // Node's fetch returns a Web ReadableStream on `.body`; convert to
      // node-stream and pipe to disk.
      const nodeStream = Readable.fromWeb(res.body);
      await pipeline(nodeStream, createWriteStream(dst));
      return dst;
    } catch (e) {
      errors.push(`${url} → ${e.message}`);
    }
  }
  const err = new Error(
    `tarball.downloadTarball: failed to fetch v${version} from any source:\n  ${errors.join('\n  ')}`,
  );
  err.code = 'TESTATLAS_TARBALL_FETCH_FAILED';
  throw err;
}

/**
 * Verify a file's SHA-256 against `expectedSha`. Pass `null` or `undefined`
 * to skip with a stderr warning (compatibility with v0.x release tooling that
 * may not always provide a sidecar checksum).
 *
 * @param {string} file
 * @param {string|null|undefined} expectedSha  Hex-encoded SHA-256 digest.
 */
export async function verifyChecksum(file, expectedSha) {
  if (_testHooks.verifyChecksum) return _testHooks.verifyChecksum(file, expectedSha);
  if (expectedSha == null) {
    process.stderr.write(
      `[testatlas:warn] tarball.verifyChecksum: no expected SHA provided for ${file} — skipping\n`,
    );
    return;
  }
  const buf = await readFile(file);
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== expectedSha) {
    const err = new Error(
      `tarball.verifyChecksum: SHA-256 mismatch for ${file} ` +
        `(expected ${expectedSha}, got ${actual})`,
    );
    err.code = 'TESTATLAS_CHECKSUM_MISMATCH';
    throw err;
  }
}

/**
 * Extract a `.tgz` tarball into `dstDir` via spawned `tar -xzf`. Creates
 * `dstDir` if absent. Rejects on non-zero exit.
 *
 * Cross-platform: relies on `tar` being on PATH. POSIX systems always have
 * it; Windows 10+ ships `tar.exe` in System32. If a future need to support
 * older Windows or stripped containers emerges, fall back to a JS tar lib —
 * for now, the spawn approach keeps the dep surface zero.
 *
 * @param {string} tarballPath Absolute path to the .tgz file.
 * @param {string} dstDir      Absolute destination directory (will be mkdir'd).
 * @returns {Promise<void>}
 */
export async function extractTarball(tarballPath, dstDir) {
  if (_testHooks.extractTarball) return _testHooks.extractTarball(tarballPath, dstDir);
  await mkdir(dstDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', tarballPath, '-C', dstDir], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const err = new Error(
        `tarball.extractTarball: tar exited with code ${code}: ${stderr.trim()}`,
      );
      err.code = 'TESTATLAS_TARBALL_EXTRACT_FAILED';
      reject(err);
    });
  });
}
