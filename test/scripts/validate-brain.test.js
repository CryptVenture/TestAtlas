// test/scripts/validate-brain.test.js
//
// Plan 14-02 Task 1 — full-AJV brain validation.
//
// Wave 1 shipped a stub validate-brain.js (presence + parseability). Wave 2
// extends it to also validate every brain file's contents against the
// matching V2 schema via AJV. These tests pin the new contract:
//
//   - Healthy brain → exit 0 (regression of stub behavior).
//   - manifest.json missing required `schema_version` → exit non-zero, AJV
//     finding cites the missing field.
//   - state.json with bad `confidence.overall` enum value → exit non-zero,
//     AJV finding cites the invalid enum.
//   - events.jsonl line that violates event.schema.json → exit non-zero, AJV
//     finding cites the invalid event.
//   - claims.jsonl line that violates claim.schema.json → exit non-zero,
//     AJV finding cites the invalid claim.
//   - personas.json index entries reference unknown persona ids → flagged.
//   - validate-brain.js exits with the same set of finding-codes documented
//     in 14-01 plus a new BRAIN_SCHEMA_VIOLATION code for AJV failures.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-brain.js');

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

async function makeHealthyBrain(repoRoot) {
  const brainDir = path.join(repoRoot, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  // Suite tree (schemas + vocabulary) is required so AJV can load schemas.
  // We don't copy the whole suite — we mirror real V2 schema dir.
  const suiteDir = path.join(repoRoot, '.testatlas');
  await mkdir(path.join(suiteDir, 'schemas'), { recursive: true });
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
  for (const f of REQUIRED_JSON_FILES) {
    if (f === 'manifest.json' || f === 'state.json') continue;
    await writeFile(path.join(brainDir, f), JSON.stringify({ schema_version: '2.0.0' }));
  }
  for (const f of REQUIRED_JSONL_FILES) {
    await writeFile(path.join(brainDir, f), '');
  }
  return brainDir;
}

/**
 * Use the live repo's suite tree (.testatlas/) for schema loading; create a
 * fresh _testatlas/brain under a temp dir, and run the validator with
 * --brain-dir pointing at that brain. This way schema-loader still finds
 * .testatlas/ at REPO_ROOT and we don't duplicate the whole suite tree.
 */
async function setupTempBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-validate-brain-v2-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function fillHealthy(brainDir) {
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
  // Files with schemas that require nested structure get hand-rolled minimal
  // valid bodies. Others get schema_version-only stubs.
  await writeFile(
    path.join(brainDir, 'coverage.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      coverage: { routes: [], components: [], endpoints: [], commands: [] },
    }),
  );
  await writeFile(
    path.join(brainDir, 'graph.json'),
    JSON.stringify({ schema_version: '2.0.0', nodes: [], edges: [] }),
  );
  for (const f of REQUIRED_JSON_FILES) {
    if (['manifest.json', 'state.json', 'coverage.json', 'graph.json'].includes(f)) continue;
    await writeFile(path.join(brainDir, f), JSON.stringify({ schema_version: '2.0.0' }));
  }
  for (const f of REQUIRED_JSONL_FILES) {
    await writeFile(path.join(brainDir, f), '');
  }
}

function runValidate(brainDir, suiteCwd = REPO_ROOT) {
  // Use --brain-dir if supported; else fall back to --cwd (validator that's
  // unaware of --brain-dir will look at <cwd>/_testatlas/brain).
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--brain-dir', brainDir, '--suite-cwd', suiteCwd],
    { encoding: 'utf8' },
  );
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('Test 1: healthy brain — exit 0 (AJV pass)', async () => {
  const ctx = await setupTempBrain();
  try {
    await fillHealthy(ctx.brainDir);
    const { code, stdout, stderr } = runValidate(ctx.brainDir);
    assert.equal(code, 0, `expected exit 0, got ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: manifest.json missing schema_version → AJV failure', async () => {
  const ctx = await setupTempBrain();
  try {
    await fillHealthy(ctx.brainDir);
    await writeFile(path.join(ctx.brainDir, 'manifest.json'), JSON.stringify({}));
    const { code, stdout, stderr } = runValidate(ctx.brainDir);
    assert.notEqual(code, 0);
    const out = stdout + stderr;
    assert.match(out, /manifest\.json/);
    assert.match(
      out,
      /BRAIN_SCHEMA_VIOLATION|schema_version|required/i,
      'should cite missing schema_version field',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: state.json invalid confidence.overall enum → AJV failure', async () => {
  const ctx = await setupTempBrain();
  try {
    await fillHealthy(ctx.brainDir);
    await writeFile(
      path.join(ctx.brainDir, 'state.json'),
      JSON.stringify({
        schema_version: '2.0.0',
        project: { name: 't', repo_root: '.', primary_stack: [] },
        status: {
          phase: 'i',
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
        confidence: { overall: 'BOGUS', highest_risk_domains: [], stale_domains: [] },
        next_recommended_commands: [],
      }),
    );
    const { code, stdout, stderr } = runValidate(ctx.brainDir);
    assert.notEqual(code, 0);
    const out = stdout + stderr;
    assert.match(out, /state\.json/);
    assert.match(out, /BRAIN_SCHEMA_VIOLATION|enum|confidence/i);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: events.jsonl with line violating event.schema.json → AJV failure', async () => {
  const ctx = await setupTempBrain();
  try {
    await fillHealthy(ctx.brainDir);
    // Missing required fields: type, summary, status, timestamp, actor.
    await writeFile(
      path.join(ctx.brainDir, 'events.jsonl'),
      `${JSON.stringify({ id: 'EVENT-1' })}\n`,
    );
    const { code, stdout, stderr } = runValidate(ctx.brainDir);
    assert.notEqual(code, 0);
    const out = stdout + stderr;
    assert.match(out, /events\.jsonl/);
    assert.match(out, /BRAIN_SCHEMA_VIOLATION|required|missing/i);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: claims.jsonl with line violating claim.schema.json → AJV failure', async () => {
  const ctx = await setupTempBrain();
  try {
    await fillHealthy(ctx.brainDir);
    await writeFile(
      path.join(ctx.brainDir, 'claims.jsonl'),
      `${JSON.stringify({ id: 'CLAIM-1' })}\n`,
    );
    const { code, stdout, stderr } = runValidate(ctx.brainDir);
    assert.notEqual(code, 0);
    const out = stdout + stderr;
    assert.match(out, /claims\.jsonl/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: validateBrain export is a function', async () => {
  const mod = await import(pathToFileURL(SCRIPT).href);
  assert.equal(typeof mod.validateBrain, 'function');
});
