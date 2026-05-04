// VAL-06 E2E smoke scaffold test.
//
// Phase 5 (scaffold) state: .github/workflows/e2e-smoke.yml shipped with the
// install + dogfood steps `if: false`-skipped; the validate-workspace step
// runs always.
//
// Phase 8 plan 08-04 (current state) closure: the dogfood-loop placeholder
// is REPLACED with a real regenerate + validate matrix across all 4
// single-workspace examples plus a separate `monorepo-validate` job. The
// install step (which referenced a `scripts/install.js` path that never
// landed) is also removed; suite-installation in CI runs via
// `pnpm install --frozen-lockfile=false` per-job.
//
// This test asserts the post-08-04 contract:
//   - workflow file is well-formed and triggers on push/pull_request
//   - meta-workspace validate is preserved (always runs)
//   - the canonical jobs (validate-examples matrix, monorepo-validate,
//     suite-repo-validate) are all defined
//
// Per-matrix-leg behavioral assertions live in test/ci/e2e-smoke-matrix.test.js.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const e2ePath = path.join(repoRoot, '.github', 'workflows', 'e2e-smoke.yml');

test('e2e-smoke.yml exists and declares the documented top-level keys', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  assert.ok(yamlText.length > 0, '.github/workflows/e2e-smoke.yml must not be empty');

  assert.match(yamlText, /^name:\s*E2E Smoke/m, 'workflow must declare name: E2E Smoke');
  assert.match(yamlText, /^on:/m, 'workflow must declare an `on:` block');
  assert.match(yamlText, /^jobs:/m, 'workflow must declare a `jobs:` block');
});

test('e2e-smoke.yml triggers on both push and pull_request to main', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  assert.match(yamlText, /push:/);
  assert.match(yamlText, /pull_request:/);
});

test('e2e-smoke.yml defines the three closure jobs (validate-examples matrix, monorepo-validate, suite-repo-validate)', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  assert.match(yamlText, /^\s{2}validate-examples:/m, 'must define validate-examples (matrix) job');
  assert.match(yamlText, /^\s{2}monorepo-validate:/m, 'must define monorepo-validate job');
  assert.match(
    yamlText,
    /^\s{2}suite-repo-validate:/m,
    'must define suite-repo-validate job (replaces Phase 5 single-job posture)',
  );
});

test('e2e-smoke.yml suite-repo-validate job preserves the meta-workspace validate command', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  // The Phase 5 contract: validate-workspace.js runs against
  // .testatlas/test-workspace. After 08-04 it lives in the
  // suite-repo-validate job; the command itself is unchanged.
  assert.match(
    yamlText,
    /node scripts\/validate-workspace\.js --workspace \.testatlas\/test-workspace/,
    'suite-repo meta-workspace validate command must remain intact',
  );
});

test('e2e-smoke.yml carries no leftover `if: false` placeholder lines (Phase 8 closure)', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  assert.equal(
    /^\s*if:\s*false\s*$/m.test(yamlText),
    false,
    'Phase 8 plan 08-04 must remove all `if: false` placeholder skips',
  );
});
