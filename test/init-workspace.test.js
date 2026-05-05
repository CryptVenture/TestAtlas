// test/init-workspace.test.js
//
// Integration tests for scripts/init-workspace.js — Plan 02-04.
// Covers WORK-01 (workspace skeleton creation), WORK-02 (idempotency),
// WORK-06 (two-tree guard invocation), WORK-07 (manifest with section hashes).

import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../scripts/init-workspace.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';
import { makeWorkspaceFixture } from './_helpers.js';

const TOP_LEVEL_SUBDIRS = [
  'domains',
  'components',
  'pages',
  'api',
  'cli',
  'jobs',
  'integrations',
  'data',
  'flows',
  'stories',
  'personas',
  'states',
  'plans',
  'research',
  'setup',
  'tests',
  'evidence',
  'reports',
  'to_fix',
  'sub_agents',
  'history',
  'templates_used',
  'scratch',
];

const NESTED_DIRS = [
  'tests/scenarios',
  'tests/runs',
  'api/endpoints',
  'cli/commands',
  'data/schemas',
  'sub_agents/handoffs',
  'sub_agents/outputs',
  'sub_agents/reviews',
  'to_fix/by_domain',
  'to_fix/by_severity',
  'to_fix/by_status',
  'to_fix/by_type',
  'evidence/screenshots',
  'evidence/videos',
  'evidence/traces',
  'evidence/logs',
  'evidence/network',
  'evidence/console',
  'evidence/api',
  'evidence/db',
  'evidence/files',
  'evidence/accessibility',
  'evidence/performance',
];

const CANONICAL_FILES = [
  '00_overview.md',
  '01_system_map.md',
  '02_test_strategy.md',
  '03_execution_status.md',
  '04_open_questions.md',
  '05_assumptions.md',
  '06_risks_and_gaps.md',
  '07_environment_and_access.md',
  '08_glossary.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '11_workspace_manifest.json',
  '12_app_map.json',
  '13_quality_scorecard.md',
];

const MANIFEST_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/workspace-manifest.schema.json';

/** Recursively count directories under `root` (excluding `root` itself). */
async function countDirsRecursive(root) {
  let count = 0;
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      count += 1;
      count += await countDirsRecursive(path.join(root, e.name));
    }
  }
  return count;
}

// ───────────────────────────── WORK-01 ─────────────────────────────

test('WORK-01: creates all 23 top-level subdirectories', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });
  assert.equal(r.status, 'initialized');

  for (const sub of TOP_LEVEL_SUBDIRS) {
    const s = await stat(path.join(r.wsDir, sub));
    assert.ok(s.isDirectory(), `${sub} must be a directory`);
  }
});

test('WORK-01: creates all nested subdirectories (47 total dirs incl. root)', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });

  // 1 (wsDir itself, but counted by parent) + 23 top-level + 23 nested = 46 under wsDir.
  // Total directories per <authoritative_data> = 47 (1 + 23 + 23).
  const childDirCount = await countDirsRecursive(r.wsDir);
  assert.equal(
    childDirCount,
    TOP_LEVEL_SUBDIRS.length + NESTED_DIRS.length,
    `expected ${TOP_LEVEL_SUBDIRS.length + NESTED_DIRS.length} dirs under wsDir, got ${childDirCount}`,
  );

  // Plus the wsDir itself = 47 total.
  const totalDirs = childDirCount + 1;
  assert.equal(totalDirs, 47, 'total directories (incl. wsDir root) must be 47');

  // Every nested dir is a directory.
  for (const nested of NESTED_DIRS) {
    const s = await stat(path.join(r.wsDir, nested));
    assert.ok(s.isDirectory(), `nested dir ${nested} must exist`);
  }
});

test('WORK-01/WORK-02: writes all 14 canonical files from templates', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });

  for (const file of CANONICAL_FILES) {
    const filePath = path.join(r.wsDir, file);
    const s = await stat(filePath);
    assert.ok(s.isFile(), `${file} must exist`);
    const content = await readFile(filePath, 'utf8');
    assert.ok(content.length > 0, `${file} must be non-empty`);
  }

  assert.equal(r.created.length, CANONICAL_FILES.length);
});

test('WORK-01: 12_app_map.json parses and has all 11 required arrays empty', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });
  const appMap = JSON.parse(await readFile(path.join(r.wsDir, '12_app_map.json'), 'utf8'));

  for (const key of [
    'domains',
    'routes',
    'components',
    'apis',
    'cliCommands',
    'jobs',
    'integrations',
    'entities',
    'flows',
    'tests',
    'relationships',
  ]) {
    assert.ok(Array.isArray(appMap[key]), `app_map.${key} must be an array`);
    assert.equal(appMap[key].length, 0, `app_map.${key} must be empty after init`);
  }
});

// ─────────────────────────── WORK-07 manifest ───────────────────────────

test('WORK-07: manifest has required fields', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });
  const manifest = JSON.parse(
    await readFile(path.join(r.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );

  for (const key of [
    'suite',
    'workspaceVersion',
    'workspaceDir',
    'initializedAt',
    'lastUpdatedAt',
    'project',
    'counts',
    'latestReport',
    'status',
    'generatedSections',
  ]) {
    assert.ok(key in manifest, `manifest missing required field "${key}"`);
  }

  assert.equal(manifest.suite, 'TestAtlas');
  assert.equal(manifest.workspaceVersion, '1');
  assert.equal(manifest.status, 'initialized');
  // ISO timestamp shape (no '0000-00-00...' placeholders).
  assert.match(manifest.initializedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.match(manifest.lastUpdatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(manifest.latestReport, null);
  assert.equal(manifest.counts.domains, 0);
  assert.equal(typeof manifest.project, 'object');
});

test('WORK-07: manifest records section hashes for marker-bearing canonicals', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });
  const manifest = JSON.parse(
    await readFile(path.join(r.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );

  assert.equal(typeof manifest.generatedSections, 'object');
  const fileKeys = Object.keys(manifest.generatedSections);
  assert.ok(fileKeys.length > 0, 'generatedSections must have at least one file entry');

  // 03_execution_status.md is a known marker-bearing file with multiple sections.
  const execKey = fileKeys.find((k) => k.endsWith('03_execution_status.md'));
  assert.ok(execKey, 'generatedSections must include 03_execution_status.md');

  const sections = manifest.generatedSections[execKey];
  assert.equal(typeof sections, 'object');
  const slugs = Object.keys(sections);
  assert.ok(slugs.length > 0, '03_execution_status.md must have at least one section hash');

  // Each hash is a 64-char hex string (Phase 11 widened from 16; first 16
  // chars equal pre-Phase-11 output for legacy-manifest compat).
  for (const [slug, hash] of Object.entries(sections)) {
    assert.match(hash, /^[0-9a-f]{64}$/, `${slug} hash must be 64-hex`);
  }
});

test('WORK-07: manifest validates against workspace-manifest.schema.json', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });
  const manifest = JSON.parse(
    await readFile(path.join(r.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );

  const ajv = await loadAllSchemas({ cwd: fx.cwd });
  const validate = ajv.getSchema(MANIFEST_SCHEMA_ID);
  assert.ok(validate, 'workspace-manifest schema must be registered');
  const ok = validate(manifest);
  assert.ok(ok, `manifest must validate; errors: ${JSON.stringify(validate.errors)}`);
});

// ─────────────────────────── WORK-02 idempotency ───────────────────────────

test('WORK-02: idempotent — skips when fully initialized', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const first = await initWorkspace({ cwd: fx.cwd });
  assert.equal(first.status, 'initialized');

  const second = await initWorkspace({ cwd: fx.cwd });
  assert.equal(second.status, 'already-initialized');
  assert.deepEqual(second.created, []);
});

test('WORK-02: file mtimes unchanged on re-run when fully initialized', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });
  const probe = path.join(r.wsDir, '03_execution_status.md');
  const before = await stat(probe);

  await new Promise((res) => setTimeout(res, 50));

  await initWorkspace({ cwd: fx.cwd });
  const after = await stat(probe);

  assert.equal(after.mtimeMs, before.mtimeMs, 'mtime must not change on idempotent re-run');
});

test('WORK-02: fills only missing canonicals (partial-fill)', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd });

  // Sample mtime of one file we are NOT removing — must NOT change.
  const survivor = path.join(r.wsDir, '03_execution_status.md');
  const beforeSurvivor = await stat(survivor);

  // Remove two canonicals.
  await rm(path.join(r.wsDir, '04_open_questions.md'));
  await rm(path.join(r.wsDir, '08_glossary.md'));

  await new Promise((res) => setTimeout(res, 20));

  const second = await initWorkspace({ cwd: fx.cwd });
  assert.equal(second.status, 'partial-fill');
  assert.deepEqual([...second.created].sort(), ['04_open_questions.md', '08_glossary.md'].sort());

  // Survivor mtime unchanged.
  const afterSurvivor = await stat(survivor);
  assert.equal(afterSurvivor.mtimeMs, beforeSurvivor.mtimeMs);

  // The two missing files are now present.
  await stat(path.join(r.wsDir, '04_open_questions.md'));
  await stat(path.join(r.wsDir, '08_glossary.md'));
});

test('WORK-02: refuses ambiguous workspace (dir without manifest)', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  // Create an empty _testatlas/ dir (no manifest).
  await mkdir(path.join(fx.cwd, '_testatlas'), { recursive: true });
  await writeFile(path.join(fx.cwd, '_testatlas', 'unrelated.txt'), 'user data\n', 'utf8');

  await assert.rejects(
    () => initWorkspace({ cwd: fx.cwd }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_AMBIGUOUS_WORKSPACE');
      return true;
    },
  );
});

test('WORK-02: --force overrides ambiguous-workspace refusal', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  await mkdir(path.join(fx.cwd, '_testatlas'), { recursive: true });

  const r = await initWorkspace({ cwd: fx.cwd, force: true });
  // The wsDir pre-existed (without manifest), so when --force suppresses the
  // refusal and the loop creates all 14 missing canonicals, the status is
  // 'partial-fill' (canonicals were missing). Either way, --force succeeds
  // where without --force it would have thrown TESTATLAS_AMBIGUOUS_WORKSPACE.
  assert.ok(['initialized', 'partial-fill'].includes(r.status));
  assert.equal(r.created.length, 14, 'should write all 14 canonicals');
});

// ─────────────────────────── WORK-06 guard ───────────────────────────

test('WORK-06: throws TESTATLAS_SUITE_MISSING when .testatlas/bootstrap.md absent', async (t) => {
  const fx = await makeWorkspaceFixture({ withSuite: false });
  t.after(fx.cleanup);

  await assert.rejects(
    () => initWorkspace({ cwd: fx.cwd }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_SUITE_MISSING');
      return true;
    },
  );
});

test('WORK-06: assertNotUpdate is invoked with "init" before any FS write', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const calls = [];
  const recorder = (ctx) => {
    calls.push(ctx);
  };

  const r = await initWorkspace({ cwd: fx.cwd }, { assertNotUpdate: recorder });
  assert.equal(r.status, 'initialized');
  assert.ok(calls.length >= 1, 'assertNotUpdate must be called at least once');
  assert.equal(calls[0], 'init', 'first call must be with "init"');
});

test('WORK-06: injected guard that throws prevents any FS mutation', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const exploding = () => {
    const e = new Error('blocked by test guard');
    e.code = 'TESTATLAS_TWO_TREE_VIOLATION';
    throw e;
  };

  await assert.rejects(
    () => initWorkspace({ cwd: fx.cwd }, { assertNotUpdate: exploding }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_TWO_TREE_VIOLATION');
      return true;
    },
  );

  // Workspace dir must NOT have been created.
  const wsExists = await stat(path.join(fx.cwd, '_testatlas')).catch(() => null);
  assert.equal(wsExists, null, 'guard threw → no workspace dir');
});

// ─────────────────────────── flag handling ───────────────────────────

test('WORK-01: --workspace flag respected (custom dir name)', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const r = await initWorkspace({ cwd: fx.cwd, workspaceDir: 'custom_ws' });
  assert.equal(r.status, 'initialized');
  assert.equal(r.wsDir, path.join(fx.cwd, 'custom_ws'));
  const s = await stat(r.wsDir);
  assert.ok(s.isDirectory());
});

test('Status code mapping: initialized → already-initialized → partial-fill', async (t) => {
  const fx = await makeWorkspaceFixture();
  t.after(fx.cleanup);

  const a = await initWorkspace({ cwd: fx.cwd });
  assert.equal(a.status, 'initialized');

  const b = await initWorkspace({ cwd: fx.cwd });
  assert.equal(b.status, 'already-initialized');

  await rm(path.join(a.wsDir, '08_glossary.md'));

  const c = await initWorkspace({ cwd: fx.cwd });
  assert.equal(c.status, 'partial-fill');
});
