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

// 15 agent-facing accelerator scripts (the canonical wiring set).
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
  'check-org-placeholder.js',
  'check-stale-docs.js',
];

// Per-command expected script references (the canonical wiring map).
const WIRING_MAP = {
  'init.md': ['init-workspace.js'],
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
  'map-domains.md': ['create-domain.js'],
  'report.md': ['generate-report.js'],
  'consolidate.md': ['summarize-run.js', 'update-indexes.js'],
  'cleanup.md': ['update-indexes.js', 'normalize-slugs.js', 'check-stale-docs.js'],
  'handoff.md': ['summarize-run.js', 'normalize-slugs.js'],
  'bootstrap.md': ['sync-status.js'], // the canonical reconciler note
};

async function readAllCommandFiles() {
  const entries = await readdir(COMMANDS_DIR, { withFileTypes: true });
  const out = new Map();
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const content = await readFile(path.join(COMMANDS_DIR, e.name), 'utf8');
    out.set(e.name, content);
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
