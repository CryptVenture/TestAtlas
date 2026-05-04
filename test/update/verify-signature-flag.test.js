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
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

async function makeCosignShim(dir, exitCode = 0) {
  const shim = path.join(dir, 'cosign');
  await writeFile(
    shim,
    `#!/bin/sh\n# Test shim for cosign\necho "cosign-shim invoked: $*" >&2\nexit ${exitCode}\n`,
  );
  await chmod(shim, 0o755);
  return shim;
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

  it('accepts the flag when cosign IS on PATH (shim)', async () => {
    const shimDir = path.join(tmp, 'bin');
    await mkdir(shimDir, { recursive: true });
    await makeCosignShim(shimDir, 0);

    const targetDir = path.join(tmp, 'target');
    await mkdir(targetDir, { recursive: true });

    const result = spawnSync(
      'node',
      [BIN, 'init', '--verify-signature', '--target', targetDir, '--dry-run'],
      {
        env: { ...process.env, PATH: `${shimDir}:${pathWithoutCosign()}` },
        encoding: 'utf8',
      },
    );

    // We expect dry-run to succeed (exit 0) — proving cosign probe accepted
    // the shim and didn't bail.
    assert.equal(
      result.status,
      0,
      `expected exit 0 with shim, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
    // Should not contain the "cosign not found" error.
    assert.doesNotMatch(result.stderr, /cosign not found/i);
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
