// test/adapter-amazon-q.test.js
//
// Structural assertions on the SINGLE concatenated
// `.testatlas/adapters/amazon-q/.amazonq/rules/atlas.md` file. Same shape
// as Aider's CONVENTIONS.md.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { renderAmazonQ } from '../scripts/lib/adapters/render-amazon-q.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { listCommandFiles } from '../scripts/lib/list-command-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ATLAS_PATH = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'amazon-q',
  '.amazonq',
  'rules',
  'atlas.md',
);

test('Test 1: atlas.md exists and total line count ≤ 210', async () => {
  const text = await readFile(ATLAS_PATH, 'utf8');
  const lines = text.split('\n');
  assert.ok(lines.length <= 210, `atlas.md must be ≤210 lines; got ${lines.length}`);
});

test('Test 2: 32 H2 sections matching source command set', async () => {
  const text = await readFile(ATLAS_PATH, 'utf8');
  const headings = text
    .split('\n')
    .filter((l) => /^##\s+\/atlas-/.test(l))
    .map((l) => l.replace(/^##\s+\//, '').trim());
  assert.equal(headings.length, 32, `expected 32 H2 atlas-* headings; got ${headings.length}`);
  const sources = await listCommandFiles({ cwd: repoRoot });
  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}`));
  for (const h of headings) assert.ok(expectedNames.has(h), `unexpected H2: /${h}`);
  for (const name of expectedNames) assert.ok(headings.includes(name), `missing H2: /${name}`);
});

test('Test 3: single envelope; aggregate hash = hashContent(join(per-source hashes))', async () => {
  const text = await readFile(ATLAS_PATH, 'utf8');
  const marker = parseAdapterMarker(text);
  assert.ok(marker, 'atlas.md must contain a single adapter envelope');
  assert.equal(marker.section, 'adapter-body');
  assert.equal(marker.source, 'commands/_aggregate');
  const sources = await listCommandFiles({ cwd: repoRoot });
  const perSource = await Promise.all(
    sources.map(async (sp) => hashContent(await readFile(sp, 'utf8'))),
  );
  const expected = hashContent(perSource.join(''));
  assert.equal(marker.hash, expected, 'aggregate hash mismatch');
});

test('Test 4: renderer hard-fails when any section would exceed 7 lines', async () => {
  const fakeLongDescription = 'X'.repeat(2000);
  const fakeSource = `---
command: super-long
version: 1.0.0
description: ${fakeLongDescription}
capabilities: [shell, file-write, browser, MCP, web-fetch]
---

# super-long body
`;
  let threw = null;
  try {
    renderAmazonQ({
      sources: [{ sourcePath: '/fake/.testatlas/commands/super-long.md', sourceText: fakeSource }],
      adapterCaps: ['shell', 'file-write'],
    });
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'renderAmazonQ must throw when a section exceeds 7 lines');
  assert.match(threw.message, /super-long|max 7|7 lines/);
});

test('Test 5: README.md exists with required sections', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'amazon-q', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'Regeneration']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /atlas\.md|\.amazonq/, 'README must reference atlas.md or .amazonq path');
});
