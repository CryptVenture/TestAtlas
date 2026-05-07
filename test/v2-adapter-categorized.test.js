// test/v2-adapter-categorized.test.js
//
// Phase 14 Wave 5 (Plan 14-05) Task 1: V2 categorized-command adapter
// generation tests.
//
// Asserts that:
//   1. `listCommandFiles({ includeCategorized: true })` returns flat + V2
//      categorized commands.
//   2. `listCategorizedCommandFiles()` returns only categorized commands with
//      `(category, basename)` shape.
//   3. `assembleAdapter` regenerates V2 commands into per-adapter category
//      subdirs (e.g. `.claude/commands/council/atlas-council-domain-review.md`).
//   4. Generator is idempotent across V2 categorized commands too.
//   5. `adapter-capabilities.json` declares the four V2 capabilities
//      (subagent-spawn, council-orchestration, brain-sync, persona-context).

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assembleAdapter } from '../scripts/assemble-adapter.js';
import {
  listCategorizedCommandFiles,
  listCommandFiles,
  V2_COMMAND_CATEGORIES,
} from '../scripts/lib/list-command-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('Test 1: listCommandFiles default returns flat-only (V1 contract)', async () => {
  const flat = await listCommandFiles({ cwd: repoRoot });
  assert.ok(flat.length >= 30, `expected ≥30 V1 flat commands; got ${flat.length}`);
  for (const p of flat) {
    const rel = path.relative(repoRoot, p);
    // Must be `.testatlas/commands/<file>.md` — no nested dirs.
    const segments = rel.split(path.sep);
    assert.equal(segments.length, 3, `flat command must be 3 segments deep: ${rel}`);
  }
});

test('Test 2: listCommandFiles({ includeCategorized: true }) returns flat + categorized', async () => {
  const all = await listCommandFiles({ cwd: repoRoot, includeCategorized: true });
  const flatOnly = await listCommandFiles({ cwd: repoRoot });
  assert.ok(
    all.length > flatOnly.length,
    `categorized list (${all.length}) must exceed flat-only (${flatOnly.length})`,
  );
  // Must contain at least one council command.
  assert.ok(
    all.some((p) => p.includes(`${path.sep}council${path.sep}council`)),
    'categorized list must include at least one council/* command',
  );
  // Must contain at least one core/ V2 command.
  assert.ok(
    all.some((p) => p.includes(`${path.sep}core${path.sep}status.md`)),
    'categorized list must include core/status.md',
  );
});

test('Test 3: listCategorizedCommandFiles returns categorized records sorted by (category, basename)', async () => {
  const cat = await listCategorizedCommandFiles({ cwd: repoRoot });
  assert.ok(cat.length >= 25, `expected ≥25 V2 categorized commands; got ${cat.length}`);
  for (const rec of cat) {
    assert.ok(V2_COMMAND_CATEGORIES.includes(rec.category), `unknown category: ${rec.category}`);
    assert.ok(rec.basename && !rec.basename.endsWith('.md'), 'basename must not include .md');
    assert.ok(rec.absPath.endsWith(`${rec.basename}.md`), 'absPath must end with basename.md');
  }
  // Sort invariant: (category, basename) ascending.
  for (let i = 1; i < cat.length; i++) {
    const prev = cat[i - 1];
    const cur = cat[i];
    const prevKey = `${prev.category}/${prev.basename}`;
    const curKey = `${cur.category}/${cur.basename}`;
    assert.ok(prevKey <= curKey, `sort violated at ${i}: ${prevKey} > ${curKey}`);
  }
});

test('Test 4: adapter-capabilities.json declares V2 capabilities on supported adapters', async () => {
  const capsPath = path.join(repoRoot, '.testatlas', 'adapters', 'adapter-capabilities.json');
  const caps = JSON.parse(await readFile(capsPath, 'utf8'));

  // V2 capability vocab additions:
  const V2_CAPS = ['subagent-spawn', 'council-orchestration', 'brain-sync', 'persona-context'];

  // Adapters that should have ALL V2 capabilities (capable subagent hosts):
  const FULL_V2 = ['claude-code', 'opencode', 'kilocode', 'codex', 'gemini-cli'];
  const byName = Object.fromEntries(caps.adapters.map((a) => [a.name, a]));
  for (const name of FULL_V2) {
    const adapter = byName[name];
    assert.ok(adapter, `adapter ${name} must be present`);
    for (const cap of V2_CAPS) {
      assert.ok(
        adapter.capabilities.includes(cap),
        `${name} must declare V2 capability "${cap}"; got: [${adapter.capabilities.join(', ')}]`,
      );
    }
  }

  // Every adapter should declare at least one V2 capability (brain-sync is
  // universally applicable — every adapter can read/write the brain via
  // file-write).
  for (const adapter of caps.adapters) {
    const hasV2 = V2_CAPS.some((c) => adapter.capabilities.includes(c));
    assert.ok(
      hasV2,
      `${adapter.name} must declare at least one V2 capability; got: [${adapter.capabilities.join(', ')}]`,
    );
  }
});

test('Test 5: claude-code adapter tree carries V2 categorized commands in nested dirs', async () => {
  // After regen the adapter tree has e.g.
  // `.testatlas/adapters/claude-code/.claude/commands/council/atlas-council.md`.
  const cmdDir = path.join(
    repoRoot,
    '.testatlas',
    'adapters',
    'claude-code',
    '.claude',
    'commands',
  );
  const councilDir = path.join(cmdDir, 'council');
  const entries = await readdir(councilDir).catch(() => []);
  assert.ok(
    entries.length >= 11,
    `expected ≥11 council commands at ${councilDir}; got ${entries.length}: [${entries.join(', ')}]`,
  );
  // Should include atlas-council.md (umbrella) and atlas-council-domain-review.md.
  assert.ok(
    entries.includes('atlas-council.md'),
    `umbrella atlas-council.md must exist; got: [${entries.join(', ')}]`,
  );
  assert.ok(
    entries.includes('atlas-council-domain-review.md'),
    `atlas-council-domain-review.md must exist; got: [${entries.join(', ')}]`,
  );
});

test('Test 6: claude-code carries V2 explore/* and core/* commands in nested dirs', async () => {
  const cmdDir = path.join(
    repoRoot,
    '.testatlas',
    'adapters',
    'claude-code',
    '.claude',
    'commands',
  );
  const exploreDir = path.join(cmdDir, 'explore');
  const coreDir = path.join(cmdDir, 'core');
  const exploreEntries = await readdir(exploreDir).catch(() => []);
  const coreEntries = await readdir(coreDir).catch(() => []);
  assert.ok(
    exploreEntries.length >= 11,
    `expected ≥11 V2 explore commands; got ${exploreEntries.length}`,
  );
  assert.ok(coreEntries.length >= 8, `expected ≥8 V2 core commands; got ${coreEntries.length}`);
  // Spot-check one well-known V2 explorer and one core:
  assert.ok(
    exploreEntries.some((n) => n === 'atlas-explore-state.md'),
    `atlas-explore-state.md missing; got: [${exploreEntries.join(', ')}]`,
  );
  assert.ok(
    coreEntries.some((n) => n === 'atlas-status.md'),
    `atlas-status.md missing; got: [${coreEntries.join(', ')}]`,
  );
});

test('Test 7: assembleAdapter --check is clean (idempotent V2 regen)', async () => {
  const result = await assembleAdapter({ workspace: repoRoot, check: true });
  assert.equal(
    result.exitCode,
    0,
    `--check must report zero drift on a freshly-generated tree; got drift on adapters: ${result.adapters
      .filter((a) => a.drift.length > 0)
      .map((a) => `${a.name}(${a.drift.length})`)
      .join(', ')}`,
  );
});

test('Test 8: every adapter outputDir contains the expected number of V2 files', async () => {
  // Per-command-file adapters: flat-count + categorized-count = total derived files.
  // Multi-source adapters (aider/mcp/roo-code/zed/amazon-q): single output file.
  const flat = await listCommandFiles({ cwd: repoRoot });
  const cat = await listCategorizedCommandFiles({ cwd: repoRoot });
  const expectedPerCmd = flat.length + cat.length;

  const capsPath = path.join(repoRoot, '.testatlas', 'adapters', 'adapter-capabilities.json');
  const caps = JSON.parse(await readFile(capsPath, 'utf8'));

  for (const adapter of caps.adapters) {
    if (adapter.renderStrategy !== 'per-command-file') continue;
    const baseDir = path.join(
      repoRoot,
      '.testatlas',
      'adapters',
      adapter.name,
      path.dirname(adapter.outputPattern),
    );
    const found = await countMdRecursive(baseDir);
    assert.equal(
      found,
      expectedPerCmd,
      `${adapter.name}: expected ${expectedPerCmd} derived files, got ${found} at ${baseDir}`,
    );
  }
});

async function countMdRecursive(dir) {
  let count = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      count += await countMdRecursive(path.join(dir, e.name));
    } else if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.mdc'))) {
      count += 1;
    }
  }
  return count;
}
