// test/adapter-parity-final.test.js
//
// Plan 14-08 Task 3 — Final adapter parity gate.
//
// At Phase 14 close, the V2 surface ships:
//
//   - 18 adapters
//   - 56+ V1+V2 commands (32 V1 flat + V2 categorized in core/, explore/,
//     test/, council/, brain/, report/, maintain/)
//
// This test is the canonical Phase 14 close-out gate. It asserts:
//
//   1. All 18 adapter directories exist (the 18-adapter contract is locked).
//   2. `assemble-adapter --check` exits 0 (zero drift across the full matrix).
//   3. Every per-command-file adapter has a `report/` subdir containing
//      atlas-report-dashboard-data.<ext> (the Wave 8 surface).
//   4. The 5 multi-source adapters (aider, mcp, roo-code, zed, amazon-q)
//      mention `report-dashboard-data` somewhere in their aggregate output.
//   5. MCP server manifest includes the `atlas-report-dashboard-data` prompt
//      (the dashboard surface is exposed to MCP clients).

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const ADAPTER_DIR = path.join(REPO_ROOT, '.testatlas', 'adapters');

const EXPECTED_ADAPTERS = [
  'aider',
  'amazon-q',
  'claude-code',
  'cline',
  'codex',
  'continue-dev',
  'cursor',
  'gemini-cli',
  'generic',
  'github-copilot',
  'kilocode',
  'kiro',
  'mcp',
  'opencode',
  'roo-code',
  'sourcegraph-amp',
  'windsurf',
  'zed',
];

const PER_COMMAND_FILE_ADAPTERS_DASHBOARD = {
  'claude-code': '.claude/commands/report/atlas-report-dashboard-data.md',
  opencode: '.opencode/commands/report/atlas-report-dashboard-data.md',
  kilocode: '.kilocode/workflows/report/atlas-report-dashboard-data.md',
  cursor: '.cursor/rules/report/atlas-report-dashboard-data.mdc',
  codex: '.codex/prompts/report/atlas-report-dashboard-data.md',
  'gemini-cli': '.gemini/commands/report/atlas-report-dashboard-data.toml',
  cline: '.clinerules/workflows/report/atlas-report-dashboard-data.md',
  windsurf: '.windsurf/workflows/report/atlas-report-dashboard-data.md',
  kiro: '.kiro/skills/report/atlas-report-dashboard-data.md',
  'continue-dev': '.continue/prompts/report/atlas-report-dashboard-data.prompt.md',
  'github-copilot': '.github/prompts/report/atlas-report-dashboard-data.prompt.md',
  'sourcegraph-amp': '.agents/commands/report/atlas-report-dashboard-data.md',
  generic: 'prompts/report/atlas-report-dashboard-data.md',
};

const MULTI_SOURCE_ADAPTERS = {
  aider: 'CONVENTIONS.md',
  mcp: 'mcp-server-manifest.json',
  'roo-code': '.roo/rules/atlas.md',
  zed: '.rules',
  'amazon-q': '.amazonq/rules/atlas.md',
};

test('Test 1: all 18 adapter directories exist', async () => {
  const entries = await readdir(ADAPTER_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const a of EXPECTED_ADAPTERS) {
    assert.ok(dirs.includes(a), `missing adapter: ${a}`);
  }
  assert.equal(
    dirs.length,
    EXPECTED_ADAPTERS.length,
    `unexpected adapter count: ${dirs.length} vs ${EXPECTED_ADAPTERS.length} (${dirs.join(',')})`,
  );
});

test('Test 2: assemble-adapter --check exits 0 (zero drift)', () => {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'assemble-adapter.js'), '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(r.status, 0, `assemble-adapter --check exited ${r.status}: ${r.stderr}`);
});

test('Test 3: every per-command-file adapter has atlas-report-dashboard-data', async () => {
  for (const [adapter, relPath] of Object.entries(PER_COMMAND_FILE_ADAPTERS_DASHBOARD)) {
    const full = path.join(ADAPTER_DIR, adapter, relPath);
    let s;
    try {
      s = await stat(full);
    } catch (e) {
      assert.fail(`missing dashboard surface for ${adapter}: ${full} (${e.code})`);
    }
    assert.ok(s.isFile(), `${full} is not a file`);
    const text = await readFile(full, 'utf8');
    assert.ok(text.length > 0, `${full} is empty`);
  }
});

test('Test 4: 5 multi-source adapters mention report-dashboard-data', async () => {
  for (const [adapter, relPath] of Object.entries(MULTI_SOURCE_ADAPTERS)) {
    const full = path.join(ADAPTER_DIR, adapter, relPath);
    const text = await readFile(full, 'utf8');
    assert.match(
      text,
      /report-dashboard-data/,
      `${adapter}: aggregate output ${relPath} does not mention report-dashboard-data`,
    );
  }
});

test('Test 5: MCP manifest includes atlas-report-dashboard-data prompt', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(ADAPTER_DIR, 'mcp', 'mcp-server-manifest.json'), 'utf8'),
  );
  assert.ok(Array.isArray(manifest.prompts), 'manifest.prompts is array');
  const names = manifest.prompts.map((p) => p.name);
  assert.ok(
    names.includes('atlas-report-dashboard-data'),
    `MCP manifest missing prompt 'atlas-report-dashboard-data'. Available: ${names
      .slice(0, 10)
      .join(', ')}, ...`,
  );
});

test('Test 6: V2 categorized command count is 24+ (test, council, brain, report, maintain, core, explore subdirs)', async () => {
  const cmdDir = path.join(REPO_ROOT, '.testatlas', 'commands');
  const cats = ['core', 'explore', 'test', 'council', 'brain', 'report', 'maintain'];
  let total = 0;
  for (const cat of cats) {
    try {
      const entries = await readdir(path.join(cmdDir, cat));
      total += entries.filter((n) => n.endsWith('.md')).length;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  assert.ok(total >= 24, `expected >=24 V2 categorized commands, got ${total}`);
});

test('Test 7: total command surface (flat V1 + V2 categorized) is at least 56', async () => {
  const cmdDir = path.join(REPO_ROOT, '.testatlas', 'commands');
  const flatEntries = await readdir(cmdDir);
  const flatCount = flatEntries.filter((n) => n.endsWith('.md') && n !== 'README.md').length;
  const cats = ['core', 'explore', 'test', 'council', 'brain', 'report', 'maintain'];
  let categorizedCount = 0;
  for (const cat of cats) {
    try {
      const entries = await readdir(path.join(cmdDir, cat));
      categorizedCount += entries.filter((n) => n.endsWith('.md')).length;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  const total = flatCount + categorizedCount;
  assert.ok(
    total >= 56,
    `expected >=56 commands (V1 flat + V2 categorized), got ${total} (flat=${flatCount}, categorized=${categorizedCount})`,
  );
});
