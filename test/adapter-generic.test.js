// test/adapter-generic.test.js
//
// Plan 06-03 Task 1: structural assertions on the 31 generated Generic
// (paste-able) adapter prompts. The Generic adapter ships plain markdown
// without YAML frontmatter — just an optional HTML-comment description
// line, then the BOOTSTRAP_PREAMBLE-headed envelope.

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
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'generic', 'prompts');

test('Test 1: 31 derived atlas-*.md prompt files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 31, `expected 31 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 31, `expected 31 derived prompt files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each prompt has NO YAML frontmatter; envelope present; BOOTSTRAP_PREAMBLE on line after START', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    // No leading YAML fence: first line MUST NOT be `---`.
    const first = text.split('\n', 1)[0];
    assert.notEqual(first, '---', `${name}: must not have YAML frontmatter`);

    // Marker envelope present and parseable.
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');

    // Line immediately after START is BOOTSTRAP_PREAMBLE verbatim.
    const lines = text.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `${name}: missing GENERATED:START marker line`);
    assert.equal(
      lines[startIdx + 1],
      BOOTSTRAP_PREAMBLE,
      `${name}: line after START must be BOOTSTRAP_PREAMBLE verbatim`,
    );
  }
});

test('Test 3: marker source + hash match commands/<name>.md and hashContent(source)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceText = await readFile(sourcePath, 'utf8');
    const expectedHash = hashContent(sourceText);
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');
    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `atlas-${cmdName}.md: missing marker`);
    assert.equal(marker.source, `commands/${cmdName}.md`);
    assert.equal(marker.hash, expectedHash, `atlas-${cmdName}.md: hash mismatch`);
  }
});

test('Test 4: README.md exists with required sections + paste-bootstrap-first reminder', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'generic', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'How to use']) {
    assert.match(text, new RegExp(`#+\\s+${heading}`, 'i'), `README missing section: ${heading}`);
  }
  // The bootstrap-first paste contract MUST be explicit.
  assert.match(
    text,
    /bootstrap\.md/i,
    'README must reference .testatlas/bootstrap.md (paste-first contract)',
  );
});
