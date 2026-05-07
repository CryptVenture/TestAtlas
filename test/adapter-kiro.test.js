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
import { BOOTSTRAP_PREAMBLE_PREFIX, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { parseFrontmatter } from '../scripts/lib/parse-frontmatter.js';
import { buildAdapterSourceSet } from './_helpers/adapter-source-set.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'kiro', '.kiro', 'skills');

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.md skill', async () => {
  // Phase 16: kiro renders flat. Total = V1 flat + V2 categorized.
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(
    derived.length,
    total,
    `expected ${total} derived skill files; got ${derived.length}`,
  );
  for (const name of derived) assert.ok(expectedNames.has(name), `unexpected file: ${name}`);
  for (const name of expectedNames) assert.ok(derived.includes(name), `missing: ${name}`);
});

test('Test 2: frontmatter has name, description, inclusion: manual', async () => {
  // Phase 16: walk every flat-root derived file (V1 + V2). The renderer's
  // `name:` field uses commandBaseNameFromSource so V2 categorized files
  // get their disambiguated name (e.g. atlas-core-init).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const sourceFm = parseFrontmatter(expected.sourceText);
    const derivedText = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const derivedFm = parseFrontmatter(derivedText);
    const expectedNameField = name.replace(/\.md$/, '');
    assert.equal(derivedFm.name, expectedNameField, `${name}: name field`);
    assert.equal(derivedFm.description, sourceFm.description, `${name}: description`);
    assert.equal(derivedFm.inclusion, 'manual', `${name}: inclusion must be manual`);
  }
});

test('Test 3: envelope present; marker source + hash match V1-flat or V2-categorized source', async () => {
  // Phase 16: marker.source carries SOURCE path; output is flat.
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    const expected = flatNameToSource.get(name);
    assert.ok(expected, `${name}: no expected source mapping`);
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(
      marker.hash,
      hashContent(expected.sourceText),
      `${name}: hash mismatch with source`,
    );
    assert.ok(text.includes(BOOTSTRAP_PREAMBLE_PREFIX), `${name}: must contain bootstrap preamble`);
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
