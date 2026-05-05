// test/scripts/setup-dogfood-env.test.js
//
// Quick 260506-07b — Wire cosign into dogfood-test environment.
// RED test driving the GREEN delivery of `scripts/setup-dogfood-env.sh`.
//
// Contract under test:
//   - Script exists at scripts/setup-dogfood-env.sh and is executable.
//   - Probes cosign, shellcheck, gh, sha256sum, tar, git, curl, jq, node.
//   - When PATH is sanitized (binaries missing), exits non-zero AND prints a
//     per-missing-binary install hint to stderr (apt/brew/winget/raw-download
//     where appropriate).
//
// The full check matrix runs only on Linux+macOS (POSIX shell environment).
// Windows CI runs the dogfood install via npx flow and skips this script.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.join(import.meta.dirname, '..', '..', 'scripts', 'setup-dogfood-env.sh');

test('setup-dogfood-env.sh: file exists and is executable', async () => {
  await access(SCRIPT, constants.F_OK);
  await access(SCRIPT, constants.X_OK);
});

test('setup-dogfood-env.sh: probes cosign, shellcheck, gh by name (source-text smoke)', async () => {
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(SCRIPT, 'utf8');
  // Required-binary probes documented in the brief.
  for (const bin of [
    'cosign',
    'shellcheck',
    'gh',
    'sha256sum',
    'tar',
    'git',
    'curl',
    'jq',
    'node',
  ]) {
    assert.match(buf, new RegExp(`\\b${bin}\\b`), `expected probe for "${bin}"`);
  }
});

test('setup-dogfood-env.sh: with empty PATH, exits non-zero AND emits per-binary hints', async (t) => {
  // Skip on Windows — the script is /bin/sh and runs only on POSIX runners.
  if (process.platform === 'win32') return t.skip('POSIX-only script');

  const result = spawnSync('/bin/sh', [SCRIPT], {
    env: {
      // PATH stripped so every probe MUST miss. Keep HOME/TMPDIR for mktemp et al.
      PATH: '/nonexistent-testatlas-stub-path',
      HOME: process.env.HOME ?? '/tmp',
    },
    encoding: 'utf8',
    timeout: 10_000,
  });

  // Either non-zero exit OR (if the binary truly is missing on the runner)
  // the script must communicate that fact. We require exit != 0 here.
  assert.notEqual(result.status, 0, 'expected non-zero exit when binaries missing');

  const out = `${result.stdout}\n${result.stderr}`;
  // Per-missing-binary install hint must surface for at least one binary.
  // We assert on cosign explicitly (the marquee binary for this quick).
  assert.match(out, /cosign/i, 'expected cosign mentioned in output');
  assert.match(
    out,
    /sigstore\.dev|cosign-installer|brew install cosign|raw download/i,
    'expected actionable install hint for cosign',
  );
});

test('setup-dogfood-env.sh: --help prints usage', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only script');
  const result = spawnSync('/bin/sh', [SCRIPT, '--help'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 0, 'help should exit 0');
  assert.match(result.stdout, /[Uu]sage/, 'help should print usage');
});
