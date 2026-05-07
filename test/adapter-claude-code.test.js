// test/adapter-claude-code.test.js
//
// Plan 06-01 Task 3: structural assertions on the 32 generated Claude Code
// adapter files. Idempotency and version-invariance live in their own
// dedicated test files; this one focuses on the SHAPE of every file.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { parseFrontmatter } from '../scripts/lib/parse-frontmatter.js';
import { buildAdapterSourceSet } from './_helpers/adapter-source-set.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'claude-code',
  '.claude',
  'commands',
);

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.md file', async () => {
  // Phase 16 (Plan 16-01): per `prd/reports/v2-adapter-slash-command-discovery.md`
  // Option A, all per-command-file adapters render flat. Total derived files
  // = V1 flat + V2 categorized; no subdirs at the commands root.
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR, { withFileTypes: true });
  const flatDerived = entries
    .filter((e) => e.isFile() && e.name.startsWith('atlas-') && e.name.endsWith('.md'))
    .map((e) => e.name);
  // Flatness: zero subdirs at the commands root.
  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  assert.deepEqual(subdirs, [], `unexpected subdirs at commands root: [${subdirs.join(', ')}]`);
  assert.equal(
    flatDerived.length,
    total,
    `expected ${total} flat derived files; got ${flatDerived.length}`,
  );

  for (const name of flatDerived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(flatDerived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each derived file body begins with PRD §23 BOOTSTRAP_PREAMBLE', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    // Locate the START marker line; the next line must be BOOTSTRAP_PREAMBLE.
    const lines = text.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `${name}: missing GENERATED:START marker`);
    assert.equal(
      lines[startIdx + 1],
      BOOTSTRAP_PREAMBLE,
      `${name}: line after START must be BOOTSTRAP_PREAMBLE verbatim`,
    );
  }
});

test('Test 3: marker source + hash match V1-flat or V2-categorized source', async () => {
  // Phase 16: marker.source carries the SOURCE path
  // (`commands/<name>.md` for V1 flat, `commands/<category>/<name>.md` for V2).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const derivedPath = path.join(ADAPTER_DIR, name);
    const derivedText = await readFile(derivedPath, 'utf8');
    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `${name}: missing marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(
      marker.hash,
      hashContent(expected.sourceText),
      `${name}: hash mismatch with source`,
    );
  }
});

test('Test 4: each derived file has description + allowed-tools frontmatter', async () => {
  // Phase 16: walk every derived file at the flat root (V1 flat + V2
  // categorized) and validate its frontmatter against the corresponding
  // source's frontmatter.
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
    assert.ok(
      typeof derivedFm['allowed-tools'] === 'string',
      `${name}: allowed-tools must be a string`,
    );
    // Baseline tools are always granted.
    for (const baseline of ['Read', 'Write', 'Edit', 'Glob', 'Grep']) {
      assert.ok(
        derivedFm['allowed-tools'].includes(baseline),
        `${name}: missing baseline tool ${baseline}`,
      );
    }
    // shell capability → Bash
    if (Array.isArray(sourceFm.capabilities) && sourceFm.capabilities.includes('shell')) {
      assert.ok(
        derivedFm['allowed-tools'].includes('Bash'),
        `${name}: source declares shell but Bash missing`,
      );
    }
    // browser or MCP → mcp__*
    if (
      Array.isArray(sourceFm.capabilities) &&
      (sourceFm.capabilities.includes('browser') || sourceFm.capabilities.includes('MCP'))
    ) {
      assert.ok(
        derivedFm['allowed-tools'].includes('mcp__*'),
        `${name}: source declares browser/MCP but mcp__* missing`,
      );
    }
  }
});

test('Test 5: README.md exists with required sections', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'claude-code', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'Limitations']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
});
