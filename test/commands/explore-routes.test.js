// test/commands/explore-routes.test.js
//
// Plan 14-03 Task 1 — explore-routes.md maps all routes, navigation paths,
// guards, redirects, and deep-linking. It must:
//   1. Document navigation testing (forward/back, deep-link, redirects, guards)
//   2. Carry bootstrap preamble + frontmatter capabilities + evidence requirement
//   3. Carry the mandatory-when-available walkthrough contract (UI-touching)
//   4. Cite Tier-1 Chrome DevTools MCP tools verbatim
//   5. Update _testatlas/maps/routes.{md,json}
//   6. Stay ≤1800 words

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { countWords } from '../../scripts/lib/word-count.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'explore', 'explore-routes.md');

async function read() {
  return readFile(FILE, 'utf8');
}

test('Test 1: explore-routes.md documents navigation testing dimensions', async () => {
  const text = await read();
  assert.match(text, /deep[\s-]?link/i, 'must mention deep links');
  assert.match(text, /redirect/i, 'must mention redirects');
  assert.match(text, /guard/i, 'must mention route guards');
  assert.match(
    text,
    /back|forward|navigation history|history\.back/i,
    'must mention back/forward navigation',
  );
});

test('Test 2: explore-routes.md carries bootstrap preamble + capability frontmatter', async () => {
  const text = await read();
  assert.ok(text.startsWith('---\n'));
  assert.match(text, /Before doing anything else:/);
  assert.match(text, /\.testatlas\/bootstrap\.md/);
  assert.match(text, /If there is a conflict:/);
  assert.match(text, /capabilities:\s*\[/);
});

test('Test 3: explore-routes.md cites evidence requirement', async () => {
  const text = await read();
  assert.match(text, /evidence\/explore-routes|no[\s-]?evidence|evidence file path/i);
});

test('Test 4: explore-routes.md carries the mandatory-when-available walkthrough contract', async () => {
  const text = await read();
  assert.match(text, /MUST drive the full walkthrough|MUST drive .* walkthrough/);
  assert.match(text, /chrome-devtools-mcp\.md/);
  assert.match(text, /Skipping a walkthrough step[\s\S]{0,300}contract violation/);
});

test('Test 5: explore-routes.md cites Tier-1 Chrome DevTools MCP tools verbatim', async () => {
  const text = await read();
  for (const tool of [
    'navigate_page',
    'wait_for',
    'take_snapshot',
    'list_network_requests',
    'evaluate_script',
  ]) {
    assert.match(text, new RegExp(`\\b${tool}\\b`), `missing tool: ${tool}`);
  }
});

test('Test 6: explore-routes.md updates the routes map artifacts', async () => {
  const text = await read();
  assert.match(text, /maps\/routes\.md/);
  assert.match(text, /maps\/routes\.json/);
});

test('Test 7: explore-routes.md is ≤1800 words', async () => {
  const text = await read();
  const n = countWords(text);
  assert.ok(n <= 1800, `${n} words exceeds 1800 budget`);
});
