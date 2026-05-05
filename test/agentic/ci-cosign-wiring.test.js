// test/agentic/ci-cosign-wiring.test.js
//
// Quick 260506-07b — Wire cosign into dogfood-test environment.
// RED test asserting `.github/workflows/ci.yml` provisions cosign + shellcheck
// on every Linux/macOS test runner that may exercise dogfood install/verify
// scenarios. Windows is exempt (no POSIX shell installer there).
//
// Why ci-pinned: contributors should not have to install cosign by hand for
// dogfood-test runs in CI. The matching local pre-flight script is
// `scripts/setup-dogfood-env.sh` (test/scripts/setup-dogfood-env.test.js).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const CI_YML = path.join(import.meta.dirname, '..', '..', '.github', 'workflows', 'ci.yml');

test('ci.yml: declares sigstore/cosign-installer step (pinned)', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  // Action reference: `sigstore/cosign-installer@<sha-or-version>`. We accept
  // either a SHA pin (preferred — matches actions/checkout pattern in this
  // file) or the v3 tag.
  assert.match(
    buf,
    /sigstore\/cosign-installer@[0-9a-f]{40}|sigstore\/cosign-installer@v3/,
    'expected sigstore/cosign-installer pinned reference in ci.yml',
  );
});

test('ci.yml: prereq step is named "Install dogfood-test prerequisites (cosign + shellcheck)"', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  // The brief mandates this exact step name for grep-ability.
  assert.match(
    buf,
    /name:\s*Install dogfood-test prerequisites \(cosign \+ shellcheck\)/,
    'expected canonical step name',
  );
});

test('ci.yml: prereq step echoes cosign + shellcheck binary versions', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  // Version echoes are verifiable in the job log without re-spawning the step.
  assert.match(buf, /cosign version/, 'expected `cosign version` echo in ci.yml');
  assert.match(buf, /shellcheck --version/, 'expected `shellcheck --version` echo in ci.yml');
});

test('ci.yml: existing shellcheck job still runs against install.sh', async () => {
  // Regression guard — Quick 260506-07b adds wiring; it must not regress
  // the dedicated install.sh shellcheck gate.
  const buf = await readFile(CI_YML, 'utf8');
  assert.match(buf, /shellcheck install\.sh/);
});

test('ci.yml: existing matrix unchanged (Linux+macOS+Windows × Node 20/22/24)', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.match(buf, new RegExp(os));
  }
  for (const ver of ['20.x', '22.x', '24.x']) {
    assert.match(buf, new RegExp(ver.replace('.', '\\.')));
  }
});
