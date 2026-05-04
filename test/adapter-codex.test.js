// test/adapter-codex.test.js
//
// Structural assertions on the 30 generated Codex CLI adapter prompts.
// Codex prompts at ~/.codex/prompts/<name>.md are plain markdown with NO
// YAML frontmatter (Codex ignores it). Each rendered file carries an
// HTML-comment header describing the prompt + the standard
// BOOTSTRAP_PREAMBLE-headed marker envelope.

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
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'codex', '.codex', 'prompts');

test('Test 1: 30 derived atlas-*.md prompt files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 30, `expected 30 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 30, `expected 30 derived prompt files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each prompt has NO YAML frontmatter; envelope present; BOOTSTRAP_PREAMBLE inside', async () => {
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
    // BOOTSTRAP_PREAMBLE appears after the marker.
    assert.ok(text.includes(BOOTSTRAP_PREAMBLE), `${name}: must contain bootstrap preamble`);
  }
});

test('Test 3: marker source + hash match commands/<name>.md and hashContent(source)', async () => {
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

test('Test 4: README.md exists with required sections + slash-invoke note', async () => {
  const text = await readFile(
    path.join(repoRoot, '.testatlas', 'adapters', 'codex', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Capabilities', 'Format', 'Regeneration']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\/prompts:atlas-/, 'README must show the /prompts:atlas-* invoke form');
  assert.match(text, /~\/\.codex\/prompts/, 'README must point to ~/.codex/prompts/');
});
