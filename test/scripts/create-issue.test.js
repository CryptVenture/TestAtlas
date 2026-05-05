// test/scripts/create-issue.test.js
//
// Phase 10 Plan 03: pin CLI flag → schema field mapping for create-issue.js. Closes ISSUE-005.
//
// These tests spawn `node scripts/create-issue.js` as a subprocess to verify
// that the THREE missing schema-required-field flags (`--repro-steps`,
// `--frequency`, `--acceptance-criteria`) are accepted by the argv parser
// AND end up in the emitted JSON sidecar matching `issue.schema.json`. Also
// pins the `--help` text and back-compat for prior flags.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { makeValidationFixture, REPO_ROOT } from '../_helpers.js';

const CREATE_ISSUE = path.join(REPO_ROOT, 'scripts', 'create-issue.js');

/**
 * Minimal baseline argv that satisfies all REQUIRED createIssue() invariants
 * (--title, --domain, ≥1 --evidence) so we can vary only the flag under test.
 */
function baseline(extra = []) {
  return [
    '--title',
    'CLI flag round-trip test',
    '--domain',
    'domain-auth',
    '--severity',
    'high',
    '--confidence',
    'confirmed',
    '--type',
    'functional',
    '--summary',
    'baseline',
    '--expected-behavior',
    'baseline',
    '--actual-behavior',
    'baseline',
    '--user-impact',
    'baseline',
    '--evidence',
    'EVIDENCE-001',
    ...extra,
  ];
}

/**
 * Run create-issue.js with given argv against a temp workspace fixture; return
 * the parsed JSON sidecar of the freshly emitted issue.
 */
async function runAndReadSidecar(fx, extraArgs) {
  const argv = ['--cwd', fx.cwd, '--workspace', fx.wsDir, ...baseline(extraArgs)];
  const proc = spawnSync('node', [CREATE_ISSUE, ...argv], {
    encoding: 'utf8',
  });
  assert.equal(
    proc.status,
    0,
    `create-issue.js exited ${proc.status}\nSTDOUT:\n${proc.stdout}\nSTDERR:\n${proc.stderr}`,
  );
  // Find the freshly written ISSUE-*.json file (highest-numbered).
  const entries = await readdir(path.join(fx.wsDir, 'to_fix'));
  const jsons = entries
    .filter((n) => /^ISSUE-\d{3,}-.*\.json$/.test(n))
    .sort()
    .reverse();
  assert.ok(jsons.length > 0, `expected ≥1 ISSUE-*.json under to_fix/, got: ${entries.join(', ')}`);
  const written = JSON.parse(await readFile(path.join(fx.wsDir, 'to_fix', jsons[0]), 'utf8'));
  return written;
}

test('CLI: --repro-steps single value populates reproductionSteps[]', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const written = await runAndReadSidecar(fx, ['--repro-steps', 'Open the page']);
  assert.deepEqual(written.reproductionSteps, ['Open the page']);
});

test('CLI: --repro-steps repeated builds string array in order', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const written = await runAndReadSidecar(fx, [
    '--repro-steps',
    'Step 1',
    '--repro-steps',
    'Step 2',
  ]);
  assert.deepEqual(written.reproductionSteps, ['Step 1', 'Step 2']);
});

test('CLI: --frequency populates frequency with schema-enum value', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const written = await runAndReadSidecar(fx, ['--frequency', 'always']);
  assert.equal(written.frequency, 'always');
});

test('CLI: --acceptance-criteria repeated builds string array', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const written = await runAndReadSidecar(fx, [
    '--acceptance-criteria',
    'Form rejects whitespace',
    '--acceptance-criteria',
    'Error message displayed',
  ]);
  assert.deepEqual(written.acceptanceCriteria, [
    'Form rejects whitespace',
    'Error message displayed',
  ]);
});

test('CLI: --help advertises all three new flags with names and schema mapping hint', () => {
  const proc = spawnSync('node', [CREATE_ISSUE, '--help'], { encoding: 'utf8' });
  assert.equal(proc.status, 0, `--help exited ${proc.status}`);
  const out = proc.stdout + proc.stderr;
  assert.match(out, /--repro-steps/, '--help must mention --repro-steps');
  assert.match(out, /--frequency/, '--help must mention --frequency');
  assert.match(out, /--acceptance-criteria/, '--help must mention --acceptance-criteria');
  // Frequency enum hint must mirror the schema enum exactly.
  assert.match(
    out,
    /always.*intermittent.*unknown/,
    '--help must show frequency enum (always|intermittent|unknown) matching issue.schema.json',
  );
});

test('CLI: existing flags preserved (back-compat) — minimal invocation without new flags emits valid record with frequency defaulted', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const written = await runAndReadSidecar(fx, []);
  assert.equal(
    written.frequency,
    'unknown',
    'omitting --frequency must default to schema-valid "unknown"',
  );
  assert.ok(Array.isArray(written.reproductionSteps), 'reproductionSteps must be an array');
  assert.deepEqual(
    written.reproductionSteps,
    [],
    'omitting --repro-steps must yield empty array (schema requires array)',
  );
  assert.ok(
    Array.isArray(written.acceptanceCriteria) && written.acceptanceCriteria.length >= 1,
    'omitting --acceptance-criteria must still satisfy minItems:1 via fallback',
  );
});
