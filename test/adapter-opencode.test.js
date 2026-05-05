// test/adapter-opencode.test.js
//
// Plan 06-03 Task 2: structural assertions on the 31 generated OpenCode
// adapter command files. OpenCode's slash-command surface lives at
// `.opencode/commands/<name>.md` per opencode.ai/docs/commands. TestAtlas
// emits the minimal frontmatter (`description` only) and leaves `agent:`
// unset for agent-agnosticism (D-RES Q1.2 + Open Question 3).

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
  'opencode',
  '.opencode',
  'commands',
);

test('Test 1: 31 derived atlas-*.md command files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 31, `expected 31 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 31, `expected 31 derived files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each file has `description` frontmatter only — NO `agent`, NO `model`', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceFm = parseFrontmatter(await readFile(sourcePath, 'utf8'));
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');
    const derivedFm = parseFrontmatter(derivedText);

    // description must match source verbatim.
    assert.equal(
      derivedFm.description,
      sourceFm.description,
      `atlas-${cmdName}.md: description must match source`,
    );
    // Per D-RES Open Question 3: leave OpenCode `agent:` unset.
    assert.ok(!('agent' in derivedFm), `atlas-${cmdName}.md: must NOT declare an 'agent' field`);
    assert.ok(!('model' in derivedFm), `atlas-${cmdName}.md: must NOT declare a 'model' field`);
    // Frontmatter has exactly one key.
    assert.deepEqual(
      Object.keys(derivedFm),
      ['description'],
      `atlas-${cmdName}.md: frontmatter must contain exactly { description }`,
    );
  }
});

test('Test 3: envelope present; line after START is BOOTSTRAP_PREAMBLE; marker source/hash valid', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceText = await readFile(sourcePath, 'utf8');
    const expectedHash = hashContent(sourceText);
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');

    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `atlas-${cmdName}.md: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    assert.equal(marker.hash, expectedHash, `atlas-${cmdName}.md: hash mismatch`);

    const lines = derivedText.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `atlas-${cmdName}.md: missing GENERATED:START marker line`);
    assert.equal(
      lines[startIdx + 1],
      BOOTSTRAP_PREAMBLE,
      `atlas-${cmdName}.md: line after START must be BOOTSTRAP_PREAMBLE verbatim`,
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
