// test/brain-validation.test.js
//
// Plan 14-01 Task 3 — validate-brain.js stub.
//
// Verifies:
//   - exit 0 on a healthy brain (all required files present + parseable).
//   - exit non-zero when a required brain file is missing.
//   - exit non-zero when a brain JSON file is unparseable.
//   - exit non-zero when a JSONL file has a malformed line.
//   - top-level required fields per file type are checked.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-brain.js');

// Required brain files per Wave 0 SUMMARY (22 = 19 JSON + 3 JSONL).
const REQUIRED_JSON_FILES = [
  'manifest.json',
  'state.json',
  'agent_sessions.json',
  'assumptions.json',
  'commands.json',
  'components.json',
  'coverage.json',
  'decisions.json',
  'domains.json',
  'drift.json',
  'embeddings_manifest.json',
  'evidence.json',
  'flows.json',
  'graph.json',
  'issues.json',
  'open_questions.json',
  'personas.json',
  'quality_scores.json',
  'risks.json',
  'routes.json',
];

const REQUIRED_JSONL_FILES = ['claims.jsonl', 'events.jsonl', 'observations.jsonl'];

async function makeHealthyBrain(dir) {
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  // Minimal valid manifest + state.
  await writeFile(
    path.join(brainDir, 'manifest.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      suite_version: '2.0.0',
      initialized_at: '2026-05-07T00:00:00Z',
      last_updated: '2026-05-07T00:00:00Z',
      project_name: 'test',
      adapters: [],
      schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
    }),
  );
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      project: { name: 'test', repo_root: '.', primary_stack: [] },
      status: {
        phase: 'initialized',
        last_updated: '2026-05-07T00:00:00Z',
        active_environment: 'local',
      },
      counts: {
        domains: 0,
        flows: 0,
        issues: 0,
        critical_issues: 0,
        high_issues: 0,
        evidence_artifacts: 0,
        council_sessions: 0,
      },
      confidence: { overall: 'unknown', highest_risk_domains: [], stale_domains: [] },
      next_recommended_commands: [],
    }),
  );
  // Other JSON files: empty objects/arrays are acceptable for the stub validator.
  for (const f of REQUIRED_JSON_FILES) {
    if (f === 'manifest.json' || f === 'state.json') continue;
    await writeFile(path.join(brainDir, f), JSON.stringify({ schema_version: '2.0.0' }));
  }
  for (const f of REQUIRED_JSONL_FILES) {
    await writeFile(path.join(brainDir, f), '');
  }
  return brainDir;
}

function runValidate(cwd) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('Test 1: exit 0 on a healthy brain', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-brain-validation-'));
  try {
    await makeHealthyBrain(dir);
    const { code, stdout, stderr } = runValidate(dir);
    assert.equal(code, 0, `expected exit 0, got ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Test 2: non-zero when a required brain file is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-brain-validation-'));
  try {
    const brainDir = await makeHealthyBrain(dir);
    await rm(path.join(brainDir, 'manifest.json'));
    const { code, stdout, stderr } = runValidate(dir);
    assert.notEqual(code, 0, `expected non-zero, got ${code}`);
    const combined = stdout + stderr;
    assert.match(combined, /manifest\.json/, 'output should mention missing file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Test 3: non-zero when a brain JSON file contains invalid JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-brain-validation-'));
  try {
    const brainDir = await makeHealthyBrain(dir);
    await writeFile(path.join(brainDir, 'graph.json'), '{ not json');
    const { code, stdout, stderr } = runValidate(dir);
    assert.notEqual(code, 0, `expected non-zero, got ${code}`);
    const combined = stdout + stderr;
    assert.match(combined, /graph\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Test 4: non-zero when a JSONL file has a malformed line', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-brain-validation-'));
  try {
    const brainDir = await makeHealthyBrain(dir);
    await writeFile(path.join(brainDir, 'events.jsonl'), '{"id":"E1"}\nNOT_JSON\n{"id":"E2"}\n');
    const { code, stdout, stderr } = runValidate(dir);
    assert.notEqual(code, 0, `expected non-zero, got ${code}`);
    const combined = stdout + stderr;
    assert.match(combined, /events\.jsonl/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Test 5: state.json must have required top-level fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-brain-validation-'));
  try {
    const brainDir = await makeHealthyBrain(dir);
    await writeFile(path.join(brainDir, 'state.json'), JSON.stringify({ wrong: 'shape' }));
    const { code, stdout, stderr } = runValidate(dir);
    assert.notEqual(code, 0, `expected non-zero, got ${code}`);
    const combined = stdout + stderr;
    assert.match(combined, /state\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Test 6: empty JSONL is acceptable (healthy)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-brain-validation-'));
  try {
    await makeHealthyBrain(dir);
    // Healthy brain already has empty JSONL files; this re-asserts.
    const { code } = runValidate(dir);
    assert.equal(code, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Test 7: validateBrain function is exportable', async () => {
  const mod = await import(SCRIPT);
  assert.equal(typeof mod.validateBrain, 'function', 'validate-brain.js must export validateBrain');
});
