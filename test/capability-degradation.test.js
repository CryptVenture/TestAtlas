// test/capability-degradation.test.js
//
// Plan 06-01 Task 2: shared adapter library (BOOTSTRAP_PREAMBLE, envelope
// wrap/parse, capability→tools mapping) and the canonical
// capability-degradation prose template.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderDegradationBlock } from '../scripts/lib/adapters/_capability-degradation.js';
import {
  BOOTSTRAP_PREAMBLE,
  capsToTools,
  parseAdapterMarker,
  serializeFrontmatter,
  wrapInAdapterEnvelope,
} from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';

// Quick 260507-hzw: PRD §23 was updated to carry the {{ADAPTER_COMMAND_PATH}}
// placeholder so adapter renderers can substitute the actual installed path
// per-file; this closes the empirical KiloCode bug where the agent literally
// interpreted "Then read this command file" and probed the wrong filesystem
// path. The verbatim below MUST stay byte-stable with prd/prd.md §23 fence.
const PRD_VERBATIM =
  'First read `.testatlas/bootstrap.md`. Then read `{{ADAPTER_COMMAND_PATH}}` (already loaded into your context if invoked via slash). Follow both exactly. ' +
  'If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.';

test('Test 1: BOOTSTRAP_PREAMBLE matches PRD §23 verbatim, byte-for-byte', () => {
  assert.equal(BOOTSTRAP_PREAMBLE, PRD_VERBATIM);
});

test('Test 2: wrapInAdapterEnvelope emits canonical START/END with hash(sourceText)', () => {
  const out = wrapInAdapterEnvelope({
    sourcePath: '/abs/repo/.testatlas/commands/init.md',
    sourceText: 'X',
    body: 'BODY',
  });
  const expectedHash = hashContent('X');
  assert.match(
    out,
    new RegExp(
      `<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/init\\.md" hash="${expectedHash}" -->`,
    ),
  );
  assert.ok(out.includes('BODY'), 'envelope must contain body');
  assert.match(
    out,
    /<!-- TESTATLAS:GENERATED:END section="adapter-body" -->/,
    'envelope must contain END marker',
  );
  // Phase 11: hash widened from 16 to 64 hex chars (full SHA-256). Closes
  // ISSUE-013; first 16 chars unchanged so legacy manifests stay verifiable
  // via verifyHashCompat.
  assert.match(expectedHash, /^[0-9a-f]{64}$/);
});

test('Test 3: parseAdapterMarker round-trips the envelope', () => {
  const sourceText = 'sample source text';
  const sourcePath = '/x/y/.testatlas/commands/explore-ui.md';
  const body = 'BODY-A\nBODY-B';
  const enveloped = wrapInAdapterEnvelope({ sourcePath, sourceText, body });
  const parsed = parseAdapterMarker(enveloped);
  assert.ok(parsed, 'parseAdapterMarker must return non-null on enveloped text');
  assert.equal(parsed.section, 'adapter-body');
  assert.equal(parsed.source, 'commands/explore-ui.md');
  assert.equal(parsed.hash, hashContent(sourceText));

  // Negative: no marker → null
  assert.equal(parseAdapterMarker('plain text without marker'), null);
});

test('Test 4: capsToTools deterministic + dedup mcp__*', () => {
  const a = capsToTools(['shell', 'file-write']);
  assert.deepEqual(a, ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']);

  const b = capsToTools(['browser', 'MCP', 'file-write']);
  // Both browser and MCP map to mcp__* — must appear ONCE.
  const mcpHits = b.filter((t) => t === 'mcp__*');
  assert.equal(mcpHits.length, 1, `mcp__* must appear once, got ${mcpHits.length}`);
  assert.ok(b.includes('mcp__*'));
  // Always-granted set still present.
  for (const baseline of ['Read', 'Write', 'Edit', 'Glob', 'Grep']) {
    assert.ok(b.includes(baseline), `missing baseline tool: ${baseline}`);
  }

  // web-fetch maps to WebFetch
  const c = capsToTools(['web-fetch']);
  assert.ok(c.includes('WebFetch'));
});

test('Test 5: renderDegradationBlock emits canonical prose when capability gap exists', () => {
  const block = renderDegradationBlock({
    commandCaps: ['browser', 'MCP', 'file-write'],
    adapterCaps: ['shell', 'file-write'],
  });
  // (a) Heading
  assert.match(block, /Capability Degradation/i);
  // (b) Names of missing caps
  assert.ok(block.includes('browser'), 'missing capability "browser" must be named');
  assert.ok(block.includes('MCP'), 'missing capability "MCP" must be named');
  // (c) Forbid fabrication
  assert.match(block, /Do NOT fabricate/);
  // (d) needs-validation marker
  assert.match(block, /needs-validation/);
  // (e) Reference to bootstrap
  assert.match(block, /\.testatlas\/bootstrap\.md/);
});

test('Test 6: renderDegradationBlock returns empty string when no gap', () => {
  const out = renderDegradationBlock({
    commandCaps: ['shell', 'file-write'],
    adapterCaps: ['shell', 'file-write', 'browser'],
  });
  assert.equal(out, '');
});

test('Test 7 (extra): serializeFrontmatter emits deterministic ---/key: value/--- block', () => {
  const out = serializeFrontmatter({
    description: 'a thing',
    'allowed-tools': 'Read, Write',
  });
  assert.match(out, /^---\n/);
  assert.match(out, /\n---\n$/);
  assert.match(out, /\ndescription: a thing\n/);
  assert.match(out, /\nallowed-tools: Read, Write\n/);
  // Deterministic insertion order
  const descIdx = out.indexOf('description:');
  const toolsIdx = out.indexOf('allowed-tools:');
  assert.ok(descIdx >= 0 && toolsIdx > descIdx, 'description must precede allowed-tools');
});
