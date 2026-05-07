// test/council-modes.test.js
//
// Plan 14-04 Task 2 — verify all 11 V2 council command instruction files
// exist under .testatlas/commands/council/ and that all 9 PRD §7.9 conversation
// modes are represented. Each command must declare its mode and stay ≤1800 words.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { countWords } from '../scripts/lib/word-count.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const COUNCIL_DIR = path.join(REPO_ROOT, '.testatlas', 'commands', 'council');

const EXPECTED_COMMANDS = [
  'council',
  'council-domain-review',
  'council-flow-review',
  'council-product-review',
  'council-bug-triage',
  'council-release-readiness',
  'council-red-team',
  'council-brain-audit',
  'council-retest',
  'council-design-critique',
  'council-test-plan',
];

// PRD §7.9 — 9 conversation modes that must each have ≥1 mapped command.
const REQUIRED_MODES = [
  'roundtable-review',
  'debate',
  'red-team',
  'design-critique',
  'bug-triage',
  'test-plan',
  'retest',
  'brain-audit',
  'release-readiness',
];

const WORD_BUDGET = 1800;

test('Test 1: All 11 council commands exist as .md files', async () => {
  const entries = await readdir(COUNCIL_DIR);
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();
  assert.equal(mdFiles.length, 11, `expected 11 .md files, found ${mdFiles.length}`);
  for (const id of EXPECTED_COMMANDS) {
    assert.ok(mdFiles.includes(`${id}.md`), `missing council command: ${id}.md`);
  }
});

test('Test 2: Each council command stays under 1800 words', async () => {
  for (const id of EXPECTED_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    const wc = countWords(text);
    assert.ok(wc <= WORD_BUDGET, `${id}.md exceeds ${WORD_BUDGET} words (${wc})`);
  }
});

test('Test 3: All 9 PRD §7.9 conversation modes are represented', async () => {
  // Each mode must appear in at least one council command's frontmatter `mode:` field
  // OR in its body as the documented mode.
  const modeCoverage = new Set();
  for (const id of EXPECTED_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    for (const mode of REQUIRED_MODES) {
      if (text.toLowerCase().includes(mode)) modeCoverage.add(mode);
    }
  }
  for (const mode of REQUIRED_MODES) {
    assert.ok(
      modeCoverage.has(mode),
      `PRD §7.9 mode '${mode}' not represented in any council command`,
    );
  }
});

test('Test 4: council.md is the umbrella router referencing all 11 council commands', async () => {
  const text = await readFile(path.join(COUNCIL_DIR, 'council.md'), 'utf8');
  // Umbrella must reference the 10 sub-commands (excluding itself).
  for (const id of EXPECTED_COMMANDS) {
    if (id === 'council') continue;
    assert.match(text, new RegExp(`\\b${id}\\b`), `council.md missing reference to ${id}`);
  }
});

test('Test 5: Each council command carries bootstrap-first preamble + frontmatter', async () => {
  for (const id of EXPECTED_COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    assert.ok(text.startsWith('---\n'), `${id}.md missing YAML frontmatter`);
    assert.match(text, /Before doing anything else:/, `${id}.md missing preamble`);
    assert.match(text, /\.testatlas\/bootstrap\.md/, `${id}.md missing bootstrap reference`);
    assert.match(text, /capabilities:\s*\[/, `${id}.md missing capabilities frontmatter`);
  }
});

test('Test 6: Each council command declares its conversation mode in frontmatter', async () => {
  for (const id of EXPECTED_COMMANDS) {
    if (id === 'council') continue; // umbrella router doesn't pin a single mode
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    assert.match(text, /mode:\s*[a-z][\w-]*/, `${id}.md missing mode: declaration in frontmatter`);
  }
});
