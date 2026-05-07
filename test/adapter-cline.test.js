// test/adapter-cline.test.js
//
// Structural assertions on the generated Cline adapter workflow files.
// Cline workflows at `.clinerules/workflows/<name>.md` are plain markdown
// with NO YAML frontmatter. Slash-invoke is `/atlas-<name>.md` (with the
// .md extension — Cline's contract).
//
// Phase 16 (Plan 16-01): per-command-file adapters render V1 flat AND V2
// categorized commands FLAT at the adapter commands root with
// `commandBaseNameFromSource` naming. Counts are derived dynamically from
// the source set rather than hardcoded to 32.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { buildAdapterSourceSet } from './_helpers/adapter-source-set.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'cline',
  '.clinerules',
  'workflows',
);

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.md workflow', async () => {
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(
    derived.length,
    total,
    `expected ${total} derived workflow files; got ${derived.length}`,
  );
  for (const name of derived) assert.ok(expectedNames.has(name), `unexpected file: ${name}`);
  for (const name of expectedNames) assert.ok(derived.includes(name), `missing: ${name}`);
});

test('Test 2: each workflow has NO YAML frontmatter; HTML header + envelope present', async () => {
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

test('Test 3: marker source + hash match the V1-flat or V2-categorized source', async () => {
  // Phase 16: each derived file's marker.source carries the SOURCE path
  // (`commands/<name>.md` for V1 flat, `commands/<category>/<name>.md` for V2
  // categorized) — only the OUTPUT path flattens. The shared helper builds
  // the (flatName → sourceRel) map so the test mirrors the renderer.
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing marker`);
    const expected = flatNameToSource.get(name);
    assert.ok(expected, `${name}: no expected source mapping`);
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(
      marker.hash,
      hashContent(expected.sourceText),
      `${name}: hash mismatch with source`,
    );
  }
});

test('Test 4: README.md exists with required sections + slash-invoke note', async () => {
  const text = await readFile(
    path.join(repoRoot, '.testatlas', 'adapters', 'cline', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Capabilities', 'Format', 'Regeneration']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\/atlas-\w+\.md/, 'README must show the /atlas-<name>.md invoke form');
  assert.match(text, /\.clinerules\/workflows/, 'README must reference .clinerules/workflows path');
});
