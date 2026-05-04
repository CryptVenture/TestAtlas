// test/ci/e2e-smoke-matrix.test.js
//
// Plan 08-04 Task 2 — assertions for .github/workflows/e2e-smoke.yml after
// the dogfood-loop placeholder is replaced with the regenerate + validate
// matrix across all 5 examples (closes EX-06 + completes VAL-02).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'e2e-smoke.yml');

async function load() {
  return readFile(WORKFLOW, 'utf8');
}

test('e2e-smoke matrix: workflow file no longer carries any `if: false` placeholder', async () => {
  const wf = await load();
  // Both Phase 7 (install) and Phase 8 (dogfood-loop) skips must be gone.
  assert.equal(
    /^\s*if:\s*false\s*$/m.test(wf),
    false,
    'workflow still contains an `if: false` line — Phase 7 / Phase 8 skip removal incomplete',
  );
});

test('e2e-smoke matrix: workflow YAML has the documented top-level keys (parses as expected text)', async () => {
  const wf = await load();
  assert.match(wf, /^name:\s*E2E Smoke/m);
  assert.match(wf, /^on:/m);
  assert.match(wf, /^jobs:/m);
});

test('e2e-smoke matrix: matrix.example contains all 4 single-workspace example names', async () => {
  const wf = await load();
  // The matrix MUST list all 4 single-workspace examples explicitly.
  // Order does not matter — test by membership.
  const matrixSection = wf.match(/matrix:[\s\S]+?(?:\n\s*steps:|\n\s*[a-z][a-z-]*:\s*\n\s{0,4}\S)/);
  assert.ok(matrixSection, 'workflow must define a matrix block');
  for (const name of ['nextjs-saas', 'node-api', 'cli-tool', 'mobile-web-hybrid']) {
    assert.ok(
      matrixSection[0].includes(name),
      `matrix.example must include ${name} (got: ${matrixSection[0]})`,
    );
  }
});

test('e2e-smoke matrix: workflow runs `regenerate-example.js ... --check` for each matrix example', async () => {
  const wf = await load();
  assert.match(
    wf,
    /node scripts\/regenerate-example\.js examples\/\$\{\{\s*matrix\.example\s*\}\}\s+--check/,
    'workflow must invoke regenerate-example.js with --check on the matrix example',
  );
});

test('e2e-smoke matrix: workflow runs `validate-workspace.js --workspace` for each matrix example', async () => {
  const wf = await load();
  assert.match(
    wf,
    /node scripts\/validate-workspace\.js --workspace examples\/\$\{\{\s*matrix\.example\s*\}\}\/_testatlas/,
    'workflow must invoke validate-workspace.js --workspace per matrix example',
  );
});

test('e2e-smoke matrix: separate monorepo-validate job runs `validate-workspace.js --all-workspaces examples/monorepo`', async () => {
  const wf = await load();
  // The monorepo job must exist under jobs:.
  assert.match(wf, /^\s{2}monorepo-validate:/m, 'workflow must define a monorepo-validate job');
  // It must run --all-workspaces against examples/monorepo.
  assert.match(
    wf,
    /node scripts\/validate-workspace\.js --all-workspaces examples\/monorepo/,
    'monorepo-validate job must invoke validate-workspace.js --all-workspaces examples/monorepo',
  );
  // It must regenerate-check the monorepo root + each app.
  assert.match(
    wf,
    /node scripts\/regenerate-example\.js examples\/monorepo\s+--check/,
    'monorepo-validate job must regenerate-check examples/monorepo',
  );
});

test('e2e-smoke matrix: matrix uses `fail-fast: false` so all examples report independently', async () => {
  const wf = await load();
  assert.match(wf, /fail-fast:\s*false/, 'matrix must use fail-fast: false');
});

test('e2e-smoke matrix: workflow `on:` triggers include `pull_request` (matrix runs on every PR)', async () => {
  const wf = await load();
  // The on: block must contain a pull_request key.
  const onBlock = wf.match(/^on:[\s\S]+?(?=^[a-z])/m);
  assert.ok(onBlock, 'workflow must define an on: block');
  assert.match(onBlock[0], /pull_request:/, 'on: must include pull_request:');
});
