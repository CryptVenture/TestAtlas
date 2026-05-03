// test/adapter-claude-code.test.js
//
// Plan 06-01 Task 3: structural assertions on the 30 generated Claude Code
// adapter files. Idempotency and version-invariance live in their own
// dedicated test files; this one focuses on the SHAPE of every file.

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
  'claude-code',
  '.claude',
  'commands',
);

test('Test 1: 30 derived atlas-*.md files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 30, `expected 30 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 30, `expected 30 derived files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
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

test('Test 3: marker source + hash match `commands/<name>.md` and hashContent(source)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceText = await readFile(sourcePath, 'utf8');
    const expectedHash = hashContent(sourceText);
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');
    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `atlas-${cmdName}.md: missing marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    assert.equal(marker.hash, expectedHash, `atlas-${cmdName}.md: hash mismatch`);
  }
});

test('Test 4: each derived file has description + allowed-tools frontmatter', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceFm = parseFrontmatter(await readFile(sourcePath, 'utf8'));
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');
    const derivedFm = parseFrontmatter(derivedText);

    assert.equal(
      derivedFm.description,
      sourceFm.description,
      `atlas-${cmdName}.md: description must match source`,
    );
    assert.ok(
      typeof derivedFm['allowed-tools'] === 'string',
      `atlas-${cmdName}.md: allowed-tools must be a string`,
    );
    // Baseline tools are always granted.
    for (const baseline of ['Read', 'Write', 'Edit', 'Glob', 'Grep']) {
      assert.ok(
        derivedFm['allowed-tools'].includes(baseline),
        `atlas-${cmdName}.md: missing baseline tool ${baseline}`,
      );
    }
    // shell capability → Bash
    if (Array.isArray(sourceFm.capabilities) && sourceFm.capabilities.includes('shell')) {
      assert.ok(
        derivedFm['allowed-tools'].includes('Bash'),
        `atlas-${cmdName}.md: source declares shell but Bash missing`,
      );
    }
    // browser or MCP → mcp__*
    if (
      Array.isArray(sourceFm.capabilities) &&
      (sourceFm.capabilities.includes('browser') || sourceFm.capabilities.includes('MCP'))
    ) {
      assert.ok(
        derivedFm['allowed-tools'].includes('mcp__*'),
        `atlas-${cmdName}.md: source declares browser/MCP but mcp__* missing`,
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
