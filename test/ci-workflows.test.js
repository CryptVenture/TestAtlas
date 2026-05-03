// Tests for Phase 0 GitHub Actions workflows and Dependabot config.
// Covers gaps: gov-07-ci-workflow, gov-07-release-workflow, gov-07-dependabot.
//
// We use string/regex matching rather than a YAML parser per constraints.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

// ---- GOV-07: release.yml ----
test('Release workflow exists and references changesets/action', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.ok(release.length > 0, '.github/workflows/release.yml should not be empty');
  assert.match(
    release,
    /changesets\/action/,
    'Release workflow must reference changesets/action',
  );
});

// ---- GOV-07: dependabot.yml ----
test('Dependabot config schedules npm and github-actions ecosystems', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.ok(dependabot.length > 0, '.github/dependabot.yml should not be empty');
  assert.match(
    dependabot,
    /^version:\s*2/m,
    'Dependabot must declare "version: 2"',
  );
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
