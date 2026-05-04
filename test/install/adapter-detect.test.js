// test/install/adapter-detect.test.js
//
// Plan 07-01 Task 1 — Adapter detection probe tests.
//
// Verifies:
//  - claude-code is detected via `.claude/` AND via `CLAUDE.md`.
//  - cursor is detected via `.cursor/rules/` AND via `.cursorrules`.
//  - aider is detected via `.aider.conf.yml` AND via `CONVENTIONS.md`.
//  - kilocode is detected via `.kilo/` AND via `.kilocode/`.
//  - opencode is detected via `.opencode/`.
//  - mcp is detected via `mcp-server-manifest.json` AND via `.mcp/`.
//  - `generic` is ALWAYS appended (paste-able fallback).
//  - Empty target → `['generic']` only.
//  - Multi-match returns matched adapters in deterministic SIGNALS-order.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { detectAdapters, SIGNALS } from '../../scripts/lib/adapter-detect.js';

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-detect-'));
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

test('adapter-detect: empty target returns [generic] only', async (t) => {
  await withTmp(t, async (dir) => {
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['generic']);
  });
});

test('adapter-detect: .claude/ → [claude-code, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.claude'), { recursive: true });
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['claude-code', 'generic']);
  });
});

test('adapter-detect: CLAUDE.md alone → [claude-code, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# Claude config\n');
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['claude-code', 'generic']);
  });
});

test('adapter-detect: .cursor/rules/ → [cursor, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['cursor', 'generic']);
  });
});

test('adapter-detect: .cursorrules alone → [cursor, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await writeFile(path.join(dir, '.cursorrules'), 'rule\n');
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['cursor', 'generic']);
  });
});

test('adapter-detect: .aider.conf.yml → [aider, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await writeFile(path.join(dir, '.aider.conf.yml'), 'foo: bar\n');
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['aider', 'generic']);
  });
});

test('adapter-detect: .kilo/ alone → [kilocode, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.kilo'), { recursive: true });
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['kilocode', 'generic']);
  });
});

test('adapter-detect: .kilocode/ alone → [kilocode, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.kilocode'), { recursive: true });
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['kilocode', 'generic']);
  });
});

test('adapter-detect: .opencode/ → [opencode, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.opencode'), { recursive: true });
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['opencode', 'generic']);
  });
});

test('adapter-detect: mcp-server-manifest.json → [mcp, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await writeFile(path.join(dir, 'mcp-server-manifest.json'), '{}\n');
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['mcp', 'generic']);
  });
});

test('adapter-detect: cursor + kilocode → [cursor, kilocode, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
    await mkdir(path.join(dir, '.kilocode'), { recursive: true });
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, ['cursor', 'kilocode', 'generic']);
  });
});

test('adapter-detect: all-six-detected → [claude-code, cursor, aider, kilocode, opencode, mcp, generic]', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.claude'), { recursive: true });
    await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
    await writeFile(path.join(dir, '.aider.conf.yml'), 'x: y\n');
    await mkdir(path.join(dir, '.kilo'), { recursive: true });
    await mkdir(path.join(dir, '.opencode'), { recursive: true });
    await writeFile(path.join(dir, 'mcp-server-manifest.json'), '{}\n');
    const adapters = await detectAdapters(dir);
    assert.deepStrictEqual(adapters, [
      'claude-code',
      'cursor',
      'aider',
      'kilocode',
      'opencode',
      'mcp',
      'generic',
    ]);
  });
});

test('adapter-detect: SIGNALS table matches the locked decision (Plan 07-01)', () => {
  const byAdapter = Object.fromEntries(SIGNALS.map((s) => [s.adapter, s.paths]));
  assert.deepStrictEqual(byAdapter['claude-code'], ['.claude/', 'CLAUDE.md']);
  assert.deepStrictEqual(byAdapter.cursor, ['.cursor/rules/', '.cursorrules']);
  assert.deepStrictEqual(byAdapter.aider, ['.aider.conf.yml', 'CONVENTIONS.md']);
  assert.deepStrictEqual(byAdapter.kilocode, ['.kilo/', '.kilocode/']);
  assert.deepStrictEqual(byAdapter.opencode, ['.opencode/']);
  assert.deepStrictEqual(byAdapter.mcp, ['mcp-server-manifest.json', '.mcp/']);
});
