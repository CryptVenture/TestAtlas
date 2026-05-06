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

import { execFile as execFileCb, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { REPO_OWNER_REPO } from './constants.js';
import { assertCapability } from './safety.js';

const execFile = promisify(execFileCb);

// Plan 12-01 (ISSUE-016). Cosign chain pins — MIRROR install.sh:79-104 EXACTLY.
// Both pins are part of the verification contract: the OIDC issuer is the
// GitHub Actions token endpoint, and the certificate identity must match the
// release.yml workflow URL on this repo. Pin drift = silent verification
// regression, so these constants are intentionally NOT configurable.
const COSIGN_ISSUER = 'https://token.actions.githubusercontent.com';
const COSIGN_CERT_IDENTITY_REGEXP =
  '^https://github.com/CryptVenture/TestAtlas/.github/workflows/release.yml.*';

/**
 * Test seam — set via `tarball.setTestHooks({...})` before importing modules
 * that use these helpers. Each hook, if present, replaces the live
 * implementation. Production code never sets these.
 *
 * Plan 12-01 (ISSUE-016 + ISSUE-017): added cosign + sidecar hooks.
 *
 * @type {{
 *   downloadTarball?: typeof downloadTarball,
 *   verifyChecksum?: typeof verifyChecksum,
 *   extractTarball?: typeof extractTarball,
 *   verifyCosignAttestation?: typeof verifyCosignAttestation,
 *   fetchSigstoreBundle?: typeof fetchSigstoreBundle,
 *   fetchExpectedSha?: typeof fetchExpectedSha,
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
 * Plan 12-01 (ISSUE-017): when called from `runUpdate` with `verifyChecksum:
 * true`, the caller fetches the `.sha256` sidecar (`fetchExpectedSha`) so
 * `expectedSha` is always non-null and the legacy stderr-warning path is
 * inactive. Halts with `TESTATLAS_CHECKSUM_MISMATCH` on actual mismatch.
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
  // ISSUE-014 defense-in-depth: extraction spawns the system `tar` binary.
  // Invoked only by the user-initiated update flow (runUpdate), so default
  // permissive when no explicit config threading is available.
  const cap = assertCapability({ safeMode: false, allowDestructiveActions: true }, 'spawn');
  if (!cap.allowed) {
    const err = new Error(`tarball.extractTarball: ${cap.reason}`);
    err.code = 'CAPABILITY_DENIED';
    throw err;
  }
  // Quick 260506-jsh — the npm tarball wraps everything in `package/`; our
  // suite content lives at `package/.testatlas/<files>`. We extract ONLY the
  // suite subtree and strip both wrapper segments so dstDir lands the suite
  // content directly. This matches the contract every test fixture in the
  // repo already assumes (`_testHooks.extractTarball` writes
  // dstDir/bootstrap.md, never dstDir/package/.testatlas/bootstrap.md).
  //
  // Pre-fix, real-world `npx update` produced `<target>/.testatlas/package/.testatlas/`
  // (suite tree two dirs too deep) — every consumer install was broken
  // post-update.
  await new Promise((resolve, reject) => {
    const proc = spawn(
      'tar',
      ['-xzf', tarballPath, '-C', dstDir, '--strip-components=2', 'package/.testatlas'],
      { stdio: 'pipe' },
    );
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

// =============================================================================
// Plan 12-01 (ISSUE-016 + ISSUE-017) — npx-path integrity verification helpers.
//
// Three exports below close the silent-no-op cosign + checksum gap on the
// JS install/update kernels. They mirror the chain established in
// `install.sh:79-104` (cosign verify-blob-attestation + sha256sum) so the
// curl-pipe and npx flows verify identically.
//
// Subprocess discipline: `child_process.execFile` (NOT `spawn({shell:true})`)
// is the project rule per CLAUDE.md / RESEARCH.md — no shell-injection
// vector even if a future feature lets users supply tarball paths.
// =============================================================================

/**
 * Verify a tarball's cosign attestation bundle.
 *
 * Mirrors `install.sh:97-103`. The OIDC-issuer + cert-identity-regexp pins
 * are the verification contract and are intentionally hardcoded — pin drift
 * would be a silent verification regression.
 *
 * Halts with `TESTATLAS_COSIGN_VERIFY_FAILED` on cosign non-zero exit.
 * Halts with `TESTATLAS_COSIGN_NOT_FOUND` if the cosign binary is absent on
 * PATH (probe is normally done by `bin/testatlas.js` before reaching here;
 * this is a defensive backstop for programmatic callers).
 *
 * @param {string} tarballPath  Absolute path to the .tgz to verify.
 * @param {string} bundlePath   Absolute path to the .sigstore.json bundle.
 * @returns {Promise<void>}
 */
export async function verifyCosignAttestation(tarballPath, bundlePath) {
  if (_testHooks.verifyCosignAttestation) {
    return _testHooks.verifyCosignAttestation(tarballPath, bundlePath);
  }
  // ISSUE-014 defense-in-depth (capability gate). cosign is a verification-only
  // subprocess; runs only when the user has explicitly opted into
  // --verify-signature. The intent is gated by the user-facing flag, not
  // config — when no explicit config is threaded through, treat the call as
  // permissive (mirrors tarball.extractTarball's pattern).
  const cap = assertCapability({ safeMode: false, allowDestructiveActions: true }, 'spawn');
  if (!cap.allowed) {
    const err = new Error(`tarball.verifyCosignAttestation: ${cap.reason}`);
    err.code = 'CAPABILITY_DENIED';
    throw err;
  }
  try {
    await execFile('cosign', [
      'verify-blob-attestation',
      '--bundle',
      bundlePath,
      '--new-bundle-format',
      `--certificate-oidc-issuer=${COSIGN_ISSUER}`,
      `--certificate-identity-regexp=${COSIGN_CERT_IDENTITY_REGEXP}`,
      tarballPath,
    ]);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(
        'cosign not found on PATH. Install: https://docs.sigstore.dev/cosign/installation/',
      );
      e.code = 'TESTATLAS_COSIGN_NOT_FOUND';
      throw e;
    }
    const e = new Error(`cosign verify-blob-attestation failed: ${err.stderr ?? err.message}`);
    e.code = 'TESTATLAS_COSIGN_VERIFY_FAILED';
    throw e;
  }
}

/**
 * Fetch the cosign sigstore bundle (`.sigstore.json`) for a given version.
 *
 * Source-of-truth precedence (mirrors `install.sh:91-95` exactly):
 *   1. `https://registry.npmjs.org/@webventures/testatlas/-/testatlas-<v>.tgz.sigstore.json`
 *      — npm-attestation source-of-truth (Trusted Publisher chain).
 *   2. (fallback) `https://github.com/<owner>/<repo>/releases/download/v<v>/testatlas-<v>.tgz.sigstore.json`
 *      — GitHub Release sidecar attached by release.yml after npm publish.
 *
 * Both URLs serve the same bundle content (release.yml line 199 re-attaches
 * the npm-attestation bundle). Trying npm first reduces source-of-truth
 * divergence between the curl-pipe and npx flows.
 *
 * Halts with `TESTATLAS_SIGSTORE_BUNDLE_UNAVAILABLE` if neither URL succeeds.
 *
 * @param {string} version              Version string (e.g. "1.0.0", no leading "v").
 * @param {string} outPath              Absolute path to write the bundle to.
 * @param {typeof fetch} [fetchImpl]    Override (test seam).
 * @returns {Promise<string>}           Resolves to `outPath`.
 */
export async function fetchSigstoreBundle(version, outPath, fetchImpl = fetch) {
  if (_testHooks.fetchSigstoreBundle) {
    return _testHooks.fetchSigstoreBundle(version, outPath);
  }
  const npmUrl = `https://registry.npmjs.org/@webventures/testatlas/-/testatlas-${version}.tgz.sigstore.json`;
  const ghUrl = `https://github.com/${REPO_OWNER_REPO}/releases/download/v${version}/testatlas-${version}.tgz.sigstore.json`;
  const errors = [];
  for (const url of [npmUrl, ghUrl]) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        errors.push(`${url} → ${res.status} ${res.statusText}`);
        continue;
      }
      const body = await res.text();
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, body, 'utf8');
      return outPath;
    } catch (e) {
      errors.push(`${url} → ${e.message}`);
    }
  }
  const err = new Error(
    `tarball.fetchSigstoreBundle: sigstore bundle unavailable for v${version}:\n  ${errors.join('\n  ')}`,
  );
  err.code = 'TESTATLAS_SIGSTORE_BUNDLE_UNAVAILABLE';
  throw err;
}

/**
 * Fetch the expected SHA-256 hex digest from the GitHub Release `.sha256`
 * sidecar (published by `.github/workflows/release.yml`).
 *
 * Sidecar format is the standard `sha256sum` two-column shape:
 *   `<64-hex-sha>  <filename>\n`
 *
 * Halts with:
 *   - `TESTATLAS_SHA_SIDECAR_UNAVAILABLE` if the URL returns non-2xx.
 *   - `TESTATLAS_SHA_SIDECAR_MALFORMED` if the body doesn't match the
 *     two-column format (no 64-hex prefix).
 *
 * @param {string} version              Version string (no leading "v").
 * @param {typeof fetch} [fetchImpl]    Override (test seam).
 * @returns {Promise<string>}           Lowercase 64-hex SHA-256 digest.
 */
export async function fetchExpectedSha(version, fetchImpl = fetch) {
  if (_testHooks.fetchExpectedSha) {
    return _testHooks.fetchExpectedSha(version);
  }
  const url = `https://github.com/${REPO_OWNER_REPO}/releases/download/v${version}/testatlas-${version}.tgz.sha256`;
  let res;
  try {
    res = await fetchImpl(url);
  } catch (e) {
    const err = new Error(
      `tarball.fetchExpectedSha: cannot fetch expected SHA from ${url}: ${e.message}`,
    );
    err.code = 'TESTATLAS_SHA_SIDECAR_UNAVAILABLE';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(
      `tarball.fetchExpectedSha: cannot fetch expected SHA from ${url} (HTTP ${res.status})`,
    );
    err.code = 'TESTATLAS_SHA_SIDECAR_UNAVAILABLE';
    throw err;
  }
  const text = await res.text();
  const m = text.match(/^([a-f0-9]{64})\s/i);
  if (!m) {
    const err = new Error(
      `tarball.fetchExpectedSha: malformed .sha256 sidecar at ${url} ` +
        `(expected two-column "<64-hex>  <filename>"; got first 80 chars: ${text.slice(0, 80)})`,
    );
    err.code = 'TESTATLAS_SHA_SIDECAR_MALFORMED';
    throw err;
  }
  return m[1].toLowerCase();
}
