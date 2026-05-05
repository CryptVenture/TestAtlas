// test/update/verify-signature-flag.test.js
//
// Plan 07-04 Task 3 — `--verify-signature` opt-in cosign attestation
// (UPDATE-07). Covers:
//   - bin/testatlas.js init/update with --verify-signature when cosign is
//     absent → exits 1 with actionable error
//   - bin/testatlas.js init/update with --verify-signature when cosign is
//     present (mock shim) → flag accepted; cosign probe succeeds
//   - default behavior (no flag): no cosign probe runs
//   - install.sh with TESTATLAS_VERIFY_SIGNATURE=1 and cosign absent → exits 1
//   - install.sh without env (default) skips signature verification

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const BIN = path.join(REPO_ROOT, 'bin/testatlas.js');
const INSTALL_SH = path.join(REPO_ROOT, 'install.sh');

// These tests rely on POSIX semantics: a `cosign` shell-script shim with
// `#!/bin/sh` shebang + chmod +x; `sh install.sh` invocations; `:`-separated
// PATH; `/usr/bin`/`/bin` standard locations. Windows runners can't execute
// any of this — skip the whole file. Linux/macOS exercise the same code paths.
const skipOnWindows = { skip: process.platform === 'win32' };

/**
 * Build a PATH that includes the node binary's directory but not cosign.
 * We discover node's location from process.execPath, then prepend its dir to
 * /usr/bin:/bin (typical POSIX). If cosign somehow exists in any of these,
 * the affected tests skip rather than fail.
 */
function pathWithoutCosign() {
  const nodeDir = path.dirname(process.execPath);
  return [nodeDir, '/usr/bin', '/bin'].join(path.delimiter);
}

function cosignOnPath(pathStr) {
  for (const dir of pathStr.split(path.delimiter)) {
    const probe = spawnSync('test', ['-x', path.join(dir, 'cosign')], { stdio: 'ignore' });
    if (probe.status === 0) return true;
  }
  return false;
}

/**
 * Build a cosign shim that writes its argv (one invocation per line) to
 * `recordPath` so tests can assert which subcommands were invoked.
 *
 * Plan 12-01: the shim now branches on the first positional arg:
 *   - `version` → exit 0 with a "cosign version 2.x" stdout line. This is
 *     what `probeCosignOrExit()` invokes from bin/testatlas.js.
 *   - `verify-blob-attestation` → exit 0 (signature valid) by default. The
 *     `failVerify` knob lets a test simulate cosign rejecting the signature
 *     (exit 1, stderr "verify failed").
 *   - anything else → exit 0 (forward-compatible).
 *
 * The shim records every invocation under `recordPath` (one line per call,
 * with the full argv joined by spaces). Tests can read this file and assert
 * cosign was invoked with `verify-blob-attestation` for the GREEN case OR
 * NOT invoked for the default/no-flag case.
 */
async function makeCosignShim(dir, opts = {}) {
  const failVerify = opts.failVerify ?? false;
  const recordPath = opts.recordPath ?? path.join(dir, '.cosign-shim-invocations');
  const shim = path.join(dir, 'cosign');
  const verifyExit = failVerify ? 1 : 0;
  const verifyStderrTail = failVerify ? 'echo "verify failed" >&2' : '';
  await writeFile(
    shim,
    `#!/bin/sh
# Test shim for cosign — Plan 12-01 contract (handles version + verify-blob-attestation).
echo "cosign-shim invoked: $*" >> "${recordPath}"
case "$1" in
  version)
    echo "cosign version 2.0.0-shim"
    exit 0
    ;;
  verify-blob-attestation)
    ${verifyStderrTail}
    exit ${verifyExit}
    ;;
  *)
    exit 0
    ;;
esac
`,
  );
  await chmod(shim, 0o755);
  return { shim, recordPath };
}

describe('--verify-signature flag (bin/testatlas.js)', skipOnWindows, () => {
  let tmp;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'testatlas-verify-sig-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('exits 1 with actionable message when cosign is absent', async () => {
    const cleanPath = pathWithoutCosign();
    if (cosignOnPath(cleanPath)) {
      // System has cosign installed in /usr/bin — skip this test.
      return;
    }

    const result = spawnSync(
      'node',
      [BIN, 'init', '--verify-signature', '--target', tmp, '--dry-run'],
      {
        env: { ...process.env, PATH: cleanPath },
        encoding: 'utf8',
      },
    );

    assert.equal(
      result.status,
      1,
      `expected exit 1, got ${result.status}\nstderr: ${result.stderr}`,
    );
    assert.match(result.stderr, /cosign not found/i);
    assert.match(result.stderr, /sigstore/i);
  });

  it('Plan 12-01: invokes cosign verify-blob-attestation when cosign IS on PATH (shim)', async () => {
    const shimDir = path.join(tmp, 'bin');
    await mkdir(shimDir, { recursive: true });
    const { recordPath } = await makeCosignShim(shimDir);

    const targetDir = path.join(tmp, 'target');
    await mkdir(targetDir, { recursive: true });

    // Provide a fake cached-tarball + sigstore-bundle override so the kernel's
    // verification chain finds something to run cosign against. The kernel
    // honors `_TESTATLAS_VERIFY_TARBALL_OVERRIDE` (test-only escape hatch,
    // mirrors install.sh's `_TESTATLAS_TARBALL_OVERRIDE`).
    const fakeTarball = path.join(tmp, 'cached-testatlas-1.0.0.tgz');
    const fakeBundle = path.join(tmp, 'cached-testatlas-1.0.0.tgz.sigstore.json');
    await writeFile(fakeTarball, 'fake-tarball-bytes');
    await writeFile(fakeBundle, '{}');

    const result = spawnSync(
      'node',
      [BIN, 'init', '--verify-signature', '--target', targetDir, '--dry-run'],
      {
        env: {
          ...process.env,
          PATH: `${shimDir}:${pathWithoutCosign()}`,
          _TESTATLAS_VERIFY_TARBALL_OVERRIDE: fakeTarball,
          _TESTATLAS_VERIFY_BUNDLE_OVERRIDE: fakeBundle,
        },
        encoding: 'utf8',
      },
    );

    // We expect dry-run to succeed (exit 0) — proving cosign probe accepted
    // the shim AND verify-blob-attestation succeeded.
    assert.equal(
      result.status,
      0,
      `expected exit 0 with shim, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    assert.doesNotMatch(result.stderr, /cosign not found/i);

    // Plan 12-01 contract: cosign verify-blob-attestation MUST have been
    // invoked (not just the version probe). Read the shim's invocation log.
    const invocations = await readFile(recordPath, 'utf8');
    assert.match(
      invocations,
      /verify-blob-attestation/,
      `cosign shim was not invoked with verify-blob-attestation. Invocations:\n${invocations}`,
    );
  });

  it('default flow (no --verify-signature) does not run cosign probe', async () => {
    const cleanPath = pathWithoutCosign();
    const targetDir = path.join(tmp, 'target');
    await mkdir(targetDir, { recursive: true });

    // Even without cosign on PATH, default init should not error about cosign.
    const result = spawnSync('node', [BIN, 'init', '--target', targetDir, '--dry-run'], {
      env: { ...process.env, PATH: cleanPath },
      encoding: 'utf8',
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}\nstderr: ${result.stderr}`,
    );
    assert.doesNotMatch(result.stderr, /cosign/i);
  });

  it('--verify-signature is accepted on `update` subcommand', async () => {
    // help output should list the flag.
    const result = spawnSync('node', [BIN, 'update', '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--verify-signature/);
  });

  it('--verify-signature is accepted on `init` subcommand', async () => {
    const result = spawnSync('node', [BIN, 'init', '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--verify-signature/);
  });
});

describe('install.sh signature verification (TESTATLAS_VERIFY_SIGNATURE)', skipOnWindows, () => {
  it('exits 1 with cosign-not-found error when env=1 AND cosign absent', () => {
    const cleanPath = pathWithoutCosign();
    if (cosignOnPath(cleanPath)) return; // skip if system has cosign

    // We won't actually run install (it would try to download). Instead,
    // source the script in dry-mode by using a tarball override + setting
    // TESTATLAS_VERIFY_SIGNATURE=1; the verify step should fire BEFORE
    // network/extract.
    //
    // The easiest test: the env-var triggers a check at the top of _main
    // (or just before _verify_checksum). We rely on the script erroring on
    // missing cosign before reaching the network.
    //
    // To avoid network, we provide a minimal local tarball override.
    const tinyTarball = path.join(tmpdir(), 'testatlas-fake.tgz');
    spawnSync('sh', ['-c', `printf '' > "${tinyTarball}"`], { encoding: 'utf8' });

    const result = spawnSync('sh', [INSTALL_SH], {
      env: {
        ...process.env,
        PATH: cleanPath,
        TESTATLAS_VERIFY_SIGNATURE: '1',
        _TESTATLAS_TARBALL_OVERRIDE: tinyTarball,
        TESTATLAS_SKIP_CHECKSUM: '1',
      },
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cosign/i);
  });

  it('without the env-var (default), install.sh does not check for cosign', () => {
    // We just look for: when TESTATLAS_VERIFY_SIGNATURE is unset, the
    // script does not mention cosign in its output. Exact behavior beyond
    // that is covered by Plan 07-02 install-sh tests.
    const cleanPath = pathWithoutCosign();

    const result = spawnSync('sh', [INSTALL_SH, '--help'], {
      env: { ...process.env, PATH: cleanPath },
      encoding: 'utf8',
    });

    // install.sh has no --help; expect non-zero exit but no cosign mention.
    assert.doesNotMatch(result.stderr, /cosign not found/i);
  });
});
