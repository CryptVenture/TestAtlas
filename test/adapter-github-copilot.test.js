// test/adapter-github-copilot.test.js
//
// Structural assertions on the 32 generated GitHub Copilot adapter prompt
// files. Copilot prompts at `.github/prompts/<name>.prompt.md` are markdown
// with YAML frontmatter (mode: agent, description).

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
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'github-copilot',
  '.github',
  'prompts',
);

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.prompt.md', async () => {
  // Phase 16: github-copilot renders flat. Total = V1 flat + V2 categorized.
  const { total, expectedNames } = await buildAdapterSourceSet({
    cwd: repoRoot,
    ext: '.prompt.md',
  });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.prompt.md'));
  assert.equal(
    derived.length,
    total,
    `expected ${total} derived prompt files; got ${derived.length}`,
  );
  for (const name of derived) assert.ok(expectedNames.has(name), `unexpected file: ${name}`);
  for (const name of expectedNames) assert.ok(derived.includes(name), `missing: ${name}`);
});

test('Test 2: frontmatter has mode: agent + description', async () => {
  // Phase 16: walk every flat-root derived file (V1 + V2).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.prompt.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const sourceFm = parseFrontmatter(expected.sourceText);
    const derivedText = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const derivedFm = parseFrontmatter(derivedText);
    assert.equal(derivedFm.mode, 'agent', `${name}: mode must be agent`);
    assert.equal(derivedFm.description, sourceFm.description, `${name}: description`);
  }
});

test('Test 3: envelope present; marker source + hash match V1-flat or V2-categorized source', async () => {
  // Phase 16: marker.source carries SOURCE path; output is flat.
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.prompt.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.prompt.md'));
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
    path.join(repoRoot, '.testatlas', 'adapters', 'github-copilot', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Capabilities', 'Format', 'Regeneration']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\.github\/prompts/, 'README must reference .github/prompts path');
});
