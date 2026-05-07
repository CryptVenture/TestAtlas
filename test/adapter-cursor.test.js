// test/adapter-cursor.test.js
//
// Plan 06-04 Task 1: structural assertions on the 32 generated Cursor adapter
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
// Cursor's declared capabilities are [browser, shell, web-fetch, MCP, file-write]
// as of May 2026 (Cursor shipped MCP support in 2025). Cursor now covers all
// command-required capabilities; no degradation block is injected.

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
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'cursor', '.cursor', 'rules');

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.mdc file', async () => {
  // Phase 16 (Plan 16-01): cursor renders flat. Total = V1 flat + V2 categorized.
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.mdc' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.mdc'));
  assert.equal(
    derived.length,
    total,
    `expected ${total} derived .mdc files; got ${derived.length}`,
  );

  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each .mdc has locked frontmatter; envelope present; BOOTSTRAP_PREAMBLE after START', async () => {
  // Phase 16: walk every flat-root derived file (V1 flat + V2 categorized).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.mdc' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const sourceFm = parseFrontmatter(expected.sourceText);
    const derivedPath = path.join(ADAPTER_DIR, name);
    const derivedText = await readFile(derivedPath, 'utf8');

    // Locked frontmatter shape — order matters.
    assert.ok(derivedText.startsWith('---\n'), `${name}: missing frontmatter fence`);
    const fmEnd = derivedText.indexOf('\n---\n', 4);
    assert.ok(fmEnd !== -1, `${name}: missing closing frontmatter fence`);
    const fm = derivedText.slice(4, fmEnd);
    const fmLines = fm.split('\n');
    assert.equal(
      fmLines[0],
      `description: ${sourceFm.description}`,
      `${name}: description must be on first line`,
    );
    assert.equal(
      fmLines[1],
      'globs:',
      `${name}: second frontmatter line must be 'globs:' (empty value)`,
    );
    assert.equal(
      fmLines[2],
      'alwaysApply: false',
      `${name}: third frontmatter line must be 'alwaysApply: false'`,
    );

    // Marker envelope present and parseable.
    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(marker.hash, hashContent(expected.sourceText), `${name}: hash mismatch`);

    // Line immediately after START is BOOTSTRAP_PREAMBLE verbatim, with the
    // {{ADAPTER_COMMAND_PATH}} placeholder substituted (Quick 260507-hzw).
    const lines = derivedText.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `${name}: missing GENERATED:START marker line`);
    assert.equal(
      lines[startIdx + 1],
      expectedPreambleFor(`.cursor/rules/${name}`),
      `${name}: line after START must be substituted BOOTSTRAP_PREAMBLE verbatim`,
    );
  }
});

test('Test 3: no degradation block for commands cursor fully supports (atlas-explore-ui.mdc has no gap)', async () => {
  const exploreUiPath = path.join(ADAPTER_DIR, 'atlas-explore-ui.mdc');
  const text = await readFile(exploreUiPath, 'utf8');
  // Cursor now declares [browser, shell, web-fetch, MCP, file-write] — all
  // capabilities required by explore-ui. No degradation block is injected.
  assert.doesNotMatch(
    text,
    /## Capability Degradation/,
    'atlas-explore-ui.mdc must NOT contain "## Capability Degradation" since cursor has all required capabilities',
  );
});

test('Test 4: README.md exists with required sections', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'cursor', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'flat-MDC', 'Regeneration']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section/topic: ${heading}`);
  }
  assert.match(text, /\.cursor\/rules/, 'README must reference .cursor/rules path');
});
