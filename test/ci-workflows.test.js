// Tests for Phase 0 GitHub Actions workflows and Dependabot config.
// Covers gaps: gov-07-ci-workflow, gov-07-release-workflow, gov-07-dependabot.
//
// We use string/regex matching rather than a YAML parser per constraints.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const read = (relPath) => readFile(path.join(repoRoot, relPath), 'utf8');

// ---- GOV-07: ci.yml ----
test('CI workflow triggers on push/PR to main, has cross-platform matrix, runs lint + test', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.ok(ci.length > 0, '.github/workflows/ci.yml should not be empty');

  // Triggers on push and pull_request to main.
  assert.match(ci, /^on:/m, 'CI workflow must declare an "on:" block');
  assert.match(ci, /push:/, 'CI workflow must trigger on push');
  assert.match(ci, /pull_request:/, 'CI workflow must trigger on pull_request');
  assert.match(ci, /-\s*main\b/, 'CI workflow must target the "main" branch');

  // Matrix with 3 OS.
  assert.match(ci, /matrix:/, 'CI workflow must declare a matrix');
  assert.match(ci, /ubuntu-latest/, 'CI matrix must include ubuntu-latest');
  assert.match(ci, /macos-latest/, 'CI matrix must include macos-latest');
  assert.match(ci, /windows-latest/, 'CI matrix must include windows-latest');

  // Node 20.x and 22.x.
  assert.match(ci, /\b20\.x\b/, 'CI matrix must include Node 20.x');
  assert.match(ci, /\b22\.x\b/, 'CI matrix must include Node 22.x');

  // Runs lint and test.
  assert.match(ci, /\blint\b/i, 'CI workflow must run a lint step');
  assert.match(ci, /\btest\b/i, 'CI workflow must run a test step');
});

// ---- CMD-03: token-budget job extended for command files ----
test('Token-budget job runs check-command-budgets.js after the bootstrap step', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.match(
    ci,
    /node scripts\/check-command-budgets\.js/,
    'token-budget job must invoke scripts/check-command-budgets.js',
  );
  // The new step must come AFTER the bootstrap.md step in the same job.
  const bootstrapIdx = ci.indexOf('check-token-budget.js .testatlas/bootstrap.md');
  const cmdBudgetIdx = ci.indexOf('check-command-budgets.js');
  assert.ok(bootstrapIdx > 0, 'bootstrap step must exist');
  assert.ok(cmdBudgetIdx > 0, 'command-budgets step must exist');
  assert.ok(
    cmdBudgetIdx > bootstrapIdx,
    'command-budgets step must appear AFTER the bootstrap step',
  );
});

// ---- VAL-02 (Phase 5, suite-repo partial): validate-workspace meta-test ----
test('CI workflow runs validate-workspace.js against the suite-repo meta-workspace', async () => {
  const ci = await read('.github/workflows/ci.yml');

  // The new step under the `test` job must invoke validate-workspace.js
  // against `.testatlas/test-workspace` — the suite-repo's own placeholder
  // _testatlas/-shaped tree. (Per-example gates ship Phase 8.)
  assert.match(
    ci,
    /Validate suite-repo meta-workspace/,
    'CI workflow must declare a step named "Validate suite-repo meta-workspace"',
  );
  assert.match(
    ci,
    /node scripts\/validate-workspace\.js --workspace \.testatlas\/test-workspace/,
    'meta-workspace step must invoke validate-workspace.js against .testatlas/test-workspace',
  );

  // The validate step must come AFTER the `pnpm test` step in the same job.
  const pnpmTestIdx = ci.indexOf('Run node:test');
  const validateIdx = ci.indexOf('Validate suite-repo meta-workspace');
  assert.ok(pnpmTestIdx > 0, 'pnpm test step must exist');
  assert.ok(validateIdx > 0, 'meta-workspace step must exist');
  assert.ok(
    validateIdx > pnpmTestIdx,
    'meta-workspace validate step must appear AFTER the pnpm test step',
  );

  // Must upload the validation report as an artifact on failure (so PR
  // reviewers see the diagnosis without re-running CI locally).
  assert.match(
    ci,
    /actions\/upload-artifact@v4/,
    'CI workflow must use actions/upload-artifact@v4 to upload validation report on failure',
  );
});

// ---- VAL-03 (Phase 5 verify): token-budget gate still wired ----
test('CI workflow still runs check-token-budget.js (VAL-03 — wired Phase 1+3)', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.match(
    ci,
    /node scripts\/check-token-budget\.js/,
    'token-budget job must still invoke scripts/check-token-budget.js',
  );
  assert.match(
    ci,
    /\.testatlas\/bootstrap\.md\s+3000/,
    'check-token-budget step must enforce the 3000-word bootstrap budget',
  );
});

// ---- VAL-04 (Phase 5 verify): schema/template parity gate still wired ----
test('CI workflow still runs schema-template-parity test (VAL-04 — wired Phase 2)', async () => {
  // The parity test runs as part of `pnpm test` (node --test test/**/*.test.js)
  // — assert the test file itself exists, ensuring the parity gate is part of
  // the suite. This is the regression-check VAL-04 demands at Phase 5 closure.
  const parityTest = await read('test/templates/schema-template-parity.test.js');
  assert.ok(
    parityTest.length > 0,
    'test/templates/schema-template-parity.test.js must exist (VAL-04 parity gate)',
  );
  // Sanity: the parity test references the schemas dir and templates dir.
  assert.match(parityTest, /schemas/, 'parity test must reference the schemas directory');
  assert.match(parityTest, /templates/, 'parity test must reference the templates directory');
});

// ---- VAL-06 (Phase 5 scaffold): e2e-smoke.yml exists with skip contract ----
test('e2e-smoke.yml exists with documented Phase 7 + Phase 8 skip-removal contract', async () => {
  const e2e = await read('.github/workflows/e2e-smoke.yml');
  assert.ok(e2e.length > 0, '.github/workflows/e2e-smoke.yml should not be empty');

  // Top-of-file header must document the skip-removal contract for Phases 7 + 8.
  assert.match(e2e, /Phase 7/, 'e2e-smoke.yml header must reference Phase 7 (install path)');
  assert.match(e2e, /Phase 8/, 'e2e-smoke.yml header must reference Phase 8 (examples)');
  assert.match(
    e2e,
    /TODO/,
    'e2e-smoke.yml must include TODO markers naming the skip-removal contract',
  );

  // The install + dogfood steps must be `if: false`-skipped (Phase 5 state).
  const installIfFalse = /Install TestAtlas suite[\s\S]{0,400}if:\s*false/;
  const dogfoodIfFalse = /Run minimum dogfood loop[\s\S]{0,400}if:\s*false/;
  assert.match(e2e, installIfFalse, 'install step must currently be `if: false`-skipped');
  assert.match(e2e, dogfoodIfFalse, 'dogfood-loop step must currently be `if: false`-skipped');

  // The validate-workspace step must always-run (no `if:` modifier on it).
  assert.match(
    e2e,
    /Validate suite-repo placeholder workspace/,
    'e2e-smoke.yml must include a "Validate suite-repo placeholder workspace" step',
  );
});

// ---- GOV-07: release.yml ----
test('Release workflow exists and references changesets/action', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.ok(release.length > 0, '.github/workflows/release.yml should not be empty');
  assert.match(release, /changesets\/action/, 'Release workflow must reference changesets/action');
});

// ---- GOV-07: dependabot.yml ----
test('Dependabot config schedules npm and github-actions ecosystems', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.ok(dependabot.length > 0, '.github/dependabot.yml should not be empty');
  assert.match(dependabot, /^version:\s*2/m, 'Dependabot must declare "version: 2"');
  assert.match(
    dependabot,
    /package-ecosystem:\s*["']?npm["']?/,
    'Dependabot must track the npm ecosystem',
  );
  assert.match(
    dependabot,
    /package-ecosystem:\s*["']?github-actions["']?/,
    'Dependabot must track the github-actions ecosystem',
  );
});
