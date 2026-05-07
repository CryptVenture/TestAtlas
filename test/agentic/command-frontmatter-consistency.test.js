// test/agentic/command-frontmatter-consistency.test.js
//
// Quick 260505-quk Task 3 / ISSUE-009: regression guard against the four
// command-frontmatter contract gaps where `produces:` drifts from
// `lifecycle:` containing `10_command_log.md`.
//
// Contract: every command whose lifecycle list includes
// `10_command_log.md` (which is all of them today, since the schema locks
// the lifecycle vocabulary to 5 mandatory entries) emits a `command-result`
// row in 10_command_log.md per PRD §40 and the result-schema. So either:
//
//   (a) the command has a non-empty `produces:` list and `command-result`
//       MUST be one of its entries — declares the implicit emission
//       explicitly so adapter generators / contract checks see it; OR
//
//   (b) the command has `produces: []` and its `boundary:` field MUST
//       carry a documented note explaining the empty-produces (refresh-only,
//       report-only, etc.) — the schema (additionalProperties: false)
//       forbids a sibling `producesNote:` key, so the explanation lives in
//       the existing `boundary:` string.
//
// Asserts:
//   - init.md and log-issue.md (the two non-empty-produces commands flagged
//     by triage) declare `command-result` in produces.
//   - bootstrap.md and validate-workspace.md (the two empty-produces
//     commands flagged by triage) keep `produces: []` AND have a boundary
//     line containing a `produces: []` justification keyword.
//   - Every command with a non-empty `produces:` list AND lifecycle
//     including `10_command_log.md` declares `command-result` in produces.
//   - Every command with `produces: []` AND lifecycle including
//     `10_command_log.md` documents the empty-produces in boundary.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS_DIR = path.join(REPO_ROOT, '.testatlas', 'commands');

// Keywords we accept as documented-empty-produces justification in
// boundary:. Any of these substrings (case-insensitive) is sufficient.
const EMPTY_PRODUCES_JUSTIFICATION_KEYWORDS = [
  'produces: []',
  'no domain artifact',
  'refresh-only',
  'refresh of understanding',
  'refresh-of-understanding',
  'report-only',
  'no-write-of-domain-artifacts',
  'findings only',
  'surfaces findings only',
];

async function listCommandFiles() {
  const entries = await readdir(COMMANDS_DIR);
  return entries.filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
}

async function loadFrontmatter(name) {
  const text = await readFile(path.join(COMMANDS_DIR, name), 'utf8');
  return parseFrontmatter(text);
}

test('core/init.md declares command-result in produces (touches 10_command_log.md)', async () => {
  // Phase 17 Plan 17-04 deleted V1 commands/init.md (slash collision fix);
  // canonical /atlas:init source is now commands/core/init.md.
  const fm = await loadFrontmatter('core/init.md');
  assert.ok(Array.isArray(fm.produces), 'core/init.md frontmatter `produces` must be an array');
  assert.ok(
    fm.produces.includes('command-result'),
    `core/init.md produces should include 'command-result' since lifecycle touches 10_command_log.md. Got: ${JSON.stringify(fm.produces)}`,
  );
});

test('log-issue.md declares command-result in produces (touches 10_command_log.md)', async () => {
  const fm = await loadFrontmatter('log-issue.md');
  assert.ok(Array.isArray(fm.produces), 'log-issue.md frontmatter `produces` must be an array');
  assert.ok(
    fm.produces.includes('command-result'),
    `log-issue.md produces should include 'command-result'. Got: ${JSON.stringify(fm.produces)}`,
  );
});

test('bootstrap.md keeps produces: [] AND documents the empty-produces in boundary', async () => {
  const fm = await loadFrontmatter('bootstrap.md');
  assert.ok(Array.isArray(fm.produces), 'bootstrap.md `produces` must be an array');
  assert.equal(
    fm.produces.length,
    0,
    'bootstrap.md produces must remain empty (refresh-only command)',
  );
  const boundary = String(fm.boundary ?? '').toLowerCase();
  const hasJustification = EMPTY_PRODUCES_JUSTIFICATION_KEYWORDS.some((kw) =>
    boundary.includes(kw.toLowerCase()),
  );
  assert.ok(
    hasJustification,
    `bootstrap.md boundary should document why produces is empty (e.g. "produces: [] is intentional", "refresh-only", "no domain artifact"). Got boundary: ${fm.boundary}`,
  );
});

test('validate-workspace.md keeps produces: [] AND documents the empty-produces in boundary', async () => {
  const fm = await loadFrontmatter('validate-workspace.md');
  assert.ok(Array.isArray(fm.produces), 'validate-workspace.md `produces` must be an array');
  assert.equal(
    fm.produces.length,
    0,
    'validate-workspace.md produces must remain empty (report-only command)',
  );
  const boundary = String(fm.boundary ?? '').toLowerCase();
  const hasJustification = EMPTY_PRODUCES_JUSTIFICATION_KEYWORDS.some((kw) =>
    boundary.includes(kw.toLowerCase()),
  );
  assert.ok(
    hasJustification,
    `validate-workspace.md boundary should document why produces is empty (e.g. "produces: [] is intentional", "report-only", "findings only"). Got boundary: ${fm.boundary}`,
  );
});

test('every command with non-empty produces and 10_command_log.md lifecycle declares command-result', async () => {
  const files = await listCommandFiles();
  const violations = [];
  for (const name of files) {
    const fm = await loadFrontmatter(name);
    const lifecycle = Array.isArray(fm.lifecycle) ? fm.lifecycle : [];
    const produces = Array.isArray(fm.produces) ? fm.produces : [];
    if (!lifecycle.includes('10_command_log.md')) continue;
    if (produces.length === 0) continue;
    if (!produces.includes('command-result')) {
      violations.push({ name, produces });
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Commands with non-empty produces and 10_command_log.md lifecycle MUST declare 'command-result' in produces. Violations: ${JSON.stringify(violations, null, 2)}`,
  );
});

test('every command with produces: [] and 10_command_log.md lifecycle documents the empty-produces in boundary', async () => {
  const files = await listCommandFiles();
  const violations = [];
  for (const name of files) {
    const fm = await loadFrontmatter(name);
    const lifecycle = Array.isArray(fm.lifecycle) ? fm.lifecycle : [];
    const produces = Array.isArray(fm.produces) ? fm.produces : [];
    if (!lifecycle.includes('10_command_log.md')) continue;
    if (produces.length > 0) continue;
    const boundary = String(fm.boundary ?? '').toLowerCase();
    const hasJustification = EMPTY_PRODUCES_JUSTIFICATION_KEYWORDS.some((kw) =>
      boundary.includes(kw.toLowerCase()),
    );
    if (!hasJustification) {
      violations.push({ name, boundary: fm.boundary });
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Commands with produces: [] and 10_command_log.md lifecycle MUST document the empty-produces in boundary. Violations: ${JSON.stringify(violations, null, 2)}`,
  );
});
