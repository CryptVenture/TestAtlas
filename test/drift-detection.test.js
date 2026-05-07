// test/drift-detection.test.js
//
// Plan 14-06 Task 2 — end-to-end drift detection contract.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'detect-drift.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function setupRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-drift-e2e-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  await mkdir(path.join(dir, 'src', 'routes'), { recursive: true });
  await writeFile(path.join(dir, 'src', 'routes', 'a.ts'), '// init\n');
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: now }),
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
    JSON.stringify({ schema_version: '2.0.0', last_updated: now, domains: [] }),
  );
  await writeFile(
    path.join(brainDir, 'flows.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: now, flows: [] }),
  );
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'initial');
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('E2E 1: detect-drift writes drift.json + drift.md atomically', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'a.ts'), '// changed\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change');

    const { detectDrift } = await import(SCRIPT);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    assert.equal(r.ok, true);
    const out = JSON.parse(
      await readFile(path.join(ctx.dir, '_testatlas', 'brain', 'drift.json'), 'utf8'),
    );
    assert.equal(out.schema_version, '2.0.0');
    assert.ok(Array.isArray(out.drift_records));
    assert.ok(out.drift_records.length >= 1);
    const reportText = await readFile(
      path.join(ctx.dir, '_testatlas', 'reports', 'drift.md'),
      'utf8',
    );
    assert.match(reportText, /TESTATLAS:GENERATED/);
  } finally {
    await ctx.cleanup();
  }
});

test('E2E 2: --category filter restricts records to selected category', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    await writeFile(path.join(ctx.dir, 'src', 'routes', 'a.ts'), '// changed\n');
    await mkdir(path.join(ctx.dir, 'test'), { recursive: true });
    await writeFile(path.join(ctx.dir, 'test', 't.test.js'), '// new\n');
    git(ctx.dir, 'add', '.');
    git(ctx.dir, 'commit', '-q', '-m', 'change');

    const { detectDrift } = await import(SCRIPT);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline, category: 'routes' });
    const cats = r.drift_records.flatMap((d) => d.categories ?? []);
    assert.ok(cats.includes('route'), 'routes filter should keep route records');
    assert.ok(!cats.includes('test'), 'routes filter should drop test records');
  } finally {
    await ctx.cleanup();
  }
});

test('E2E 3: empty repo (no changes) yields empty drift_records', async () => {
  const ctx = await setupRepo();
  try {
    const baseline = git(ctx.dir, 'rev-parse', 'HEAD').trim();
    const { detectDrift } = await import(SCRIPT);
    const r = await detectDrift({ cwd: ctx.dir, since: baseline });
    assert.equal(r.ok, true);
    assert.equal(r.drift_records.length, 0);
  } finally {
    await ctx.cleanup();
  }
});
