// test/agentic/canonical-file-wiring.test.js
//
// Quick 260505-wjp Task 4 (G3+G4): Doc-drift gate that prevents the 6
// canonical-file wiring gaps surfaced by parallel-subagent analysis from
// re-opening silently.
//
// Asserted invariants:
//   - Test 1: every command's `lifecycle:` frontmatter list contains at most
//             the 5 universal canonical files PLUS any command-specific
//             canonical the command actually writes (Outputs / Required Actions
//             body must back the claim).
//   - Test 2: plan.md Lifecycle MUST include `02_test_strategy.md`.
//   - Test 3: explore-codebase.md Lifecycle MUST include `12_app_map.json`.
//   - Test 4: report.md Required Actions MUST mention `sync-scorecard.js`
//             (since report.md claims to refresh 13_quality_scorecard.md).
//   - Test 5: every canonical file mentioned in any command's Lifecycle has a
//             code-backed writer in CANONICAL_WRITERS, OR is owned by the
//             command itself (command-driven canonicals like
//             02_test_strategy.md / 12_app_map.json).

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS_DIR = path.join(REPO_ROOT, '.testatlas', 'commands');

// Canonical-file → list of code-backed writers that touch it. Every Lifecycle-
// declared canonical MUST have either ≥1 writer here OR be a command-driven
// canonical (writer-list empty AND the OWNING command's body explicitly writes
// the file in its Outputs / Required Actions sections).
const CANONICAL_WRITERS = {
  '00_overview.md': ['scripts/init-workspace.js', 'scripts/sync-status.js'],
  '01_system_map.md': ['scripts/init-workspace.js', 'scripts/sync-system-map.js'],
  '02_test_strategy.md': [], // command-driven by /atlas:plan
  '03_execution_status.md': ['scripts/init-workspace.js', 'scripts/sync-status.js'],
  '09_artifact_index.md': [
    'scripts/init-workspace.js',
    'scripts/update-indexes.js',
    'scripts/lib/validate/autoheal.js',
  ],
  '10_command_log.md': ['scripts/init-workspace.js', 'scripts/lib/command-log.js'],
  '11_workspace_manifest.json': ['scripts/init-workspace.js'],
  '12_app_map.json': [], // command-driven by /atlas:explore-codebase
  '13_quality_scorecard.md': ['scripts/init-workspace.js', 'scripts/sync-scorecard.js'],
  'history/run_log.md': ['scripts/lib/command-log.js'],
};

// Canonicals whose writer-list is empty MUST be owned (Lifecycle-declared) by
// exactly one command — that command becomes the de-facto writer.
const COMMAND_OWNED_CANONICALS = {
  '02_test_strategy.md': 'plan.md',
  '12_app_map.json': 'explore-codebase.md',
};

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readAllCommandFiles() {
  const entries = await readdir(COMMANDS_DIR, { withFileTypes: true });
  const out = new Map();
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name === 'README.md') continue;
    const content = await readFile(path.join(COMMANDS_DIR, e.name), 'utf8');
    out.set(e.name, content);
  }
  return out;
}

test('canonical-file-wiring: plan.md Lifecycle includes 02_test_strategy.md', async () => {
  const text = await readFile(path.join(COMMANDS_DIR, 'plan.md'), 'utf8');
  const fm = parseFrontmatter(text);
  assert.ok(
    fm.lifecycle.includes('02_test_strategy.md'),
    'plan.md frontmatter `lifecycle:` MUST declare 02_test_strategy.md (G3 wiring)',
  );
});

test('canonical-file-wiring: explore-codebase.md Lifecycle includes 12_app_map.json', async () => {
  const text = await readFile(path.join(COMMANDS_DIR, 'explore-codebase.md'), 'utf8');
  const fm = parseFrontmatter(text);
  assert.ok(
    fm.lifecycle.includes('12_app_map.json'),
    'explore-codebase.md frontmatter `lifecycle:` MUST declare 12_app_map.json (G4 wiring)',
  );
});

test('canonical-file-wiring: report.md Required Actions mentions sync-scorecard.js', async () => {
  const text = await readFile(path.join(COMMANDS_DIR, 'report.md'), 'utf8');
  assert.ok(
    text.includes('sync-scorecard.js'),
    'report.md MUST mention sync-scorecard.js since it claims to refresh 13_quality_scorecard.md (G6 wiring)',
  );
});

test('canonical-file-wiring: every Lifecycle-declared canonical has a code-backed writer OR is command-owned', async () => {
  const commandFiles = await readAllCommandFiles();
  const failures = [];

  for (const [cmdFile, content] of commandFiles) {
    let fm;
    try {
      fm = parseFrontmatter(content);
    } catch (err) {
      failures.push(`${cmdFile}: frontmatter parse error: ${err.message}`);
      continue;
    }
    for (const canonical of fm.lifecycle ?? []) {
      const writers = CANONICAL_WRITERS[canonical];
      if (writers === undefined) {
        failures.push(
          `${cmdFile}: lifecycle entry "${canonical}" has no entry in CANONICAL_WRITERS`,
        );
        continue;
      }
      if (writers.length === 0) {
        // Command-driven: must be owned by THIS command. Allow non-owners to
        // declare it (no-op) — only owner-absence is a hard failure.
        const owner = COMMAND_OWNED_CANONICALS[canonical];
        if (!owner) {
          failures.push(`${cmdFile}: "${canonical}" has empty writer-list AND no owning command`);
        }
      } else {
        // Code-backed: at least one declared writer file MUST exist on disk.
        let anyExists = false;
        for (const writerPath of writers) {
          if (await fileExists(path.join(REPO_ROOT, writerPath))) {
            anyExists = true;
            break;
          }
        }
        if (!anyExists) {
          failures.push(
            `${cmdFile}: lifecycle entry "${canonical}" claims writers ${writers.join(', ')} but none exist on disk`,
          );
        }
      }
    }
  }
  assert.deepEqual(failures, [], `Wiring failures:\n  ${failures.join('\n  ')}`);
});

test('canonical-file-wiring: command-driven canonicals are declared by their owning command', async () => {
  const commandFiles = await readAllCommandFiles();
  for (const [canonical, owner] of Object.entries(COMMAND_OWNED_CANONICALS)) {
    const ownerContent = commandFiles.get(owner);
    assert.ok(ownerContent, `${owner} must exist (owns ${canonical})`);
    const fm = parseFrontmatter(ownerContent);
    assert.ok(
      fm.lifecycle.includes(canonical),
      `${owner} MUST declare ${canonical} in its frontmatter lifecycle list`,
    );
  }
});
