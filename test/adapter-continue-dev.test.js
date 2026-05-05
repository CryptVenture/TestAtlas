// test/adapter-continue-dev.test.js
//
// Structural assertions on the 31 generated Continue.dev adapter prompt
// files. Continue prompts at `.continue/prompts/<name>.prompt.md` are
// markdown with YAML frontmatter (name, description, invokable: true).

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { listCommandFiles } from '../scripts/lib/list-command-files.js';
import { parseFrontmatter } from '../scripts/lib/parse-frontmatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'continue-dev',
  '.continue',
  'prompts',
);

test('Test 1: 31 derived atlas-*.prompt.md prompt files exist', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 31);
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.prompt.md'));
  assert.equal(derived.length, 31, `expected 31 derived prompt files; got ${derived.length}`);
  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.prompt.md`));
  for (const name of derived) assert.ok(expectedNames.has(name), `unexpected file: ${name}`);
  for (const name of expectedNames) assert.ok(derived.includes(name), `missing: ${name}`);
});

test('Test 2: frontmatter has name, description, invokable: true', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceFm = parseFrontmatter(await readFile(sourcePath, 'utf8'));
    const derivedText = await readFile(
      path.join(ADAPTER_DIR, `atlas-${cmdName}.prompt.md`),
      'utf8',
    );
    const derivedFm = parseFrontmatter(derivedText);
    assert.equal(derivedFm.name, `atlas-${cmdName}`, `atlas-${cmdName}: name field`);
    assert.equal(derivedFm.description, sourceFm.description, `atlas-${cmdName}: description`);
    assert.equal(String(derivedFm.invokable), 'true', `atlas-${cmdName}: invokable must be true`);
  }
});

test('Test 3: envelope present; marker source + hash match source', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.prompt.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    const cmdName = name.replace(/^atlas-/, '').replace(/\.prompt\.md$/, '');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    const sourceText = await readFile(
      path.join(repoRoot, '.testatlas', 'commands', `${cmdName}.md`),
      'utf8',
    );
    assert.equal(marker.hash, hashContent(sourceText), `${name}: hash mismatch with source`);
    assert.ok(text.includes(BOOTSTRAP_PREAMBLE), `${name}: must contain bootstrap preamble`);
  }
});

test('Test 4: README.md exists with required sections', async () => {
  const text = await readFile(
    path.join(repoRoot, '.testatlas', 'adapters', 'continue-dev', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Capabilities', 'Format', 'Regeneration']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\.continue\/prompts/, 'README must reference .continue/prompts path');
});
