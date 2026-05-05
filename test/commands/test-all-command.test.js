// test/commands/test-all-command.test.js
//
// Quick 260505-vj4 Task 2 (TDD RED → GREEN):
// asserts the new umbrella command file at
// .testatlas/commands/test-all.md exists, parses cleanly, and conforms
// to the canonical command-shape established by explore.md /
// test-flow.md / test-domain.md / test-regression.md.

import { strict as assert } from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'test-all.md');

const CANONICAL_LIFECYCLE = [
  '03_execution_status.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '11_workspace_manifest.json',
  'history/run_log.md',
];

test('test-all.md exists at .testatlas/commands/test-all.md', async () => {
  const s = await stat(FILE);
  assert.ok(s.isFile(), 'expected .testatlas/commands/test-all.md to be a regular file');
});

test('test-all.md frontmatter parses and matches the canonical umbrella shape', async () => {
  const text = await readFile(FILE, 'utf8');
  const data = parseFrontmatter(text);
  assert.equal(data.command, 'test-all', 'frontmatter `command` must equal "test-all"');
  assert.equal(data.version, '1.0.0', 'frontmatter `version` must equal "1.0.0"');
  assert.ok(Array.isArray(data.capabilities), 'frontmatter `capabilities` must be an array');
  assert.ok(data.capabilities.includes('shell'), 'frontmatter `capabilities` must include "shell"');
  assert.ok(
    data.capabilities.includes('file-write'),
    'frontmatter `capabilities` must include "file-write"',
  );
  assert.ok(Array.isArray(data.produces), 'frontmatter `produces` must be an array');
  for (const expected of ['test-run', 'evidence', 'command-result']) {
    assert.ok(
      data.produces.includes(expected),
      `frontmatter \`produces\` must include "${expected}"`,
    );
  }
  assert.ok(Array.isArray(data.consumes), 'frontmatter `consumes` must be an array');
  assert.ok(
    data.consumes.includes('test-scenario'),
    'frontmatter `consumes` must include "test-scenario"',
  );
  assert.deepEqual(
    data.lifecycle,
    CANONICAL_LIFECYCLE,
    'frontmatter `lifecycle` must equal the 5-element canonical PRD §40 vocabulary',
  );
  assert.ok(
    typeof data.boundary === 'string' && data.boundary.length > 0,
    'frontmatter `boundary` must be a non-empty string',
  );
});

test('test-all.md body has all 9 canonical H2 sections', async () => {
  const text = await readFile(FILE, 'utf8');
  const required = [
    /^##\s+Purpose\s*$/m,
    /^##\s+Required First Reads\s*$/m,
    /^##\s+Required Actions\s*$/m,
    /^##\s+Sub-Agent Orchestration\s*$/m,
    /^##\s+Outputs\s*$/m,
    /^##\s+Lifecycle\s*$/m,
    /^##\s+Stop Conditions\s*$/m,
    /^##\s+Completion Criteria\s*$/m,
    /^##\s+What['’]s Next\s*$/m,
  ];
  for (const re of required) {
    assert.match(text, re, `test-all.md missing required H2 (regex: ${re})`);
  }
});

test('test-all.md Required Actions name BOTH /atlas:test-flow --all and /atlas:test-domain --all as children', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(
    text,
    /\/atlas:test-flow.{0,30}--all|test-flow --all/i,
    'test-all.md must reference `/atlas:test-flow --all` as a child invocation',
  );
  assert.match(
    text,
    /\/atlas:test-domain.{0,30}--all|test-domain --all/i,
    'test-all.md must reference `/atlas:test-domain --all` as a child invocation',
  );
});

test('test-all.md Sub-Agent Orchestration block includes ≥3 of the 5 executionMode values', async () => {
  const text = await readFile(FILE, 'utf8');
  const enums = [
    'parallel-subagents',
    'single-spawn-inline',
    'sequential-fallback',
    'classify-only',
    'no-op',
  ];
  const present = enums.filter((e) => text.includes(e));
  assert.ok(
    present.length >= 3,
    `test-all.md must reference ≥3 executionMode enum values; found ${present.length} (${present.join(', ')})`,
  );
});

test('test-all.md "## What\'s Next" section has 1-4 entries pointing at /atlas: commands', async () => {
  const text = await readFile(FILE, 'utf8');
  const sectionMatch = text.match(/^##\s+What['’]s Next\s*$/m);
  assert.ok(sectionMatch, "expected `## What's Next` section");
  const sectionStart = text.indexOf(sectionMatch[0]);
  const after = text.slice(sectionStart + sectionMatch[0].length);
  const nextH2 = after.search(/^##\s+/m);
  const section = nextH2 === -1 ? after : after.slice(0, nextH2);
  const entries = section.match(/^[-*]\s+\*\*`?\/atlas:[a-z][a-z0-9-]+`?\*\*\s+[—-]\s+.+$/gm) || [];
  assert.ok(
    entries.length >= 1 && entries.length <= 4,
    `What's Next section must have 1-4 /atlas: entries; got ${entries.length}`,
  );
});

test('test-all.md boundary clause references the destructive/production safety invariants', async () => {
  const text = await readFile(FILE, 'utf8');
  const data = parseFrontmatter(text);
  assert.match(
    data.boundary,
    /allowDestructiveActions|destructive scenarios/i,
    'test-all.md boundary must reference allowDestructiveActions / destructive-scenarios refusal',
  );
  assert.match(
    data.boundary,
    /allowProductionTesting|production/i,
    'test-all.md boundary must reference allowProductionTesting / production refusal',
  );
});

test('test-all.md is at least 110 lines long (parity with test-flow / test-domain / test-regression)', async () => {
  const text = await readFile(FILE, 'utf8');
  const lineCount = text.split('\n').length;
  assert.ok(
    lineCount >= 110,
    `test-all.md must be ≥110 lines for parity with sibling test-* commands; got ${lineCount}`,
  );
});
