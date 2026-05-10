// test/scripts/detect-drift.test.js
//
// Plan 14-06 Task 2 — detect-drift.js detects drift inputs per PRD §7.16,
// maps changed files to affected domains/flows, and assigns drift status.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'detect-drift.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function setupRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-drift-'));
  // Init a git repo with package-lock + a route file + a domain.
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  await writeFile(path.join(dir, 'package-lock.json'), '{"name":"x","version":"1"}\n');
  await mkdir(path.join(dir, 'src', 'routes'), { recursive: true });
  await writeFile(path.join(dir, 'src', 'routes', 'auth.ts'), '// initial\n');
  await mkdir(path.join(dir, 'src', 'components'), { recursive: true });
  await writeFile(path.join(dir, 'src', 'components', 'Login.tsx'), 'export default null;\n');
  await mkdir(path.join(dir, 'test'), { recursive: true });
  await writeFile(path.join(dir, 'test', 'auth.test.js'), '// test\n');
  await mkdir(path.join(dir, 'migrations'), { recursive: true });
  await writeFile(path.join(dir, 'migrations', '001-init.sql'), 'CREATE TABLE x;\n');
  await mkdir(path.join(dir, 'openapi'), { recursive: true });
  await writeFile(path.join(dir, 'openapi', 'api.yaml'), 'openapi: 3.0.0\n');
  // brain
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: now, last_command: 'init' }),
  );
  await writeFile(
    path.join(brainDir, 'manifest.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      suite_version: '2.0.0',
      initialized_at: now,
      last_updated: now,
      project_name: 'fixture',
      adapters: [],
      schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
    }),
  );
  await writeFile(
    path.join(brainDir, 'domains.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: now,
      domains: [
        { id: 'domain-auth', source_paths: ['src/routes/auth.ts'], flows: ['FLOW-1'] },
        { id: 'domain-billing', source_paths: ['src/billing'], flows: ['FLOW-2'] },
      ],
    }),
  );
  await writeFile(
    path.join(brainDir, 'flows.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: now,
      flows: [
        {
          id: 'FLOW-1',
          domain: 'domain-auth',
          source_paths: ['src/routes/auth.ts', 'src/components/Login.tsx'],
        },
        { id: 'FLOW-2', domain: 'domain-billing', source_paths: [] },
      ],
    }),
  );
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'initial');
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: detectDrift detects changed files since baseline ref + maps to domains/flows', async () => {
  const ctx = await setupRepo();
  try {
    // Modify the auth route after baseline.
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'auth.ts'), '// changed\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change auth');

    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    assert.equal(r.ok, true);
    const all = r.drift_records;
    const changedFiles = all.flatMap((d) => d.changed_files ?? []);
    assert.ok(changedFiles.includes('src/routes/auth.ts'), 'expected route file in drift');
    const affected = all.flatMap((d) => d.affected_domains ?? []);
    assert.ok(affected.includes('domain-auth'), 'expected domain-auth as affected');
    const flows = all.flatMap((d) => d.affected_flows ?? []);
    assert.ok(flows.includes('FLOW-1'), 'expected FLOW-1 as affected');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: detectDrift flags package lock changes', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'package-lock.json'), '{"name":"x","version":"2"}\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'bump lock');

    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    const cats = r.drift_records.flatMap((d) => d.categories ?? []);
    assert.ok(cats.includes('package_lock'), 'expected package_lock category in drift');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: detectDrift covers all 7 PRD §7.16 input categories', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    // Touch one file in every category.
    await writeFile(path.join(ctx.dir, 'package-lock.json'), '{"v":2}\n');
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'auth.ts'), '// v2\n');
    await writeFile(path.join(ctx.dir, 'openapi', 'api.yaml'), 'openapi: 3.0.1\n');
    await writeFile(path.join(ctx.dir, 'migrations', '001-init.sql'), 'CREATE TABLE y;\n');
    await writeFile(path.join(ctx.dir, 'src', 'components', 'Login.tsx'), '// v2\n');
    await writeFile(path.join(ctx.dir, 'test', 'auth.test.js'), '// v2\n');
    // Generic git change: a new file outside any category.
    await writeFile(path.join(ctx.dir, 'README.md'), 'hi\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'mass change');

    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    const cats = new Set(r.drift_records.flatMap((d) => d.categories ?? []));
    for (const c of [
      'git_diff',
      'package_lock',
      'route',
      'api_schema',
      'migration',
      'component',
      'test',
    ]) {
      assert.ok(cats.has(c), `missing category: ${c} (got ${[...cats].join(',')})`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: drift status assigned per record (fresh/possibly_stale/stale_requires_review/unknown)', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'auth.ts'), '// v2\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change');
    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    const VALID = new Set(['fresh', 'possibly_stale', 'stale_requires_review', 'unknown']);
    for (const rec of r.drift_records) {
      assert.ok(VALID.has(rec.drift_status), `bad status: ${rec.drift_status}`);
      assert.ok(/^DRIFT-\d+$/.test(rec.id), `bad id: ${rec.id}`);
      assert.ok(typeof rec.detected_at === 'string');
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: drift.json validates against drift_record.schema.json', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'auth.ts'), '// v3\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change');

    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    await detectDrift({ cwd: ctx.dir, since: baseline });
    const out = JSON.parse(
      await readFile(path.join(ctx.dir, '_testatlas', 'brain', 'drift.json'), 'utf8'),
    );
    const { loadAllSchemas } = await import(
      path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')
    );
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const v = ajv.getSchema('https://testatlas.dev/schemas/v2/drift_record.schema.json');
    for (const rec of out.drift_records) {
      const ok = v(rec);
      if (!ok) {
        throw new Error(
          `drift record failed schema: ${JSON.stringify(rec)}\nerrors=${JSON.stringify(v.errors)}`,
        );
      }
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: human-readable drift report written under _testatlas/reports/drift.md', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'auth.ts'), '// v4\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change');

    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    await detectDrift({ cwd: ctx.dir, since: baseline });
    const reportPath = path.join(ctx.dir, '_testatlas', 'reports', 'drift.md');
    const text = await readFile(reportPath, 'utf8');
    assert.match(text, /Drift Report/i);
    assert.match(text, /TESTATLAS:GENERATED/);
  } finally {
    await ctx.cleanup();
  }
});

// Plan 18-03 / ISSUE-008 — graceful degradation on git failures.
// Spec: .testatlas/commands/brain/brain-drift.md:99
//   "Git not available AND `shell` declared → degrade to mtime-only and emit warning; do NOT halt."

async function setupNonGitWorkspace() {
  // Build the minimum brain dir detectDrift requires, but DO NOT init git.
  // gitChangedFiles() should fail (non-zero exit "not a git repository") and
  // detectDrift() must degrade — not throw.
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-drift-nogit-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: now, last_command: 'init' }),
  );
  await writeFile(
    path.join(brainDir, 'manifest.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      suite_version: '2.0.0',
      initialized_at: now,
      last_updated: now,
      project_name: 'fixture-nogit',
      adapters: [],
      schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
    }),
  );
  await writeFile(
    path.join(brainDir, 'domains.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: now, domains: [] }),
  );
  await writeFile(
    path.join(brainDir, 'flows.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: now, flows: [] }),
  );
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 7 (18-03): detectDrift in non-git tmpdir returns degradedMode=mtime-only (no throw)', async () => {
  const ctx = await setupNonGitWorkspace();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  try {
    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({ cwd: ctx.dir });
    assert.equal(r.degradedMode, 'mtime-only');
    assert.ok(
      warnings.some((w) => /\[detect-drift\] git probe failed/.test(w)),
      `expected a degraded-mode warning, got: ${JSON.stringify(warnings)}`,
    );
  } finally {
    console.warn = origWarn;
    await ctx.cleanup();
  }
});

test('Test 8 (18-03): detectDrift handles git EACCES gracefully via _inject', async () => {
  const ctx = await setupNonGitWorkspace();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  try {
    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({
      cwd: ctx.dir,
      _inject: {
        gitRunner: () => {
          const e = new Error('mock EACCES');
          e.code = 'EACCES';
          throw e;
        },
      },
    });
    assert.equal(r.degradedMode, 'mtime-only');
    assert.ok(
      warnings.some((w) => /\[detect-drift\] git probe failed/.test(w)),
      `expected a degraded-mode warning, got: ${JSON.stringify(warnings)}`,
    );
  } finally {
    console.warn = origWarn;
    await ctx.cleanup();
  }
});

test('Test 9 (18-03): detectDrift handles git EPIPE gracefully via _inject', async () => {
  const ctx = await setupNonGitWorkspace();
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({
      cwd: ctx.dir,
      _inject: {
        gitRunner: () => {
          const e = new Error('mock EPIPE');
          e.code = 'EPIPE';
          throw e;
        },
      },
    });
    assert.equal(r.degradedMode, 'mtime-only');
  } finally {
    console.warn = origWarn;
    await ctx.cleanup();
  }
});

test('Test 10 (18-03): happy-path detectDrift sets degradedMode=null when git works', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'auth.ts'), '// v5\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change');
    const { detectDrift } = await import(pathToFileURL(SCRIPT).href);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    assert.equal(r.degradedMode, null, 'git-available run must NOT be degraded');
  } finally {
    await ctx.cleanup();
  }
});
