// test/adapter-cursor.test.js
//
// Plan 06-04 Task 1: structural assertions on the 30 generated Cursor adapter
// rule files. Cursor 2026 uses flat `.mdc` files per `.cursor/rules/<name>.mdc`
// (per RESEARCH §1; the folder form announced in Cursor 2.2 mid-2026 is non-
// functional, so we ship flat MDC).
//
// MDC frontmatter shape (06-RESEARCH.md §Q1.4):
//   ---
//   description: <copied from source>
//   globs:
//   alwaysApply: false
//   ---
// Order is locked. Empty `globs:` is correct — TestAtlas commands are not
// file-scoped; user invokes via mention or manual rule attach.
//
// Cursor's declared capabilities are [shell, web-fetch, file-write] — it
// lacks first-class browser/MCP. For commands needing those, the renderer
// MUST inject the canonical degradation block.

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
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'cursor', '.cursor', 'rules');

test('Test 1: 30 derived atlas-*.mdc rule files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 30, `expected 30 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.mdc'));
  assert.equal(derived.length, 30, `expected 30 derived .mdc files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.mdc`));
  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each .mdc has locked frontmatter [description, globs:<empty>, alwaysApply: false]; envelope present; BOOTSTRAP_PREAMBLE on line after START', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceText = await readFile(sourcePath, 'utf8');
    const sourceFm = parseFrontmatter(sourceText);
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.mdc`);
    const derivedText = await readFile(derivedPath, 'utf8');

    // Locked frontmatter shape — order matters.
    assert.ok(derivedText.startsWith('---\n'), `atlas-${cmdName}.mdc: missing frontmatter fence`);
    const fmEnd = derivedText.indexOf('\n---\n', 4);
    assert.ok(fmEnd !== -1, `atlas-${cmdName}.mdc: missing closing frontmatter fence`);
    const fm = derivedText.slice(4, fmEnd);
    const fmLines = fm.split('\n');
    assert.equal(
      fmLines[0],
      `description: ${sourceFm.description}`,
      `atlas-${cmdName}.mdc: description must be on first line`,
    );
    assert.equal(
      fmLines[1],
      'globs:',
      `atlas-${cmdName}.mdc: second frontmatter line must be 'globs:' (empty value)`,
    );
    assert.equal(
      fmLines[2],
      'alwaysApply: false',
      `atlas-${cmdName}.mdc: third frontmatter line must be 'alwaysApply: false'`,
    );

    // Marker envelope present and parseable.
    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `atlas-${cmdName}.mdc: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    assert.equal(marker.hash, hashContent(sourceText), `atlas-${cmdName}.mdc: hash mismatch`);

    // Line immediately after START is BOOTSTRAP_PREAMBLE verbatim.
    const lines = derivedText.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `atlas-${cmdName}.mdc: missing GENERATED:START marker line`);
    assert.equal(
      lines[startIdx + 1],
      BOOTSTRAP_PREAMBLE,
      `atlas-${cmdName}.mdc: line after START must be BOOTSTRAP_PREAMBLE verbatim`,
    );
  }
});

test('Test 3: degradation block injected for browser/MCP-needing commands (atlas-explore-ui.mdc contains canonical prose)', async () => {
  const exploreUiPath = path.join(ADAPTER_DIR, 'atlas-explore-ui.mdc');
  const text = await readFile(exploreUiPath, 'utf8');
  // Canonical degradation prose markers (from _capability-degradation.js).
  assert.match(
    text,
    /## Capability Degradation/,
    'atlas-explore-ui.mdc must contain "## Capability Degradation" heading',
  );
  assert.match(
    text,
    /Do NOT fabricate/,
    'atlas-explore-ui.mdc must contain "Do NOT fabricate" canonical phrase',
  );
  assert.match(text, /needs-validation/, 'atlas-explore-ui.mdc must reference "needs-validation"');
  // explore-ui requires `browser` + `MCP` — both are missing in cursor's caps.
  assert.match(text, /`browser`/, 'atlas-explore-ui.mdc must mention missing `browser` capability');
  assert.match(text, /`MCP`/, 'atlas-explore-ui.mdc must mention missing `MCP` capability');
});

test('Test 4: README.md exists with required sections', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'cursor', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'flat-MDC', 'Regeneration']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section/topic: ${heading}`);
  }
  assert.match(text, /\.cursor\/rules/, 'README must reference .cursor/rules path');
});
