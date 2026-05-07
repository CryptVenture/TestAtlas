// test/v2-migration.test.js
//
// Wave 0: Verify V1 → V2 migration works without data loss.

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { migrateV2 } from '../scripts/v2-migrate.js';

const TMP_DIR = path.resolve(import.meta.dirname, '..', 'tmp-test-v2-migration');
const SUITE_ROOT = path.resolve(import.meta.dirname, '..');

// Phase 18-01 (ISSUE-010): seed `.testatlas/{default.config.json,config.schema.json}`
// inside `tmp/` so `loadConfig({ cwd: tmp })` succeeds. Optionally write a
// `testatlas.config.json` project-override to flip safeMode / allowDestructiveActions.
async function seedConfig(tmp, override) {
  const dst = path.join(tmp, '.testatlas');
  await mkdir(dst, { recursive: true });
  await cp(path.join(SUITE_ROOT, '.testatlas', 'default.config.json'),
           path.join(dst, 'default.config.json'));
  await cp(path.join(SUITE_ROOT, '.testatlas', 'config.schema.json'),
           path.join(dst, 'config.schema.json'));
  if (override) {
    await writeFile(path.join(tmp, 'testatlas.config.json'),
                    JSON.stringify(override, null, 2));
  }
}

// Recursively snapshot every file under `root` to a Map<relPath, sha256:size>
// for byte-identical pre/post comparison.
async function snapshot(root) {
  const out = new Map();
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const buf = await readFile(full);
        const st = await stat(full);
        const sha = createHash('sha256').update(buf).digest('hex');
        out.set(path.relative(root, full), `${sha}:${st.size}`);
      }
    }
  }
  await walk(root);
  return out;
}

async function createMockV1Workspace() {
  await mkdir(TMP_DIR, { recursive: true });
  await mkdir(path.join(TMP_DIR, '_testatlas'), { recursive: true });

  // V1 manifest
  const manifest = {
    workspaceDir: '_testatlas',
    initializedAt: '2026-05-01T12:00:00Z',
    lastUpdatedAt: '2026-05-01T12:00:00Z',
    project: { name: 'Test Project' },
    status: 'initialized',
    counts: { domains: 2, flows: 3, issues: 1, evidenceRecords: 0, testRuns: 0 },
    generatedSections: {},
  };
  await writeFile(
    path.join(TMP_DIR, '_testatlas', '11_workspace_manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // V1 canonical file
  await writeFile(
    path.join(TMP_DIR, '_testatlas', '00_overview.md'),
    '# Overview\n\nTest project.\n',
  );

  // V1 issue
  await mkdir(path.join(TMP_DIR, '_testatlas', 'to_fix'), { recursive: true });
  await writeFile(
    path.join(TMP_DIR, '_testatlas', 'to_fix', 'ISSUE-001-test.json'),
    JSON.stringify({ id: 'ISSUE-001', title: 'Test issue', severity: 'medium' }),
  );
}

async function cleanup() {
  await rm(TMP_DIR, { recursive: true, force: true });
}

test('migrate detects no-workspace', async () => {
  await cleanup();
  await mkdir(TMP_DIR, { recursive: true });
  const r = await migrateV2({ cwd: TMP_DIR });
  assert.equal(r.status, 'no-workspace');
  assert.equal(r.created.length, 0);
});

test('migrate detects already-v2', async () => {
  await cleanup();
  await createMockV1Workspace();

  // Pre-mark as V2
  const manifestPath = path.join(TMP_DIR, '_testatlas', '11_workspace_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.schema_version = '2.0.0';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const r = await migrateV2({ cwd: TMP_DIR });
  assert.equal(r.status, 'already-v2');
  assert.equal(r.created.length, 0);
});

test('migrate creates all V2 directories', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: false, allowDestructiveActions: true });

  const r = await migrateV2({ cwd: TMP_DIR });
  assert.equal(r.status, 'migrated');
  assert.ok(r.created.length > 0, 'Expected files to be created');

  const requiredDirs = [
    'bootstrap',
    'brain/schema',
    'agents/personas/system',
    'agents/personas/generated',
    'agents/personas/project',
    'agents/councils/sessions',
    'agents/councils/transcripts',
    'agents/councils/outputs',
    'agents/councils/consolidations',
    'agents/handoffs',
    'agents/outputs',
    'agents/scorecards',
    'maps',
    'stories',
    'tests/generated_automation',
    'tests/retest_packs',
  ];

  for (const dir of requiredDirs) {
    const entries = await readdir(path.join(TMP_DIR, '_testatlas', dir));
    assert.ok(Array.isArray(entries), `Directory missing: ${dir}`);
  }
});

test('migrate creates brain files', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: false, allowDestructiveActions: true });

  await migrateV2({ cwd: TMP_DIR });

  const brainFiles = [
    'brain/manifest.json',
    'brain/state.json',
    'brain/domains.json',
    'brain/flows.json',
    'brain/risks.json',
    'brain/assumptions.json',
    'brain/decisions.json',
    'brain/events.jsonl',
  ];

  for (const file of brainFiles) {
    const content = await readFile(path.join(TMP_DIR, '_testatlas', file), 'utf8');
    assert.ok(content.length > 0, `Brain file empty: ${file}`);
  }
});

test('migrate preserves V1 data', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: false, allowDestructiveActions: true });

  await migrateV2({ cwd: TMP_DIR });

  // Original manifest data preserved
  const manifestPath = path.join(TMP_DIR, '_testatlas', '11_workspace_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.project.name, 'Test Project');
  assert.equal(manifest.counts.domains, 2);

  // Original canonical file preserved
  const overview = await readFile(path.join(TMP_DIR, '_testatlas', '00_overview.md'), 'utf8');
  assert.ok(overview.includes('Test project'));

  // Original issue preserved
  const issue = JSON.parse(
    await readFile(path.join(TMP_DIR, '_testatlas', 'to_fix', 'ISSUE-001-test.json'), 'utf8'),
  );
  assert.equal(issue.id, 'ISSUE-001');
});

test('migrate updates manifest schema_version', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: false, allowDestructiveActions: true });

  await migrateV2({ cwd: TMP_DIR });

  const manifestPath = path.join(TMP_DIR, '_testatlas', '11_workspace_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schema_version, '2.0.0');
});

test('migrate creates backup', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: false, allowDestructiveActions: true });

  const r = await migrateV2({ cwd: TMP_DIR });
  assert.ok(r.backupPath, 'Expected backup path');

  const backupManifest = path.join(r.backupPath, '11_workspace_manifest.json');
  const backupContent = await readFile(backupManifest, 'utf8');
  const manifest = JSON.parse(backupContent);
  assert.equal(manifest.project.name, 'Test Project');
});

test('migrate appends event to events.jsonl', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: false, allowDestructiveActions: true });

  await migrateV2({ cwd: TMP_DIR });

  const eventsPath = path.join(TMP_DIR, '_testatlas', 'brain', 'events.jsonl');
  const content = await readFile(eventsPath, 'utf8');
  const event = JSON.parse(content.trim());
  assert.equal(event.actor, 'v2-migrate.js');
  assert.equal(event.command, '/atlas:migrate');
  assert.equal(event.status, 'completed');
});

// Phase 18-01 / ISSUE-010 — capability gate must halt destructive backup under safeMode:true.
test('migrateV2 halts under safeMode:true with no FS mutation', async () => {
  await cleanup();
  await createMockV1Workspace();
  await seedConfig(TMP_DIR, { safeMode: true, allowDestructiveActions: false });

  const wsRoot = path.join(TMP_DIR, '_testatlas');
  const pre = await snapshot(wsRoot);

  await assert.rejects(
    migrateV2({ cwd: TMP_DIR }),
    (e) => e.code === 'CAPABILITY_DENIED' && /v2-migrate halted:/.test(e.message),
    'migrateV2 must throw CAPABILITY_DENIED with "v2-migrate halted:" prefix under safeMode',
  );

  const post = await snapshot(wsRoot);
  assert.deepStrictEqual(post, pre, 'workspace must be byte-identical after denied call');
});

// Cleanup after all tests
await cleanup();
