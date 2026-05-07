// test/adapter-opencode.test.js
//
// Plan 06-03 Task 2: structural assertions on the 32 generated OpenCode
// adapter command files. OpenCode's slash-command surface lives at
// `.opencode/commands/<name>.md` per opencode.ai/docs/commands. TestAtlas
// emits the minimal frontmatter (`description` only) and leaves `agent:`
// unset for agent-agnosticism (D-RES Q1.2 + Open Question 3).

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { expectedPreambleFor, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { parseFrontmatter } from '../scripts/lib/parse-frontmatter.js';
import { buildAdapterSourceSet } from './_helpers/adapter-source-set.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'opencode',
  '.opencode',
  'commands',
);

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.md file', async () => {
  // Phase 16: opencode renders flat. Total = V1 flat + V2 categorized.
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, total, `expected ${total} derived files; got ${derived.length}`);

  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each file has `description` frontmatter only — NO `agent`, NO `model`', async () => {
  // Phase 16: walk every flat-root derived file (V1 + V2).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const sourceFm = parseFrontmatter(expected.sourceText);
    const derivedPath = path.join(ADAPTER_DIR, name);
    const derivedText = await readFile(derivedPath, 'utf8');
    const derivedFm = parseFrontmatter(derivedText);

    assert.equal(
      derivedFm.description,
      sourceFm.description,
      `${name}: description must match source`,
    );
    assert.ok(!('agent' in derivedFm), `${name}: must NOT declare an 'agent' field`);
    assert.ok(!('model' in derivedFm), `${name}: must NOT declare a 'model' field`);
    assert.deepEqual(
      Object.keys(derivedFm),
      ['description'],
      `${name}: frontmatter must contain exactly { description }`,
    );
  }
});

test('Test 3: envelope present; line after START is BOOTSTRAP_PREAMBLE; marker source/hash valid', async () => {
  // Phase 16: marker.source carries SOURCE path; output is flat.
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const derivedPath = path.join(ADAPTER_DIR, name);
    const derivedText = await readFile(derivedPath, 'utf8');

    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(marker.hash, hashContent(expected.sourceText), `${name}: hash mismatch`);

    const lines = derivedText.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `${name}: missing GENERATED:START marker line`);
    // Quick 260507-hzw: BOOTSTRAP_PREAMBLE carries an {{ADAPTER_COMMAND_PATH}}
    // placeholder substituted per adapter at render-time.
    assert.equal(
      lines[startIdx + 1],
      expectedPreambleFor(`.opencode/commands/${name}`),
      `${name}: line after START must be substituted BOOTSTRAP_PREAMBLE verbatim`,
    );
  }
});

test('Test 4: README.md exists with required sections (Install / Capabilities / How OpenCode discovers commands)', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'opencode', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  // OpenCode-specific: the README must explain how OpenCode discovers commands.
  assert.match(
    text,
    /\.opencode\/commands/,
    'README must reference .opencode/commands path (OpenCode discovery)',
  );
  assert.match(text, /agent/i, 'README must explain why TestAtlas leaves the `agent:` field unset');
});
