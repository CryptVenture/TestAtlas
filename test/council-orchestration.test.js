// test/council-orchestration.test.js
//
// Phase 21 Wave 0 — TDD red-bar harness for council sub-agent orchestration.
//
// Every V2 council-* command MUST declare subagent-spawn capability, embed a
// "## Sub-Agent Orchestration" H2 with the 6-slot brief, name the canonical
// executionMode literals (parallel-subagents, sequential-fallback,
// inline-simulation), reference outputs/<persona-id>-output writes, and the
// session.json schema MUST support an executionMode field as a 6-value
// optional enum.
//
// Tests 1-7 are EXPECTED RED until Wave 1 (21-02) edits the 11 council source
// command bodies. Tests 8-9 are GREEN now (Task 1 of this same plan extended
// the schema additively; back-compat pin holds).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const COUNCIL_DIR = path.join(REPO_ROOT, '.testatlas', 'commands', 'council');

const SUB_COMMANDS = [
  'council-domain-review',
  'council-flow-review',
  'council-product-review',
  'council-bug-triage',
  'council-release-readiness',
  'council-red-team',
  'council-brain-audit',
  'council-retest',
  'council-design-critique',
  'council-test-plan',
]; // 10 sub-commands; council.md (dispatcher) tested separately.

const BRIEF_SLOTS = [
  'objective',
  'scope',
  'files-to-read',
  'output-format',
  'may-write',
  'exit-criteria',
];

// 6-value executionMode enum (Phase 21 RESEARCH §3 + open-question 3 decision)
const SCHEMA_ENUM = [
  'parallel-subagents',
  'single-spawn-inline',
  'sequential-fallback',
  'classify-only',
  'inline-simulation',
  'no-op',
];

// Each council Sub-Agent Orchestration block must reference all three primary
// modes that apply to councils (Test 5).
const EXECUTION_MODES = ['parallel-subagents', 'sequential-fallback', 'inline-simulation'];

function extractSection(text, h2Title) {
  const start = text.search(new RegExp(`^##\\s+${h2Title}(\\s|$)`, 'm'));
  if (start === -1) return null;
  const after = text.slice(start);
  const nextH2 = after.slice(1).search(/^##\s+/m);
  return nextH2 === -1 ? after : after.slice(0, nextH2 + 1);
}

test('Test 1: All 10 council sub-commands declare subagent-spawn in frontmatter capabilities', async () => {
  for (const id of SUB_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    assert.match(
      text,
      /capabilities:\s*\[[^\]]*subagent-spawn[^\]]*\]/,
      `${id}.md must declare subagent-spawn in frontmatter capabilities`,
    );
  }
});

test('Test 2: All 10 sub-commands declare council-orchestration + persona-context + brain-sync', async () => {
  for (const id of SUB_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    for (const cap of ['council-orchestration', 'persona-context', 'brain-sync']) {
      assert.match(
        text,
        new RegExp(`capabilities:[^\\]]*${cap}`),
        `${id}.md must declare ${cap} in frontmatter capabilities`,
      );
    }
  }
});

test('Test 3: All 10 sub-commands have a "## Sub-Agent Orchestration" H2 section', async () => {
  for (const id of SUB_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    assert.match(
      text,
      /^##\s+Sub-Agent Orchestration\b/m,
      `${id}.md must have a "## Sub-Agent Orchestration" H2`,
    );
  }
});

test('Test 4: Each Sub-Agent Orchestration block contains all 6 brief slots', async () => {
  for (const id of SUB_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    const block = extractSection(text, 'Sub-Agent Orchestration');
    assert.ok(block, `${id}.md: Sub-Agent Orchestration section not found`);
    const lower = block.toLowerCase();
    for (const slot of BRIEF_SLOTS) {
      assert.ok(
        lower.includes(slot),
        `${id}.md orchestration block must mention slot "${slot}"`,
      );
    }
  }
});

test('Test 5: Each block names parallel-subagents + sequential-fallback + inline-simulation + subagent-spawn', async () => {
  for (const id of SUB_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    const block = extractSection(text, 'Sub-Agent Orchestration');
    assert.ok(block, `${id}.md: Sub-Agent Orchestration section not found`);
    for (const mode of EXECUTION_MODES) {
      assert.ok(block.includes(mode), `${id}.md orchestration block must name "${mode}"`);
    }
    assert.ok(
      block.includes('subagent-spawn'),
      `${id}.md orchestration block must reference "subagent-spawn"`,
    );
  }
});

test('Test 6: Each block names rounds 2 + 3 as the per-persona spawn rounds AND references outputs/<persona-id>-output writes', async () => {
  for (const id of SUB_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    const block = extractSection(text, 'Sub-Agent Orchestration');
    assert.ok(block, `${id}.md: Sub-Agent Orchestration section not found`);
    assert.match(
      block,
      /persona|participant/i,
      `${id}.md orchestration block must mention per-persona spawning`,
    );
    // LOW-2 fix option (a): keep Test 6 simple (rounds 2+3 spawn-naming +
    // outputs reference). Per-round inline assertions for rounds 1, 4-9 are
    // covered indirectly by test/council-rounds.test.js.
    assert.match(
      block,
      /round[\s-]*2/i,
      `${id}.md orchestration block must name round 2 as a spawn round`,
    );
    assert.match(
      block,
      /round[\s-]*3/i,
      `${id}.md orchestration block must name round 3 as a spawn round`,
    );
    assert.match(
      block,
      /outputs\/[^\s]*persona/i,
      `${id}.md orchestration block must reference outputs/<persona-id>-output writes`,
    );
  }
});

test('Test 7: council.md (dispatcher) declares subagent-spawn but NOT council-orchestration / persona-context / brain-sync', async () => {
  const text = await readFile(path.join(COUNCIL_DIR, 'council.md'), 'utf8');
  // Positive half — dispatcher declares subagent-spawn (it routes to spawn-capable sub-commands).
  assert.match(
    text,
    /capabilities:[^\]]*subagent-spawn/,
    'council.md (dispatcher) MUST declare subagent-spawn in frontmatter capabilities',
  );
  // Negative half — dispatcher MUST NOT declare the 3 V2 sub-command-only capabilities.
  // Per Path B+ verdict (RESEARCH §5): the dispatcher routes, it doesn't run persona work.
  const fm = text.match(/^---\n([\s\S]*?)\n---/m)?.[1] ?? '';
  const caps = fm.match(/^capabilities:\s*\[([^\]]*)\]/m)?.[1] ?? '';
  for (const cap of ['council-orchestration', 'persona-context', 'brain-sync']) {
    assert.ok(
      !caps.includes(cap),
      `council.md (dispatcher) MUST NOT declare ${cap} — that capability is sub-command-only per Path B+ verdict (RESEARCH §5). Found in capabilities: [${caps}]`,
    );
  }
});

test('Test 8: council_session.schema.json defines executionMode as a 6-value optional enum', async () => {
  const schemaText = await readFile(
    path.join(REPO_ROOT, '.testatlas', 'schemas', 'council_session.schema.json'),
    'utf8',
  );
  const schema = JSON.parse(schemaText);
  assert.ok(schema.properties.executionMode, 'schema must define executionMode property');
  assert.deepEqual(
    schema.properties.executionMode.enum,
    SCHEMA_ENUM,
    'executionMode enum must contain the 6 modes in canonical order',
  );
  assert.ok(
    !Array.isArray(schema.required) || !schema.required.includes('executionMode'),
    'executionMode must be optional for backwards compat with pre-Phase-21 sessions',
  );
});

test('Test 9: Pre-Phase-21 session COUNCIL-2026-05-09-001 still validates after schema extension', async () => {
  const Ajv = (await import('ajv')).default;
  const addFormats = (await import('ajv-formats')).default;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(
    await readFile(
      path.join(REPO_ROOT, '.testatlas', 'schemas', 'council_session.schema.json'),
      'utf8',
    ),
  );
  delete schema.$schema;
  const validate = ajv.compile(schema);
  const sessPath = path.join(
    REPO_ROOT,
    '_testatlas',
    'agents',
    'councils',
    'sessions',
    'COUNCIL-2026-05-09-001',
    'session.json',
  );
  const exists = await readFile(sessPath, 'utf8').then(
    () => true,
    () => false,
  );
  if (!exists) return; // graceful skip if dogfood workspace pruned
  const sess = JSON.parse(await readFile(sessPath, 'utf8'));
  delete sess.$schema;
  assert.ok(
    validate(sess),
    `Pre-Phase-21 session must still validate against the extended schema; AJV errors: ${JSON.stringify(validate.errors)}`,
  );
});
