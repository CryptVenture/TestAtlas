// test/install/install-core-adapter-flag.test.js
//
// Quick 260504-q4s Task 1. Coverage for the new `adapters: [...]` option on
// runInit() — explicit subset selection that bypasses auto-detect.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';
import { loadAndValidateManifest } from '../../scripts/lib/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const QUIET = () => {};

async function withTmp(t, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-adapter-flag-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

test('install-core(--adapter): single adapter — runInit returns only that adapter (no auto-detect, no generic-fallthrough)', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      logger: QUIET,
    });
    assert.equal(result.status, 'installed');
    assert.deepStrictEqual(result.adapters, ['cline']);
  });
});

test('install-core(--adapter): multi adapter — installs only the named adapters', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline', 'windsurf'],
      logger: QUIET,
    });
    assert.equal(result.status, 'installed');
    assert.deepStrictEqual(result.adapters, ['cline', 'windsurf']);
    const manifest = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    assert.deepStrictEqual(manifest.adapters, ['cline', 'windsurf']);
  });
});

test('install-core(--adapter): unknown adapter — throws with canonical "Unknown adapter" + every valid name', async (t) => {
  await withTmp(t, async (target) => {
    await assert.rejects(
      () =>
        runInit({
          target,
          suiteRoot: REPO_ROOT,
          adapters: ['nope'],
          logger: QUIET,
        }),
      (err) => {
        assert.match(err.message, /Unknown adapter 'nope'/);
        // Must list every adapter from ALL_ADAPTERS so the user can pick one.
        const required = [
          'claude-code',
          'cursor',
          'aider',
          'kilocode',
          'opencode',
          'mcp',
          'generic',
          'codex',
          'gemini-cli',
          'cline',
          'windsurf',
          'kiro',
          'continue-dev',
          'github-copilot',
          'sourcegraph-amp',
          'roo-code',
          'zed',
          'amazon-q',
        ];
        for (const name of required) {
          assert.ok(
            err.message.includes(name),
            `expected error to list ${name}; got: ${err.message}`,
          );
        }
        return true;
      },
    );
  });
});

test('install-core(--adapter): adapters option takes precedence over allAdapters', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      allAdapters: true,
      logger: QUIET,
    });
    // Only the named adapter installs; allAdapters is ignored.
    assert.deepStrictEqual(result.adapters, ['cline']);
  });
});

test('install-core(--adapter): combined with --global / dry-run reflects adapter list and global mode', async (t) => {
  await withTmp(t, async (fakeHome) => {
    const result = await runInit({
      target: fakeHome,
      suiteRoot: REPO_ROOT,
      adapters: ['cline'],
      global: true,
      dryRun: true,
      logger: QUIET,
    });
    assert.equal(result.status, 'dry-run');
    assert.equal(result.global, true);
    assert.deepStrictEqual(result.adapters, ['cline']);
  });
});

test('install-core(--adapter): empty array falls through to detect / allAdapters', async (t) => {
  await withTmp(t, async (target) => {
    // Empty adapters array is treated as "not specified" → falls through to
    // auto-detect path (which yields just 'generic' on an empty target).
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: [],
      logger: QUIET,
    });
    assert.deepStrictEqual(result.adapters, ['generic']);
  });
});

test('install-core(--adapter): empty array + allAdapters → allAdapters wins (still falls through)', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: [],
      allAdapters: true,
      logger: QUIET,
    });
    assert.equal(result.adapters.length, 18);
  });
});

test('install-core(--adapter): duplicate names are deduped while preserving user order', async (t) => {
  await withTmp(t, async (target) => {
    const result = await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['cline', 'cline', 'windsurf'],
      logger: QUIET,
    });
    assert.deepStrictEqual(result.adapters, ['cline', 'windsurf']);
  });
});
