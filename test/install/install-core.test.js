// test/install/install-core.test.js
//
// Plan 07-01 Task 2 — Install kernel tests.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INSTALL_MANIFEST_PATH } from '../../scripts/lib/constants.js';
import { runInit } from '../../scripts/lib/install-core.js';
import { loadAndValidateManifest } from '../../scripts/lib/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-core-'));
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return await run(dir);
}

const QUIET = () => {};

test('install-core: empty target → installs suite + writes manifest + creates _testatlas/', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      logger: QUIET,
    });
    assert.equal(result.status, 'installed');
    assert.ok(result.filesWritten > 0, 'should write at least one file');
    assert.ok(result.adapters.includes('generic'), 'generic always included');

    // Manifest exists and validates.
    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.equal(manifest.suiteVersion, pkg.version);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.target, target);
    assert.deepStrictEqual(manifest.adapters, ['generic']);
    assert.ok(manifest.files.length >= 50, 'expect substantial suite tree copied');

    // Suite tree present at target/.testatlas/.
    await stat(path.join(target, '.testatlas', 'bootstrap.md'));
    // Workspace tree initialized at target/_testatlas/.
    await stat(path.join(target, '_testatlas', '11_workspace_manifest.json'));
  });
});

test('install-core: manifest entries classify suite vs adapter vs command', async (t) => {
  await withTmp(t, async (target) => {
    // Create .claude/ so claude-code is detected, which gates the
    // adapters/claude-code/ tree as type='adapter' rather than skipped.
    await mkdir(path.join(target, '.claude'), { recursive: true });
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    const types = new Set(manifest.files.map((f) => f.type));
    assert.ok(types.has('suite'), 'expect suite-typed entries');
    assert.ok(types.has('adapter'), 'expect adapter-typed entries (claude-code matched)');
    // 'command' entries depend on whether Phase 6 shipped a stage/ dir for any
    // adapter. The kernel is non-fatal when stage/ is absent. Assert that the
    // type discriminator at least allows commands (no negative assertion).
  });
});

test('install-core: re-run without --force on clean install is idempotent (already-installed, no writes)', async (t) => {
  await withTmp(t, async (target) => {
    const first = await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    assert.equal(first.status, 'installed');
    const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
    const beforeMtime = (await stat(manifestPath)).mtimeMs;

    // Tiny pause to let mtime resolution differ if any rewrite occurred.
    await new Promise((r) => setTimeout(r, 25));

    const second = await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    assert.equal(second.status, 'already-installed');
    assert.equal(second.filesWritten, 0);

    const afterMtime = (await stat(manifestPath)).mtimeMs;
    assert.equal(afterMtime, beforeMtime, 'manifest must not be rewritten on idempotent re-run');
  });
});

test('install-core: --force removes .testatlas/ and reinstalls', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
    const beforeMtime = (await stat(manifestPath)).mtimeMs;
    await new Promise((r) => setTimeout(r, 25));

    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      force: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'forced');
    const afterMtime = (await stat(manifestPath)).mtimeMs;
    assert.ok(afterMtime > beforeMtime, 'manifest mtime must advance on force reinstall');
  });
});

test('install-core: --force preserves _testatlas/ workspace', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    // Plant a sentinel file in _testatlas/ that --force must not touch.
    const sentinel = path.join(target, '_testatlas', 'user-sentinel.txt');
    await writeFile(sentinel, 'preserve-me\n');

    await runInit({
      target,
      suiteRoot: REPO_ROOT,
      force: true,
      logger: QUIET,
    });
    const text = await readFile(sentinel, 'utf8');
    assert.equal(text, 'preserve-me\n');
  });
});

test('install-core: allAdapters → manifest lists all 7 regardless of detection', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      allAdapters: true,
      logger: QUIET,
    });
    assert.equal(result.adapters.length, 7);
    for (const name of [
      'claude-code',
      'cursor',
      'aider',
      'kilocode',
      'opencode',
      'mcp',
      'generic',
    ]) {
      assert.ok(result.adapters.includes(name), `expect ${name}`);
    }
  });
});

test('install-core: detection-only (no allAdapters) with .claude/ → [claude-code, generic]', async (t) => {
  await withTmp(t, async (target) => {
    await mkdir(path.join(target, '.claude'), { recursive: true });
    const result = await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    assert.deepStrictEqual(result.adapters, ['claude-code', 'generic']);
  });
});

test('install-core: refuses target === suiteRoot', async () => {
  await assert.rejects(
    () => runInit({ target: REPO_ROOT, suiteRoot: REPO_ROOT, logger: QUIET }),
    /equals suite root/,
  );
});

test('install-core: --dry-run writes nothing', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      dryRun: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'dry-run');
    assert.equal(result.filesWritten, 0);
    // Confirm no .testatlas/ was created at target.
    await assert.rejects(
      () => stat(path.join(target, '.testatlas')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('install-core: pre-flight refuses symlinks in source tree', async (t) => {
  await withTmp(t, async (suiteCopy) => {
    // Build a minimal fake suiteRoot: copy package.json + minimal .testatlas/
    // structure, then drop a symlink inside .testatlas/.
    await mkdir(path.join(suiteCopy, '.testatlas'), { recursive: true });
    await writeFile(
      path.join(suiteCopy, 'package.json'),
      JSON.stringify({ name: 'fake', version: '0.0.1' }),
    );
    await writeFile(path.join(suiteCopy, '.testatlas', 'bootstrap.md'), '# fake\n');
    // Create a symlink target file outside .testatlas/, then symlink into it.
    await writeFile(path.join(suiteCopy, 'real.txt'), 'real\n');
    await symlink(
      path.join(suiteCopy, 'real.txt'),
      path.join(suiteCopy, '.testatlas', 'a-symlink'),
    );

    await withTmp(t, async (target) => {
      await assert.rejects(
        () => runInit({ target, suiteRoot: suiteCopy, logger: QUIET }),
        (err) => err.code === 'TESTATLAS_INSTALL_SYMLINK',
      );
    });
  });
});

test('install-core: skips .testatlas/test-workspace/ from suite tree copy', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    // The suite ships .testatlas/test-workspace/ as a self-test fixture; it
    // must NOT land in installed targets.
    await assert.rejects(
      () => stat(path.join(target, '.testatlas', 'test-workspace')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('install-core: skips unmatched adapter trees from suite tree copy', async (t) => {
  await withTmp(t, async (target) => {
    // No agent-platform signals → only `generic` matches; aider/cursor/etc.
    // adapter trees should NOT land in <target>/.testatlas/adapters/.
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    // Generic should be present.
    await stat(path.join(target, '.testatlas', 'adapters', 'generic'));
    // Aider should NOT be present.
    await assert.rejects(
      () => stat(path.join(target, '.testatlas', 'adapters', 'aider')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('install-core: refuses overwrite when .testatlas/ exists without manifest and !force', async (t) => {
  await withTmp(t, async (target) => {
    // Plant a stub .testatlas/ with no manifest.
    await mkdir(path.join(target, '.testatlas'), { recursive: true });
    await writeFile(path.join(target, '.testatlas', 'random.txt'), 'mine\n');
    await assert.rejects(
      () => runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET }),
      /no manifest/,
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// --global mode (machine-wide install of adapter command files into $HOME)
// ──────────────────────────────────────────────────────────────────────────

test('install-core: --global writes adapter command files into user-home paths', async (t) => {
  await withTmp(t, async (fakeHome) => {
    const result = await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      allAdapters: true,
      global: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'installed');
    assert.equal(result.global, true);
    // Suite tree still lands at $HOME/.testatlas/ so bootstrap.md is resolvable.
    await stat(path.join(fakeHome, '.testatlas', 'bootstrap.md'));
    // Per-adapter command files at home-relative globalOutputPattern dirs:
    await stat(path.join(fakeHome, '.claude', 'commands', 'atlas-init.md'));
    await stat(path.join(fakeHome, '.cursor', 'rules', 'atlas-init.mdc'));
    await stat(path.join(fakeHome, '.config', 'opencode', 'command', 'atlas-init.md'));
    await stat(path.join(fakeHome, '.config', 'aider', 'CONVENTIONS.md'));
    // _testatlas/ workspace must NOT exist — workspace state is project-local.
    await assert.rejects(
      () => stat(path.join(fakeHome, '_testatlas')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('install-core: --global manifest carries mode:"global"', async (t) => {
  await withTmp(t, async (fakeHome) => {
    await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      allAdapters: true,
      global: true,
      logger: QUIET,
    });
    const manifest = await loadAndValidateManifest(fakeHome, { cwd: REPO_ROOT });
    assert.equal(manifest.mode, 'global');
  });
});

test('install-core: project-local install omits mode field', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({
      target,
      suiteRoot: REPO_ROOT,
      allAdapters: true,
      logger: QUIET,
    });
    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    assert.equal(manifest.mode, undefined);
  });
});

test('install-core: --global --dry-run does not write to home', async (t) => {
  await withTmp(t, async (fakeHome) => {
    const result = await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      allAdapters: true,
      global: true,
      dryRun: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'dry-run');
    assert.equal(result.global, true);
    await assert.rejects(
      () => stat(path.join(fakeHome, '.testatlas')),
      (err) => err.code === 'ENOENT',
    );
    await assert.rejects(
      () => stat(path.join(fakeHome, '.claude')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('install-core: --global surfaces post-install notes for tools needing manual config', async (t) => {
  await withTmp(t, async (fakeHome) => {
    const result = await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      allAdapters: true,
      global: true,
      logger: QUIET,
    });
    assert.ok(Array.isArray(result.globalNotes));
    // Aider + MCP + generic each declare globalNotes in
    // .testatlas/adapters/adapter-capabilities.json.
    assert.ok(
      result.globalNotes.some((n) => n.startsWith('[aider]')),
      `expected aider note; got ${JSON.stringify(result.globalNotes)}`,
    );
  });
});
