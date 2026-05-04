// test/adapter-sourcegraph-amp.test.js
//
// Structural assertions on the 30 generated Sourcegraph Amp adapter command
// files. Amp commands at `.agents/commands/<name>.md` are plain markdown
// with NO YAML frontmatter; an HTML-comment header carries the description.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { listCommandFiles } from '../scripts/lib/list-command-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'sourcegraph-amp',
  '.agents',
  'commands',
);

test('Test 1: 30 derived atlas-*.md command files exist', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 30);
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 30, `expected 30 derived command files; got ${derived.length}`);
  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) assert.ok(expectedNames.has(name), `unexpected file: ${name}`);
  for (const name of expectedNames) assert.ok(derived.includes(name), `missing: ${name}`);
});

test('Test 2: each command has NO YAML frontmatter; HTML header + envelope present', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const first = text.split('\n', 1)[0];
    assert.notEqual(first, '---', `${name}: must not have YAML frontmatter`);
    assert.ok(
      /<!-- TestAtlas command:/.test(first),
      `${name}: first line must be the TestAtlas-command HTML comment`,
    );
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.ok(text.includes(BOOTSTRAP_PREAMBLE), `${name}: must contain bootstrap preamble`);
  }
});

test('Test 3: marker source + hash match commands/<name>.md', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker);
    const cmdName = name.replace(/^atlas-/, '').replace(/\.md$/, '');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    const sourceText = await readFile(
      path.join(repoRoot, '.testatlas', 'commands', `${cmdName}.md`),
      'utf8',
    );
    assert.equal(marker.hash, hashContent(sourceText), `${name}: hash mismatch with source`);
  }
});

test('Test 4: README.md exists with required sections', async () => {
  const text = await readFile(
    path.join(repoRoot, '.testatlas', 'adapters', 'sourcegraph-amp', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Capabilities', 'Format', 'Regeneration']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\.agents\/commands/, 'README must reference .agents/commands path');
});
