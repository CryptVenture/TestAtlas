// test/commands/explore-components.test.js
//
// Plan 14-03 Task 1 — explore-components.md inventories UI components with
// props, state dependencies, responsive behavior. It must:
//   1. Carry bootstrap preamble + frontmatter capabilities + evidence requirement
//   2. Document component inventory: name, type, props, states, responsive
//   3. Carry the mandatory-when-available walkthrough contract (UI-touching)
//   4. Cite Tier-1 Chrome DevTools MCP tools verbatim
//   5. Update _testatlas/maps/components.{md,json}
//   6. Stay ≤1800 words

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { countWords } from '../../scripts/lib/word-count.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'explore', 'explore-components.md');

async function read() {
  return readFile(FILE, 'utf8');
}

test('Test 1: explore-components.md documents component inventory dimensions', async () => {
  const text = await read();
  assert.match(text, /\bprops\b/i, 'must mention props');
  assert.match(
    text,
    /state[\s-]?depend|state[\s-]?bind|state[\s-]?require/i,
    'must mention state dependencies',
  );
  assert.match(text, /responsive/i, 'must mention responsive behavior');
});

test('Test 2: explore-components.md carries bootstrap preamble + capability frontmatter', async () => {
  const text = await read();
  assert.ok(text.startsWith('---\n'));
  assert.match(text, /Before doing anything else:/);
  assert.match(text, /\.testatlas\/bootstrap\.md/);
  assert.match(text, /If there is a conflict:/);
  assert.match(text, /capabilities:\s*\[/);
});

test('Test 3: explore-components.md cites evidence requirement', async () => {
  const text = await read();
  assert.match(text, /evidence\/explore-components|no[\s-]?evidence|evidence file path/i);
});

test('Test 4: explore-components.md carries the mandatory-when-available walkthrough contract', async () => {
  const text = await read();
  assert.match(text, /MUST drive the full walkthrough|MUST drive .* walkthrough/);
  assert.match(text, /chrome-devtools-mcp\.md/);
  assert.match(text, /Skipping a walkthrough step[\s\S]{0,300}contract violation/);
});

test('Test 5: explore-components.md cites Tier-1 Chrome DevTools MCP tools verbatim', async () => {
  const text = await read();
  for (const tool of [
    'navigate_page',
    'wait_for',
    'take_snapshot',
    'evaluate_script',
    'handle_dialog',
  ]) {
    assert.match(text, new RegExp(`\\b${tool}\\b`), `missing tool: ${tool}`);
  }
});

test('Test 6: explore-components.md updates the components map artifacts', async () => {
  const text = await read();
  assert.match(text, /maps\/components\.md/);
  assert.match(text, /maps\/components\.json/);
});

test('Test 7: explore-components.md is ≤1800 words', async () => {
  const text = await read();
  const n = countWords(text);
  assert.ok(n <= 1800, `${n} words exceeds 1800 budget`);
});
