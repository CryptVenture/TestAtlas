// test/commands/walkthrough-mandatory.test.js
//
// Phase 13 / Plan 13-02 — Wave-0 RED-bar contract scaffolding.
//
// Asserts the "mandatory-when-available" walkthrough contract for the 7
// UI-touching commands (PRD §13.1, §13.9, §13.10; §26 test-type catalog).
//
// Wave-0 contract: this test is intentionally RED until plans 13-04..13-07
// rewrite the affected command bodies to embed the contract phrasing and
// reference the new `.testatlas/reference/chrome-devtools-mcp.md` shard.
//
// Negative side (existing capability-fallback.test.js): forbids hallucination
// when capability is missing.
// Positive side (this test): forbids cutting corners when capability is
// present.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const UI_TOUCHING = new Set([
  'explore-ui.md',
  'explore-accessibility.md',
  'explore-performance.md',
  'test-flow.md',
  'test-domain.md',
  'test-accessibility.md',
  'test-performance.md',
]);

const REQUIRED_PHRASES = [
  /MUST drive the full walkthrough/,
  /chrome-devtools-mcp\.md/,
  /Skipping a walkthrough step[\s\S]{0,200}contract violation/,
];

test('UI-touching commands embed the mandatory-when-available contract', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const f of files) {
    const base = path.basename(f);
    if (!UI_TOUCHING.has(base)) continue;
    const text = await readFile(f, 'utf8');
    for (const re of REQUIRED_PHRASES) {
      if (!re.test(text)) failures.push(`${base}: missing ${re}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Wave-0 expected RED — these failures are intentional until Plans 13-04..13-07 land:\n${failures.join('\n')}`,
  );
});

test('Non-UI-touching commands MUST NOT carry the mandatory-when-available paragraph', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const violations = [];
  for (const f of files) {
    const base = path.basename(f);
    if (UI_TOUCHING.has(base)) continue;
    const text = await readFile(f, 'utf8');
    if (/MUST drive the full walkthrough/.test(text)) {
      violations.push(`${base}: walkthrough phrase leaked into non-UI command`);
    }
  }
  assert.deepEqual(violations, []);
});
