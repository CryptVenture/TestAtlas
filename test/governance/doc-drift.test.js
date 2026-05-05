// test/governance/doc-drift.test.js
//
// Quick 260505-quk Task 4 / ISSUE-008 residual: lock the four post-Phase-11
// doc-drift sub-findings out of the codebase.
//
// Asserts:
//   1. README.md does NOT contain the literal `30 \`/atlas:*\``  count claim;
//      DOES match the actual ls .testatlas/commands/atlas-*.md OR
//      .testatlas/commands/*.md (minus README.md) count via dynamic import
//      so the test stays correct if commands are added/removed.
//   2. .testatlas/commands/README.md does NOT contain `Phase 3 dogfood-loop`
//      AND does NOT contain `9 of 26`. The pre-GA framing has been replaced
//      with a post-GA full-surface description.
//   3. CLAUDE.md does NOT contain `15 JSON Schemas`; DOES contain
//      `20 JSON Schemas` (matching ls .testatlas/schemas/*.schema.json).
//   4. ADAPTER-OWNERS.md does NOT contain the unenforced
//      `Every adapter family MUST have **≥1 named owner** at all times.`
//      MUST-language line. Also reflects 18 (not 7) adapter families:
//      either by an explicit "18 adapter" mention in the prose, or by
//      reference to the canonical .testatlas/adapters/ directory.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');
const COMMANDS_README_PATH = path.join(REPO_ROOT, '.testatlas', 'commands', 'README.md');
const CLAUDE_PATH = path.join(REPO_ROOT, 'CLAUDE.md');
const ADAPTER_OWNERS_PATH = path.join(REPO_ROOT, 'ADAPTER-OWNERS.md');
const COMMANDS_DIR = path.join(REPO_ROOT, '.testatlas', 'commands');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.testatlas', 'schemas');

async function countCommands() {
  const entries = await readdir(COMMANDS_DIR);
  return entries.filter((name) => name.endsWith('.md') && name !== 'README.md').length;
}

async function countSchemas() {
  const entries = await readdir(SCHEMAS_DIR);
  return entries.filter((name) => name.endsWith('.schema.json')).length;
}

test('README.md does not contain stale `30 \\`/atlas:*\\`` count claim', async () => {
  const text = await readFile(README_PATH, 'utf8');
  assert.ok(
    !text.includes('30 `/atlas:*`'),
    'README.md still claims `30 /atlas:*` commands. Update to the live count (currently 32; verifiable via ls .testatlas/commands/*.md | grep -v README | wc -l).',
  );
});

test('README.md reports the live atlas command count (currently 32)', async () => {
  const [text, n] = await Promise.all([readFile(README_PATH, 'utf8'), countCommands()]);
  const expected = `${n} \`/atlas:*\``;
  assert.ok(
    text.includes(expected),
    `README.md should contain "${expected}" matching the live count of .testatlas/commands/*.md (excluding README.md). Got ${n} commands on disk.`,
  );
});

test('.testatlas/commands/README.md does not carry pre-GA `Phase 3 dogfood-loop` framing', async () => {
  const text = await readFile(COMMANDS_README_PATH, 'utf8');
  assert.ok(
    !text.includes('Phase 3 dogfood-loop'),
    '.testatlas/commands/README.md still carries the pre-GA `Phase 3 dogfood-loop` framing. Replace with a post-GA description of the full command surface.',
  );
});

test('.testatlas/commands/README.md does not carry pre-GA `9 of 26` framing', async () => {
  const text = await readFile(COMMANDS_README_PATH, 'utf8');
  assert.ok(
    !text.includes('9 of 26'),
    '.testatlas/commands/README.md still carries the pre-GA `9 of 26` framing. The full command surface ships post-GA; update the heading and surrounding prose accordingly.',
  );
});

test('CLAUDE.md does not contain stale `15 JSON Schemas` claim', async () => {
  const text = await readFile(CLAUDE_PATH, 'utf8');
  assert.ok(
    !text.includes('15 JSON Schemas'),
    'CLAUDE.md still claims `15 JSON Schemas`. Update to the live count (currently 20; verifiable via ls .testatlas/schemas/*.schema.json | wc -l).',
  );
});

test('CLAUDE.md reports the live JSON Schema count (currently 20)', async () => {
  const [text, n] = await Promise.all([readFile(CLAUDE_PATH, 'utf8'), countSchemas()]);
  const expected = `${n} JSON Schemas`;
  assert.ok(
    text.includes(expected),
    `CLAUDE.md should contain "${expected}" matching the live count of .testatlas/schemas/*.schema.json. Got ${n} schemas on disk.`,
  );
});

test('ADAPTER-OWNERS.md does not contain the unenforced MUST-have-named-owner line', async () => {
  const text = await readFile(ADAPTER_OWNERS_PATH, 'utf8');
  // The exact stale line was: `Every adapter family MUST have **≥1 named owner** at all times.`
  // We assert against the unique substring to be robust to surrounding edits.
  assert.ok(
    !text.includes('Every adapter family MUST have'),
    'ADAPTER-OWNERS.md still carries the unenforced MUST-language line. Soften to SHOULD/MAY (every named row in v1 is `TBD-volunteer-needed`, so MUST is contradicted on its face).',
  );
});

test('ADAPTER-OWNERS.md reflects 18 (not 7) adapter families', async () => {
  const text = await readFile(ADAPTER_OWNERS_PATH, 'utf8');
  // Accept either an explicit "18 adapter" prose mention OR a reference to
  // the canonical .testatlas/adapters/ directory (which lists all 18).
  const has18 = text.includes('18 adapter');
  const hasCanonicalRef = text.includes('.testatlas/adapters/');
  assert.ok(
    has18 || hasCanonicalRef,
    'ADAPTER-OWNERS.md should either explicitly mention `18 adapter` families or point at `.testatlas/adapters/` as the canonical roster. Today it lists only 7 rows; the true count is 18.',
  );
});

// Phase 12-03 (ISSUE-019 + ISSUE-020 + residual CONTRIBUTING.md drift)
// -------------------------------------------------------------------
// Three additional regressions guarding the post-Quick-260505-quk doc drift:
//   - README.md must not enumerate the legacy 7-adapter list nor "All 7" tags.
//   - docs/GETTING_STARTED.md must say "32 /atlas:*" (not "30" or "31").
//   - CONTRIBUTING.md must not claim "≥1 owner" nor enumerate the legacy 7.

const GETTING_STARTED_PATH = path.join(REPO_ROOT, 'docs', 'GETTING_STARTED.md');
const CONTRIBUTING_PATH = path.join(REPO_ROOT, 'CONTRIBUTING.md');

test('README.md does not name the legacy 7-adapter list', async () => {
  const src = await readFile(README_PATH, 'utf8');
  assert.ok(
    !src.includes('Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP, or Generic'),
    'README.md must not enumerate the legacy 7-adapter list (post-Phase-6 the canonical roster is 18 — see ADAPTER-OWNERS.md and .testatlas/adapters/).',
  );
  assert.ok(
    !/(\s|\()All 7(\s|\)|\.|,|$)/.test(src),
    'README.md must not say "All 7" — adapter set is 18 families.',
  );
  assert.ok(
    src.includes('18 adapter'),
    'README.md must reference 18 adapter families to anchor the canonical count.',
  );
});

test('docs/GETTING_STARTED.md command count says 32, not 30 or 31', async () => {
  const src = await readFile(GETTING_STARTED_PATH, 'utf8');
  assert.ok(!src.includes('30 /atlas:'), 'docs/GETTING_STARTED.md must not say "30 /atlas:"');
  assert.ok(!src.includes('30 `/atlas'), 'docs/GETTING_STARTED.md must not say "30 `/atlas"');
  assert.ok(!src.includes('31 /atlas:'), 'docs/GETTING_STARTED.md must not say "31 /atlas:"');
  assert.ok(!src.includes('31 `/atlas'), 'docs/GETTING_STARTED.md must not say "31 `/atlas"');
  const has32 = src.includes('32 /atlas:') || src.includes('32 `/atlas');
  assert.ok(
    has32,
    'docs/GETTING_STARTED.md must say "32 /atlas:" or "32 `/atlas" (post-Quick-260505-vj4 command count after adding test-all).',
  );
});

test('CONTRIBUTING.md adapter-ownership statement matches ADAPTER-OWNERS.md reality', async () => {
  const src = await readFile(CONTRIBUTING_PATH, 'utf8');
  assert.ok(
    !src.includes('≥1 owner'),
    'CONTRIBUTING.md must not claim "≥1 owner" — every row in ADAPTER-OWNERS.md v1 is `_unassigned_`.',
  );
  assert.ok(
    !src.includes('Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP'),
    'CONTRIBUTING.md must not enumerate the legacy 7-adapter list — point at ADAPTER-OWNERS.md instead.',
  );
});
