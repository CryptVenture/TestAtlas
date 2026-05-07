// test/commands/explore-state.test.js
//
// Plan 14-03 Task 1 — explore-state.md is one of 10 new V2 explorers under
// `.testatlas/commands/explore/`. It must:
//   1. Document the PRD §13.1 5-state matrix (empty/loading/error/success/permission)
//   2. Document state-transition + default-state + error-recovery testing
//   3. Carry the mandatory-when-available walkthrough contract (UI-touching)
//   4. Cite Tier-1 Chrome DevTools MCP tools verbatim
//   5. Carry bootstrap-first preamble + capability declaration + evidence requirements
//   6. Stay ≤1800 words
//   7. Update _testatlas/maps/states.{md,json}

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { countWords } from '../../scripts/lib/word-count.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'explore', 'explore-state.md');

async function read() {
  return readFile(FILE, 'utf8');
}

test('Test 1: explore-state.md documents the 5-state matrix verbatim', async () => {
  const text = await read();
  for (const s of ['empty', 'loading', 'error', 'success', 'permission']) {
    assert.match(text, new RegExp(`\\b${s}\\b`), `missing state: ${s}`);
  }
});

test('Test 2: explore-state.md documents state-transition + default-state + error-recovery testing', async () => {
  const text = await read();
  assert.match(text, /transition/i, 'must mention state transitions');
  assert.match(
    text,
    /default[\s-]?state|initial[\s-]?state/i,
    'must mention default/initial state',
  );
  assert.match(text, /recovery|recover/i, 'must mention error recovery');
});

test('Test 3: explore-state.md carries bootstrap preamble + capability frontmatter + evidence requirement', async () => {
  const text = await read();
  assert.ok(text.startsWith('---\n'), 'must have YAML frontmatter');
  assert.match(text, /Before doing anything else:/);
  assert.match(text, /\.testatlas\/bootstrap\.md/);
  assert.match(text, /If there is a conflict:/);
  assert.match(text, /capabilities:\s*\[/);
  assert.match(
    text,
    /no[\s-]?evidence|evidence file path|evidence\/explore-state/i,
    'must cite evidence requirement',
  );
});

test('Test 4: explore-state.md carries the mandatory-when-available walkthrough contract', async () => {
  const text = await read();
  assert.match(
    text,
    /MUST drive the full walkthrough|MUST drive .* walkthrough/,
    'missing mandatory-when-available phrase',
  );
  assert.match(
    text,
    /chrome-devtools-mcp\.md/,
    'must link the Chrome DevTools MCP reference shard',
  );
  assert.match(
    text,
    /Skipping a walkthrough step[\s\S]{0,300}contract violation/,
    'must phrase silent-skip as contract violation',
  );
});

test('Test 5: explore-state.md cites Tier-1 Chrome DevTools MCP tools verbatim', async () => {
  const text = await read();
  for (const tool of [
    'navigate_page',
    'wait_for',
    'take_snapshot',
    'take_screenshot',
    'evaluate_script',
    'handle_dialog',
  ]) {
    assert.match(text, new RegExp(`\\b${tool}\\b`), `missing tool: ${tool}`);
  }
});

test('Test 6: explore-state.md updates the states map artifacts', async () => {
  const text = await read();
  assert.match(text, /maps\/states\.md/);
  assert.match(text, /maps\/states\.json/);
});

test('Test 7: explore-state.md is ≤1800 words', async () => {
  const text = await read();
  const n = countWords(text);
  assert.ok(n <= 1800, `${n} words exceeds 1800 budget`);
});
