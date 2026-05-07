// Wave 0 — Bucket #1 (capability vocab) + Bucket #3 (9-adapter subagent-spawn declaration).
//
// These tests are the TDD red-bar contract for Plan 09-02. They assert on the
// EXPECTED post-09-02 shape of:
//   - .testatlas/schemas/vocabulary.schema.json — must declare $defs.capability.enum
//     as the 6-entry canonical capability set INCLUDING the new "subagent-spawn".
//   - .testatlas/adapters/adapter-capabilities.json — exactly 9 named adapters
//     must include "subagent-spawn" in their capabilities array; the other 9
//     must NOT include it.
//
// Source of truth: 09-CONTEXT.md § "Sub-agent orchestration design (locked)"
// and 09-RESEARCH.md § "Per-Host Sub-Agent Capability Matrix".

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const VOCAB_PATH = path.join(REPO_ROOT, '.testatlas', 'schemas', 'vocabulary.schema.json');
const ADAPTERS_PATH = path.join(REPO_ROOT, '.testatlas', 'adapters', 'adapter-capabilities.json');

// Phase 14 Wave 5 (V2): canonical capability set extends from 6 to 9.
// V1 entries (browser, shell, web-fetch, MCP, file-write, subagent-spawn) are
// retained; V2 adds council-orchestration, brain-sync, persona-context. Order
// matters — V2 entries are appended after the V1 set.
const EXPECTED_CAPABILITIES = [
  'browser',
  'shell',
  'web-fetch',
  'MCP',
  'file-write',
  'subagent-spawn',
  'council-orchestration',
  'brain-sync',
  'persona-context',
];

// The 9 adapters that MUST declare subagent-spawn (09-RESEARCH.md table).
const CAPABLE_9 = new Set([
  'claude-code',
  'opencode',
  'kilocode',
  'codex',
  'gemini-cli',
  'github-copilot',
  'cline',
  'kiro',
  'sourcegraph-amp',
]);

// The 9 adapters that MUST NOT declare subagent-spawn (negative assertion).
const NOT_CAPABLE_9 = [
  'aider',
  'amazon-q',
  'continue-dev',
  'cursor',
  'generic',
  'mcp',
  'roo-code',
  'windsurf',
  'zed',
];

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

test('vocabulary.schema.json declares the 9-entry capability enum (V1 6 + V2 council-orchestration/brain-sync/persona-context)', async () => {
  const vocab = await readJson(VOCAB_PATH);
  assert.ok(
    vocab.$defs && typeof vocab.$defs === 'object',
    'vocabulary.schema.json must define $defs',
  );
  assert.ok(
    vocab.$defs.capability && typeof vocab.$defs.capability === 'object',
    'vocabulary.schema.json must define $defs.capability (added in Plan 09-02)',
  );
  assert.ok(Array.isArray(vocab.$defs.capability.enum), '$defs.capability.enum must be an array');
  assert.deepEqual(
    vocab.$defs.capability.enum,
    EXPECTED_CAPABILITIES,
    `Capability enum must equal ${JSON.stringify(EXPECTED_CAPABILITIES)} ` +
      '(09-CONTEXT.md locks "subagent-spawn" as the 6th capability).',
  );
});

test('exactly 9 adapters declare subagent-spawn capability', async () => {
  const data = await readJson(ADAPTERS_PATH);
  assert.ok(
    Array.isArray(data.adapters),
    'adapter-capabilities.json must have an "adapters" array',
  );
  const declaring = new Set(
    data.adapters
      .filter((a) => Array.isArray(a.capabilities) && a.capabilities.includes('subagent-spawn'))
      .map((a) => a.name),
  );
  assert.deepEqual(
    [...declaring].sort(),
    [...CAPABLE_9].sort(),
    'The set of adapters declaring "subagent-spawn" must equal exactly the ' +
      `9 capable hosts: ${[...CAPABLE_9].sort().join(', ')}`,
  );
});

test('the 9 not-capable adapters do NOT declare subagent-spawn (negative assertion)', async () => {
  const data = await readJson(ADAPTERS_PATH);
  const byName = new Map(data.adapters.map((a) => [a.name, a]));
  for (const name of NOT_CAPABLE_9) {
    const entry = byName.get(name);
    assert.ok(entry, `adapter-capabilities.json is missing entry for "${name}"`);
    assert.ok(
      Array.isArray(entry.capabilities),
      `adapter "${name}" must have a capabilities array`,
    );
    assert.ok(
      !entry.capabilities.includes('subagent-spawn'),
      `adapter "${name}" must NOT declare "subagent-spawn" — got ` +
        `${JSON.stringify(entry.capabilities)}`,
    );
  }
});
