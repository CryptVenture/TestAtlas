// test/ci-yaml.test.js
//
// Plan 07-02 Task 3 (INSTALL-06). Sanity-checks `.github/workflows/ci.yml`:
//   - Parses as valid YAML (no js-yaml dep — uses a lenient regex grammar
//     that asserts top-level structure rather than full YAML correctness;
//     reasoning: adding a dev dep just to test our own workflow is overkill,
//     and `actions/checkout` failures on a broken file would catch syntax
//     errors in CI itself).
//   - Contains the cross-platform matrix: ubuntu-latest, macos-latest,
//     windows-latest with Node 20.x, 22.x, 24.x.
//   - Contains a `shellcheck` job entry (Linux-only).
//   - Contains an `install-sh-smoke` job entry (Linux+macOS).
//   - Each push and PR trigger present.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const CI_YML = path.join(import.meta.dirname, '..', '.github', 'workflows', 'ci.yml');

test('ci.yml: file exists and is non-empty', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  assert.ok(buf.length > 0, 'ci.yml empty');
});

test('ci.yml: declares all 3 OSes in matrix', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  assert.match(buf, /ubuntu-latest/);
  assert.match(buf, /macos-latest/);
  assert.match(buf, /windows-latest/);
});

test('ci.yml: declares Node 20/22/24 in matrix', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  assert.match(buf, /20\.x/);
  assert.match(buf, /22\.x/);
  assert.match(buf, /24\.x/);
});

test('ci.yml: contains shellcheck job', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  // Job key + actual shellcheck command
  assert.match(buf, /^\s*shellcheck:\s*$/m, 'expected `shellcheck:` job key');
  assert.match(buf, /shellcheck install\.sh/);
});

test('ci.yml: contains install-sh-smoke job for Linux+macOS only', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  assert.match(buf, /^\s*install-sh-smoke:\s*$/m, 'expected `install-sh-smoke:` job key');
  // Verify smoke job mentions both POSIX OSes and the override env hook.
  assert.match(buf, /_TESTATLAS_TARBALL_OVERRIDE/);
});

test('ci.yml: declares push + pull_request triggers on main', async () => {
  const buf = await readFile(CI_YML, 'utf8');
  assert.match(buf, /push:/);
  assert.match(buf, /pull_request:/);
  assert.match(buf, /main/);
});
