// test/commands/walkthrough-state-coverage.test.js
//
// Phase 13 / Plan 13-02 — Wave-0 RED-bar contract scaffolding.
//
// Asserts the 5-state coverage matrix (PRD §13.1: empty / loading / error /
// success / permission) is embedded in `explore-ui.md` and the `state`
// branch of `test-domain.md`, alongside the Chrome DevTools MCP triggering
// techniques (`emulate` / `Slow 3G` / `handle_dialog`).
//
// Wave-0 contract: this test is intentionally RED until Plans 13-04 and
// 13-07 rewrite explore-ui.md and test-domain.md respectively.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const STATES = ['empty', 'loading', 'error', 'success', 'permission'];

test('explore-ui.md embeds the 5-state matrix and trigger techniques', async () => {
  const text = await readFile('.testatlas/commands/explore-ui.md', 'utf8');
  for (const s of STATES) {
    assert.match(text, new RegExp(`\\b${s}\\b`), `explore-ui.md missing state: ${s}`);
  }
  assert.match(text, /emulate/, 'explore-ui.md missing emulate trigger reference');
  assert.match(text, /Slow 3G/, 'explore-ui.md missing Slow 3G throttle reference');
  assert.match(text, /handle_dialog/, 'explore-ui.md missing handle_dialog reference');
});

test('test-domain.md state branch embeds the 5-state matrix', async () => {
  const text = await readFile('.testatlas/commands/test-domain.md', 'utf8');
  for (const s of STATES) {
    assert.match(text, new RegExp(`\\b${s}\\b`), `test-domain.md missing state: ${s}`);
  }
  assert.match(
    text,
    /state-coverage matrix|State-coverage matrix|State Coverage Matrix/,
    'test-domain.md missing matrix reference',
  );
});
