// test/scripts/validate-handoff.test.js
//
// Regression tests for scripts/validate-handoff.js — the AJV2020 + ajv-formats
// handoff JSON sidecar validator built atop the suite-canonical getAjv()
// singleton + loadAllSchemas() registry. Closes Phase 18 sub-finding #4
// (deferred): /atlas:handoff was reporting "partial" because no accelerator
// existed for the validation step.
//
// Naming note: the malformed fixture is named `missing-agent-id.json` to
// match the wording in 19-CONTEXT.md A4 ("missing required field, e.g.
// `agent_id`"), but the schema's actual required field that's omitted is
// `assignedRole` (the handoff schema does not have an `agent_id` field).
// The fixture is a verbatim clone of valid/minimal.json with the
// `assignedRole` line removed, so AJV will report a missing-required
// violation naming `assignedRole` — that's what Test 2 asserts on.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-handoff.js');
const VALID = path.join(
  REPO_ROOT,
  'test',
  'fixtures',
  'schemas',
  'sub-agent-handoff',
  'valid',
  'minimal.json',
);
const INVALID = path.join(
  REPO_ROOT,
  'test',
  'fixtures',
  'schemas',
  'sub-agent-handoff',
  'invalid',
  'missing-agent-id.json',
);

test('validate-handoff: valid fixture exits 0', () => {
  const r = spawnSync('node', [SCRIPT, VALID], { encoding: 'utf8', cwd: REPO_ROOT });
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test('validate-handoff: invalid fixture (missing assignedRole) exits 1 with named-field error', () => {
  const r = spawnSync('node', [SCRIPT, INVALID], { encoding: 'utf8', cwd: REPO_ROOT });
  assert.equal(r.status, 1, `expected non-zero exit; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  const out = r.stdout + r.stderr;
  assert.match(out, /assignedRole/, 'output should name the missing field');
});

test('validate-handoff: --cwd to dir without .testatlas/schemas wraps as TESTATLAS_SCHEMAS_DIR_MISSING', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'th-validate-handoff-'));
  const r = spawnSync('node', [SCRIPT, VALID, '--cwd', dir], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  assert.equal(r.status, 1);
  const out = r.stdout + r.stderr;
  assert.match(out, /TESTATLAS_SCHEMAS_DIR_MISSING|schemas directory not found/);
});
