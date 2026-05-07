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

test('Test 5: claude-code adapter tree exposes V2 council commands at FLAT root (no nested dir)', async () => {
  // Phase 16 Plan 16-01 inversion: per `prd/reports/v2-adapter-slash-command-
  // discovery.md` Option A, every per-command-file adapter renders flat. The
  // council/ subdirectory must NOT exist; council commands live at the flat
  // root with names from `commandBaseNameFromSource`.
  const cmdDir = path.join(
    repoRoot,
    '.testatlas',
    'adapters',
    'claude-code',
    '.claude',
    'commands',
  );
  const councilDir = path.join(cmdDir, 'council');
  const councilEntriesOrNull = await readdir(councilDir).catch((err) =>
    err.code === 'ENOENT' ? null : Promise.reject(err),
  );
  assert.equal(
    councilEntriesOrNull,
    null,
    `council/ subdir must NOT exist after flatten (ENOENT expected); got: ${
      Array.isArray(councilEntriesOrNull) ? `[${councilEntriesOrNull.join(', ')}]` : 'unexpected'
    }`,
  );

  // Flat root must contain ≥11 atlas-council-* files plus atlas-council.md.
  const rootEntries = await readdir(cmdDir, { withFileTypes: true });
  const flatNames = rootEntries.filter((e) => e.isFile()).map((e) => e.name);
  assert.ok(
    flatNames.includes('atlas-council.md'),
    `umbrella atlas-council.md must exist at flat root; got first 30: [${flatNames.slice(0, 30).join(', ')}]`,
  );
  assert.ok(
    flatNames.includes('atlas-council-domain-review.md'),
    `atlas-council-domain-review.md must exist at flat root`,
  );
  const councilFlat = flatNames.filter((n) => n.startsWith('atlas-council') && n.endsWith('.md'));
  assert.ok(
    councilFlat.length >= 11,
    `expected ≥11 atlas-council* files at flat root; got ${councilFlat.length}: [${councilFlat.join(', ')}]`,
  );
});

test('Test 6: claude-code exposes V2 explore/* and core/* commands at FLAT root (no nested dirs)', async () => {
  // Phase 16 Plan 16-01 inversion: explore/ and core/ subdirs must NOT exist.
  // V2 commands appear at flat root with `commandBaseNameFromSource` naming:
  //   commands/explore/state.md  →  atlas-explore-state.md
  //   commands/core/status.md    →  atlas-core-status.md
  //   commands/core/init.md      →  atlas-core-init.md (canonical /atlas:init
  //                                  source after Phase 17 Plan 17-04 deleted
  //                                  V1 commands/init.md to resolve the slash
  //                                  collision; atlas-init.md no longer exists
  //                                  at flat root)
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

  const exploreEntriesOrNull = await readdir(exploreDir).catch((err) =>
    err.code === 'ENOENT' ? null : Promise.reject(err),
  );
  const coreEntriesOrNull = await readdir(coreDir).catch((err) =>
    err.code === 'ENOENT' ? null : Promise.reject(err),
  );
  assert.equal(
    exploreEntriesOrNull,
    null,
    `explore/ subdir must NOT exist after flatten (ENOENT expected)`,
  );
  assert.equal(
    coreEntriesOrNull,
    null,
    `core/ subdir must NOT exist after flatten (ENOENT expected)`,
  );

  const rootEntries = await readdir(cmdDir, { withFileTypes: true });
  const flatNames = rootEntries.filter((e) => e.isFile()).map((e) => e.name);

  assert.ok(
    flatNames.includes('atlas-explore-state.md'),
    `atlas-explore-state.md must exist at flat root`,
  );
  assert.ok(
    flatNames.includes('atlas-core-status.md'),
    `atlas-core-status.md must exist at flat root (V2 core/status.md disambiguated by commandBaseNameFromSource)`,
  );
  // Phase 17 Plan 17-04: V1 commands/init.md was deleted to resolve the
  // /atlas:init slash collision; atlas-init.md must NOT exist at flat root.
  // The canonical source is now commands/core/init.md → atlas-core-init.md.
  assert.ok(
    !flatNames.includes('atlas-init.md'),
    `V1 atlas-init.md must NOT exist at flat root after Plan 17-04 deletion (canonical is atlas-core-init.md)`,
  );
  assert.ok(
    flatNames.includes('atlas-core-init.md'),
    `atlas-core-init.md must exist at flat root (V2 core/init.md is the canonical /atlas:init source post-Plan-17-04)`,
  );

  const exploreFlat = flatNames.filter((n) => n.startsWith('atlas-explore-') && n.endsWith('.md'));
  const coreFlat = flatNames.filter((n) => n.startsWith('atlas-core-') && n.endsWith('.md'));
  assert.ok(
    exploreFlat.length >= 11,
    `expected ≥11 atlas-explore-* at flat root; got ${exploreFlat.length}: [${exploreFlat.join(', ')}]`,
  );
  assert.ok(
    coreFlat.length >= 8,
    `expected ≥8 atlas-core-* at flat root; got ${coreFlat.length}: [${coreFlat.join(', ')}]`,
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

test('Test 8: every per-command-file adapter has flat-count + cat-count files at FLAT root (no recursion)', async () => {
  // Phase 16 Plan 16-01 inversion: per-command-file adapters render every
  // source command (V1 flat + V2 categorized) at the adapter's commands root.
  // The expected count remains flat.length + cat.length, but the COUNT MUST
  // come from a top-level-only readdir (recursion would silently re-admit the
  // nested-subdir bug we are fixing).
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
    // Top-level only — no recursion. Any subdirectory under baseDir would
    // surface as a non-file entry and FAIL the count match (acting as a
    // belt-and-braces flatness invariant alongside Tests 5/6 + the new
    // adapter-flat-discovery.test.js gate).
    const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
    const found = entries.filter((e) => e.isFile()).length;
    const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    assert.deepEqual(
      subdirs,
      [],
      `${adapter.name}: expected zero subdirs at ${baseDir}; got [${subdirs.join(', ')}]`,
    );
    assert.equal(
      found,
      expectedPerCmd,
      `${adapter.name}: expected ${expectedPerCmd} flat-root files, got ${found} at ${baseDir}`,
    );
  }
});
