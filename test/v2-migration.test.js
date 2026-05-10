// test/v2-migration.test.js
//
// Wave 0: Verify V1 → V2 migration works without data loss.
//
// Each test owns a unique mkdtemp dir. The previous shared `TMP_DIR`
// (`<repo>/tmp-test-v2-migration/`) was a `rm`-then-`mkdir` race
// waiting to happen — `cleanup()` at the start of each test cleared
// it and `createMockV1Workspace()` re-created it, but on macOS the
// VFS occasionally surfaced inode state from the deletion as ENOENT
// on the immediately-following readFile. Per-test mkdtemp eliminates
// the shared mutable state entirely; tests can now run in any order
// (including parallel, should node:test ever default to that).

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { migrateV2 } from '../scripts/v2-migrate.js';

const SUITE_ROOT = path.resolve(import.meta.dirname, '..');

async function makeTmpDir() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-v2-migration-'));
}

// Phase 18-01 (ISSUE-010): seed `.testatlas/{default.config.json,config.schema.json}`
// inside `tmp/` so `loadConfig({ cwd: tmp })` succeeds. Optionally write a
// `testatlas.config.json` project-override to flip safeMode / allowDestructiveActions.
async function seedConfig(tmp, override) {
  const dst = path.join(tmp, '.testatlas');
  await mkdir(dst, { recursive: true });
  await cp(
    path.join(SUITE_ROOT, '.testatlas', 'default.config.json'),
    path.join(dst, 'default.config.json'),
  );
  await cp(
    path.join(SUITE_ROOT, '.testatlas', 'config.schema.json'),
    path.join(dst, 'config.schema.json'),
  );
  if (override) {
    await writeFile(path.join(tmp, 'testatlas.config.json'), JSON.stringify(override, null, 2));
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

async function createMockV1Workspace(tmpDir) {
  await mkdir(path.join(tmpDir, '_testatlas'), { recursive: true });

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
    path.join(tmpDir, '_testatlas', '11_workspace_manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // V1 canonical file
  await writeFile(
    path.join(tmpDir, '_testatlas', '00_overview.md'),
    '# Overview\n\nTest project.\n',
  );

  // V1 issue
  await mkdir(path.join(tmpDir, '_testatlas', 'to_fix'), { recursive: true });
  await writeFile(
    path.join(tmpDir, '_testatlas', 'to_fix', 'ISSUE-001-test.json'),
    JSON.stringify({ id: 'ISSUE-001', title: 'Test issue', severity: 'medium' }),
  );

  // Minimal suite source tree so copyV2Artifacts has something to copy
  await mkdir(path.join(tmpDir, '.testatlas', 'agents', 'personas', 'system'), {
    recursive: true,
  });
  await writeFile(
    path.join(tmpDir, '.testatlas', 'agents', 'personas', 'system', 'test-persona.md'),
    '---\nid: test-persona\n---\n# Test Persona\n',
  );
  await writeFile(
    path.join(tmpDir, '.testatlas', 'agents', 'personas', 'system', 'test-persona.json'),
    JSON.stringify({ id: 'test-persona', name: 'Test Persona', type: 'system' }),
  );
  await mkdir(path.join(tmpDir, '.testatlas', 'agents', 'councils', 'council_templates'), {
    recursive: true,
  });
  await writeFile(
    path.join(tmpDir, '.testatlas', 'agents', 'councils', 'council_templates', 'test.json'),
    JSON.stringify({ id: 'test', mode: 'roundtable-review' }),
  );
  await mkdir(path.join(tmpDir, '.testatlas', 'schemas'), { recursive: true });
  await writeFile(
    path.join(tmpDir, '.testatlas', 'schemas', 'test.schema.json'),
    JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://testatlas.dev/schemas/v2/test.schema.json',
      type: 'object',
    }),
  );
}

async function cleanup(tmpDir) {
  await rm(tmpDir, { recursive: true, force: true });
}

test('migrate detects no-workspace', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const r = await migrateV2({ cwd: tmpDir });
    assert.equal(r.status, 'no-workspace');
    assert.equal(r.created.length, 0);
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate detects already-v2 and repairs missing artifacts', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);

    // Pre-mark as V2
    const manifestPath = path.join(tmpDir, '_testatlas', '11_workspace_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.schema_version = '2.0.0';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const r = await migrateV2({ cwd: tmpDir });
    // Repair mode: copies missing personas, council templates, schemas
    assert.ok(
      r.status === 'already-v2' || r.status === 'repaired',
      `Expected already-v2 or repaired, got ${r.status}`,
    );
    if (r.status === 'repaired') {
      assert.ok(r.created.length > 0, 'Expected artifacts to be copied in repair mode');
      // Verify personas were copied
      const personaDir = path.join(tmpDir, '_testatlas', 'agents', 'personas', 'system');
      const personas = await readdir(personaDir).catch(() => []);
      assert.ok(personas.length > 0, 'Expected personas to be copied');
    }
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate creates all V2 directories', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    const r = await migrateV2({ cwd: tmpDir });
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
      const entries = await readdir(path.join(tmpDir, '_testatlas', dir));
      assert.ok(Array.isArray(entries), `Directory missing: ${dir}`);
    }
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate creates brain files', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    await migrateV2({ cwd: tmpDir });

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
      const content = await readFile(path.join(tmpDir, '_testatlas', file), 'utf8');
      assert.ok(content.length > 0, `Brain file empty: ${file}`);
    }
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate preserves V1 data', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    await migrateV2({ cwd: tmpDir });

    // Original manifest data preserved
    const manifestPath = path.join(tmpDir, '_testatlas', '11_workspace_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.project.name, 'Test Project');
    assert.equal(manifest.counts.domains, 2);

    // Original canonical file preserved
    const overview = await readFile(path.join(tmpDir, '_testatlas', '00_overview.md'), 'utf8');
    assert.ok(overview.includes('Test project'));

    // Original issue preserved
    const issue = JSON.parse(
      await readFile(path.join(tmpDir, '_testatlas', 'to_fix', 'ISSUE-001-test.json'), 'utf8'),
    );
    assert.equal(issue.id, 'ISSUE-001');
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate updates manifest schema_version', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    await migrateV2({ cwd: tmpDir });

    const manifestPath = path.join(tmpDir, '_testatlas', '11_workspace_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.schema_version, '2.0.0');
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate creates backup', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    const r = await migrateV2({ cwd: tmpDir });
    assert.ok(r.backupPath, 'Expected backup path');

    const backupManifest = path.join(r.backupPath, '11_workspace_manifest.json');
    const backupContent = await readFile(backupManifest, 'utf8');
    const manifest = JSON.parse(backupContent);
    assert.equal(manifest.project.name, 'Test Project');
  } finally {
    await cleanup(tmpDir);
  }
});

test('migrate appends event to events.jsonl', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    await migrateV2({ cwd: tmpDir });

    const eventsPath = path.join(tmpDir, '_testatlas', 'brain', 'events.jsonl');
    const content = await readFile(eventsPath, 'utf8');
    const event = JSON.parse(content.trim());
    assert.equal(event.actor, 'v2-migrate.js');
    assert.equal(event.command, '/atlas:migrate');
    assert.equal(event.status, 'completed');
  } finally {
    await cleanup(tmpDir);
  }
});

// Phase 18-01 / ISSUE-010 — capability gate must halt destructive backup under safeMode:true.
test('migrateV2 halts under safeMode:true with no FS mutation', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: true, allowDestructiveActions: false });

    const wsRoot = path.join(tmpDir, '_testatlas');
    const pre = await snapshot(wsRoot);

    await assert.rejects(
      migrateV2({ cwd: tmpDir }),
      (e) => e.code === 'CAPABILITY_DENIED' && /v2-migrate halted:/.test(e.message),
      'migrateV2 must throw CAPABILITY_DENIED with "v2-migrate halted:" prefix under safeMode',
    );

    const post = await snapshot(wsRoot);
    assert.deepStrictEqual(post, pre, 'workspace must be byte-identical after denied call');
  } finally {
    await cleanup(tmpDir);
  }
});

// post-Phase-19 dogfood NEW-002 — legacy `brain/events.json` cleanup.
// Older migration code emitted `events.json` (top-level array shape) alongside
// `events.jsonl`; current code only writes `.jsonl`, leaving any pre-existing
// `events.json` as an orphan. Migration must remove it so the audit trail is
// single-source.
test('migrate removes legacy brain/events.json orphan if present', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await createMockV1Workspace(tmpDir);
    await seedConfig(tmpDir, { safeMode: false, allowDestructiveActions: true });

    // Pre-seed the legacy artifact in the V1 brain dir before migration.
    // mkdir recursive so we don't depend on V2 dir creation order.
    const brainDir = path.join(tmpDir, '_testatlas', 'brain');
    await mkdir(brainDir, { recursive: true });
    const legacyJson = path.join(brainDir, 'events.json');
    await writeFile(
      legacyJson,
      JSON.stringify({
        events: [
          {
            timestamp: '2026-05-07T11:43:41.000Z',
            command: 'maintain-migrate',
            from_schema_version: '1.x',
            to_schema_version: '2.0.0',
          },
        ],
      }),
    );

    const r = await migrateV2({ cwd: tmpDir });
    assert.equal(r.status, 'migrated');

    // events.json (legacy) must be GONE.
    await assert.rejects(
      stat(legacyJson),
      (e) => e.code === 'ENOENT',
      'legacy brain/events.json must be removed by migration',
    );

    // events.jsonl (canonical) must EXIST and carry at least the migration event.
    const eventsJsonl = path.join(brainDir, 'events.jsonl');
    const jsonlContent = await readFile(eventsJsonl, 'utf8');
    assert.ok(
      jsonlContent.includes('"command":"/atlas:migrate"'),
      'events.jsonl must contain the migration event',
    );
  } finally {
    await cleanup(tmpDir);
  }
});
