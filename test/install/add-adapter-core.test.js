// test/install/add-adapter-core.test.js
//
// Quick 260504-q4s Task 2. Coverage for `runAddAdapter()` — incrementally add
// adapters to an existing TestAtlas install without overwriting the suite tree.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runAddAdapter } from '../../scripts/lib/add-adapter-core.js';
import { runInit } from '../../scripts/lib/install-core.js';
import { loadAndValidateManifest } from '../../scripts/lib/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const QUIET = () => {};

async function withTmp(t, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-add-adapter-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

async function seed(target, adapters = ['claude-code']) {
  await runInit({ target, suiteRoot: REPO_ROOT, adapters, logger: QUIET });
}

test('add-adapter: adds a new adapter — manifest reflects both, command files appear', async (t) => {
  await withTmp(t, async (target) => {
    await seed(target, ['claude-code']);
    const result = await runAddAdapter({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      logger: QUIET,
    });
    assert.equal(result.status, 'added');
    assert.deepStrictEqual(result.added, ['cline']);
    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    assert.ok(manifest.adapters.includes('claude-code'));
    assert.ok(manifest.adapters.includes('cline'));
    // Cline command file landed at the project-local outputPattern dir.
    await stat(path.join(target, '.clinerules', 'workflows', 'atlas-init.md'));
    // New entries appear in manifest.files with type='command'.
    const cmdEntries = manifest.files.filter((f) => f.type === 'command');
    assert.ok(
      cmdEntries.some((f) => f.path.includes('.clinerules/workflows')),
      `expected cline command entry; got ${JSON.stringify(cmdEntries.map((f) => f.path))}`,
    );
  });
});

test('add-adapter: idempotent re-run is a no-op', async (t) => {
  await withTmp(t, async (target) => {
    await seed(target, ['claude-code']);
    await runAddAdapter({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      logger: QUIET,
    });
    const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
    const beforeMtime = (await stat(manifestPath)).mtimeMs;
    const beforeContent = await readFile(manifestPath, 'utf8');
    await new Promise((r) => setTimeout(r, 25));

    const result = await runAddAdapter({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      logger: QUIET,
    });
    assert.equal(result.status, 'no-op');
    assert.deepStrictEqual(result.added, []);
    const afterMtime = (await stat(manifestPath)).mtimeMs;
    const afterContent = await readFile(manifestPath, 'utf8');
    assert.equal(afterMtime, beforeMtime, 'manifest must not be rewritten on no-op');
    assert.equal(afterContent, beforeContent, 'manifest content unchanged');
  });
});

test('add-adapter: mixed (one new, one existing) — only the new one is added', async (t) => {
  await withTmp(t, async (target) => {
    await seed(target, ['claude-code']);
    const result = await runAddAdapter({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline', 'claude-code'],
      logger: QUIET,
    });
    assert.equal(result.status, 'added');
    assert.deepStrictEqual(result.added, ['cline']);
    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    assert.ok(manifest.adapters.includes('claude-code'));
    assert.ok(manifest.adapters.includes('cline'));
  });
});

test('add-adapter: missing manifest — throws with actionable error', async (t) => {
  await withTmp(t, async (target) => {
    await assert.rejects(
      () =>
        runAddAdapter({
          target,
          suiteRoot: REPO_ROOT,
          adapters: ['cline'],
          logger: QUIET,
        }),
      /requires an existing TestAtlas install.*testatlas init/i,
    );
  });
});

test('add-adapter: unknown adapter — throws canonical "Unknown adapter" with full list', async (t) => {
  await withTmp(t, async (target) => {
    await seed(target, ['claude-code']);
    await assert.rejects(
      () =>
        runAddAdapter({
          target,
          suiteRoot: REPO_ROOT,
          adapters: ['nope'],
          logger: QUIET,
        }),
      (err) => {
        assert.match(err.message, /Unknown adapter 'nope'/);
        assert.match(err.message, /claude-code/);
        assert.match(err.message, /amazon-q/);
        return true;
      },
    );
  });
});

test('add-adapter: --dry-run leaves manifest untouched and reports planned adds', async (t) => {
  await withTmp(t, async (target) => {
    await seed(target, ['claude-code']);
    const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
    const beforeContent = await readFile(manifestPath, 'utf8');

    const result = await runAddAdapter({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      dryRun: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'dry-run');
    assert.deepStrictEqual(result.added, ['cline']);
    const afterContent = await readFile(manifestPath, 'utf8');
    assert.equal(afterContent, beforeContent, 'manifest unchanged on dry-run');
    // Cline command file must NOT have been written.
    await assert.rejects(
      () => stat(path.join(target, '.clinerules', 'workflows', 'atlas-init.md')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('add-adapter: --global mode operates on the global manifest', async (t) => {
  await withTmp(t, async (fakeHome) => {
    // Seed a global install with claude-code.
    await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      global: true,
      logger: QUIET,
    });
    const result = await runAddAdapter({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      global: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'added');
    assert.equal(result.global, true);
    // Global cline command file lands at home-relative globalOutputPattern.
    await stat(path.join(fakeHome, '.config', 'cline', 'workflows', 'atlas-init.md'));
    const manifest = await loadAndValidateManifest(fakeHome, { cwd: REPO_ROOT });
    assert.equal(manifest.mode, 'global');
    assert.ok(manifest.adapters.includes('cline'));
  });
});

test('add-adapter: --global with no-globalOutputPattern adapter — skipped with warning', async (t) => {
  await withTmp(t, async (fakeHome) => {
    await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      global: true,
      logger: QUIET,
    });
    // windsurf has no globalOutputPattern; --global must skip it cleanly.
    const result = await runAddAdapter({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      adapters: ['windsurf'],
      global: true,
      logger: QUIET,
    });
    // No actual adapter installed because it was skipped → no-op-ish.
    // Manifest should NOT list windsurf since it wasn't actually installed.
    const manifest = await loadAndValidateManifest(fakeHome, { cwd: REPO_ROOT });
    assert.ok(!manifest.adapters.includes('windsurf'), 'windsurf must not be tracked when skipped');
    assert.ok(Array.isArray(result.skipped));
    assert.ok(result.skipped.includes('windsurf'));
  });
});
