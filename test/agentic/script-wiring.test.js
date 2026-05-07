// test/agentic/script-wiring.test.js
//
// Regression test: every agent-facing accelerator script under .testatlas/scripts/
// MUST be referenced from at least one command file at .testatlas/commands/*.md,
// AND every command in the canonical wiring map MUST reference its expected
// script(s) by exact filename. This test gates the wiring as an invariant —
// future edits that drop a script reference will fail loudly here.

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS_DIR = path.join(REPO_ROOT, '.testatlas', 'commands');

// 17 agent-facing accelerator scripts (the canonical wiring set).
// Quick 260505-wjp added sync-scorecard.js + sync-system-map.js (G1+G5 closures).
const AGENT_FACING_SCRIPTS = [
  'init-workspace.js',
  'update.js',
  'validate-workspace.js',
  'uninstall.js',
  'create-issue.js',
  'create-flow.js',
  'create-evidence-record.js',
  'create-domain.js',
  'generate-report.js',
  'summarize-run.js',
  'update-indexes.js',
  'normalize-slugs.js',
  'sync-status.js',
  'sync-scorecard.js',
  'sync-system-map.js',
  'check-org-placeholder.js',
  'check-stale-docs.js',
];

// Per-command expected script references (the canonical wiring map).
// Phase 17 Plan 17-04: V1 commands/init.md deleted; canonical /atlas:init
// source is now commands/core/init.md (V2). The wiring-map key uses the
// path-relative form `core/init.md` so readAllCommandFiles() finds it.
const WIRING_MAP = {
  'core/init.md': ['init-workspace.js'],
  'update.md': ['update.js'],
  'validate-workspace.md': [
    'validate-workspace.js',
    'check-org-placeholder.js',
    'check-stale-docs.js',
  ],
  'uninstall.md': ['uninstall.js'],
  'log-issue.md': ['create-issue.js'],
  'plan.md': ['create-flow.js'],
  'test-flow.md': ['create-evidence-record.js'],
  'map-domains.md': ['create-domain.js', 'sync-system-map.js'],
  'report.md': ['generate-report.js', 'sync-scorecard.js'],
  'consolidate.md': ['summarize-run.js', 'update-indexes.js'],
  'cleanup.md': ['update-indexes.js', 'normalize-slugs.js', 'check-stale-docs.js'],
  'handoff.md': ['summarize-run.js', 'normalize-slugs.js'],
  'bootstrap.md': ['sync-status.js'], // the canonical reconciler note
};

async function readAllCommandFiles() {
  const out = new Map();
  // Flat V1 command files (commands/*.md).
  const entries = await readdir(COMMANDS_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md')) {
      const content = await readFile(path.join(COMMANDS_DIR, e.name), 'utf8');
      out.set(e.name, content);
    } else if (e.isDirectory()) {
      // Phase 17 Plan 17-04: V2 categorized command files (commands/<cat>/*.md)
      // — needed so the wiring map can reference paths like `core/init.md`.
      const subEntries = await readdir(path.join(COMMANDS_DIR, e.name), {
        withFileTypes: true,
      });
      for (const se of subEntries) {
        if (!se.isFile() || !se.name.endsWith('.md')) continue;
        const content = await readFile(path.join(COMMANDS_DIR, e.name, se.name), 'utf8');
        out.set(`${e.name}/${se.name}`, content);
      }
    }
  }
  return out;
}

test('every agent-facing script is referenced from at least one command file', async () => {
  const commandFiles = await readAllCommandFiles();
  const allText = Array.from(commandFiles.values()).join('\n');
  const missing = AGENT_FACING_SCRIPTS.filter((s) => !allText.includes(s));
  assert.deepEqual(missing, [], `Scripts not referenced from any command: ${missing.join(', ')}`);
});

test('every command in the wiring map references its expected scripts', async () => {
  const commandFiles = await readAllCommandFiles();
  const failures = [];
  for (const [cmdFile, expectedScripts] of Object.entries(WIRING_MAP)) {
    const content = commandFiles.get(cmdFile);
    if (!content) {
      failures.push(`${cmdFile}: file does not exist`);
      continue;
    }
    for (const script of expectedScripts) {
      if (!content.includes(script)) {
        failures.push(`${cmdFile}: missing reference to ${script}`);
      }
    }
  }
  assert.deepEqual(failures, [], `Wiring gaps:\n${failures.join('\n')}`);
});

test('uninstall.md exists and has schema-valid frontmatter', async () => {
  const file = path.join(COMMANDS_DIR, 'uninstall.md');
  const st = await stat(file);
  assert.ok(st.isFile(), 'uninstall.md must exist');
  const content = await readFile(file, 'utf8');
  // The frontmatter starts with `---\n`
  assert.ok(content.startsWith('---\n'), 'uninstall.md must start with YAML frontmatter');
  // Required frontmatter keys per command-instruction.schema.json
  for (const key of [
    'command:',
    'version:',
    'description:',
    'capabilities:',
    'lifecycle:',
    'boundary:',
  ]) {
    assert.ok(
      content.includes(`\n${key}`) || content.startsWith(`---\n${key}`),
      `uninstall.md missing required frontmatter key: ${key}`,
    );
  }
});

test('bootstrap.md has the Acceleration Scripts H2 + sync-status reconciler note', async () => {
  const content = await readFile(path.join(COMMANDS_DIR, 'bootstrap.md'), 'utf8');
  assert.ok(
    content.includes('## Acceleration Scripts'),
    'bootstrap.md must declare an `## Acceleration Scripts` H2',
  );
  assert.ok(
    content.includes('sync-status.js'),
    'bootstrap.md must name `sync-status.js` as the canonical reconciler',
  );
});
