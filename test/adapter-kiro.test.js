// test/adapter-kiro.test.js
//
// Structural assertions on the 32 generated Kiro adapter skill files.
// Kiro skills at `.kiro/skills/atlas-<name>.md` are markdown with YAML
// frontmatter (name, description, inclusion: manual). Slash-invoke is
// `/atlas-<name>`.

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
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'kiro', '.kiro', 'skills');

test('Test 1: 32 derived atlas-*.md skill files exist', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 32);
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 32, `expected 32 derived skill files; got ${derived.length}`);
  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) assert.ok(expectedNames.has(name), `unexpected file: ${name}`);
  for (const name of expectedNames) assert.ok(derived.includes(name), `missing: ${name}`);
});

test('Test 2: frontmatter has name, description, inclusion: manual', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceFm = parseFrontmatter(await readFile(sourcePath, 'utf8'));
    const derivedText = await readFile(path.join(ADAPTER_DIR, `atlas-${cmdName}.md`), 'utf8');
    const derivedFm = parseFrontmatter(derivedText);
    assert.equal(derivedFm.name, `atlas-${cmdName}`, `atlas-${cmdName}: name field`);
    assert.equal(derivedFm.description, sourceFm.description, `atlas-${cmdName}: description`);
    assert.equal(derivedFm.inclusion, 'manual', `atlas-${cmdName}: inclusion must be manual`);
  }
});

test('Test 3: envelope present; marker source + hash match source', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    const cmdName = name.replace(/^atlas-/, '').replace(/\.md$/, '');
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
    path.join(repoRoot, '.testatlas', 'adapters', 'kiro', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Capabilities', 'Format', 'Regeneration']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\.kiro\/skills/, 'README must reference .kiro/skills path');
});
