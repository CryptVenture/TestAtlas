// test/adapter-aider.test.js
//
// Plan 06-04 Task 2: structural assertions on the SINGLE concatenated
// `.testatlas/adapters/aider/CONVENTIONS.md` plus `.aider.conf.yml` snippet.
//
// Aider's contract (06-RESEARCH.md §Q1.5 + Pitfall 5):
//   - ONE concatenated CONVENTIONS.md (NOT 31 files) with 31 H2 sections.
//   - Each H2 section ≤7 lines (heading + body); whole file ≤200 lines.
//   - Renderer hard-fails (throw) if any section exceeds 7 lines — this is
//     a build-time guardrail so future command-source growth doesn't silently
//     break Aider's prompt-cache budget.
//   - The body is wrapped in a SINGLE adapter envelope whose hash is
//     computed deterministically over the concatenation of all 31 source
//     hashes (so a change to ANY source command bumps the aggregate hash).
//   - Aider declares only [shell, file-write] — 13 of 31 commands need
//     browser/MCP/web-fetch which Aider lacks. Those sections embed a
//     condensed degradation note within the 7-line cap.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { renderAider } from '../scripts/lib/adapters/render-aider.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { listCommandFiles } from '../scripts/lib/list-command-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(repoRoot, '.testatlas', 'adapters', 'aider');
const CONVENTIONS_PATH = path.join(ADAPTER_DIR, 'CONVENTIONS.md');
const CONF_PATH = path.join(ADAPTER_DIR, '.aider.conf.yml');

test('Test 1: CONVENTIONS.md exists and total line count ≤ 210', async () => {
  const text = await readFile(CONVENTIONS_PATH, 'utf8');
  const lines = text.split('\n');
  assert.ok(lines.length <= 210, `CONVENTIONS.md must be ≤210 lines; got ${lines.length}`);
});

test('Test 2: 31 H2 sections matching source command set', async () => {
  const text = await readFile(CONVENTIONS_PATH, 'utf8');
  const headings = text
    .split('\n')
    .filter((l) => /^##\s+\/atlas-/.test(l))
    .map((l) => l.replace(/^##\s+\//, '').trim());
  assert.equal(headings.length, 31, `expected 31 H2 atlas-* headings; got ${headings.length}`);

  const sources = await listCommandFiles({ cwd: repoRoot });
  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}`));
  for (const h of headings) {
    assert.ok(expectedNames.has(h), `unexpected H2 section: /${h}`);
  }
  for (const name of expectedNames) {
    assert.ok(headings.includes(name), `missing H2 section: /${name}`);
  }
});

test('Test 3: each H2 section spans ≤ 7 lines (heading line through next-heading-or-EOF)', async () => {
  const text = await readFile(CONVENTIONS_PATH, 'utf8');
  const lines = text.split('\n');

  // Find all H2 atlas-* heading line indices in order.
  /** @type {number[]} */
  const headingIdxs = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\/atlas-/.test(lines[i])) headingIdxs.push(i);
  }

  // Find the line index of the END marker (or EOF) — sections after the last
  // heading run until the END marker, not literal EOF.
  let endIdx = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('TESTATLAS:GENERATED:END')) {
      endIdx = i;
      break;
    }
  }

  for (let h = 0; h < headingIdxs.length; h++) {
    const start = headingIdxs[h];
    const stop = h + 1 < headingIdxs.length ? headingIdxs[h + 1] : endIdx;
    const sectionLineCount = stop - start;
    const heading = lines[start];
    assert.ok(
      sectionLineCount <= 7,
      `${heading}: section spans ${sectionLineCount} lines (start=${start}, stop=${stop}); max 7`,
    );
  }
});

test('Test 4: capability-gap section (atlas-explore-ui) embeds degradation prose within 7-line cap', async () => {
  const text = await readFile(CONVENTIONS_PATH, 'utf8');
  // Pull out the explore-ui section.
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^##\s+\/atlas-explore-ui\b/.test(l));
  assert.ok(start !== -1, 'atlas-explore-ui H2 section must exist');
  // End at next H2 atlas-* heading (or EOF).
  let stop = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\/atlas-/.test(lines[i])) {
      stop = i;
      break;
    }
  }
  const section = lines.slice(start, stop).join('\n');
  assert.match(section, /Do NOT fabricate/, 'explore-ui section must contain "Do NOT fabricate"');
  assert.match(section, /needs-validation/, 'explore-ui section must reference "needs-validation"');
  // explore-ui's missing capabilities under aider [shell, file-write] are
  // browser + MCP. At minimum one of them must be named.
  assert.match(
    section,
    /browser|MCP/,
    'explore-ui section must reference at least one missing capability (browser/MCP)',
  );
});

test('Test 5: .aider.conf.yml exists; read[] contains bootstrap.md and CONVENTIONS.md', async () => {
  const text = await readFile(CONF_PATH, 'utf8');
  assert.match(text, /^read:/m, '.aider.conf.yml must declare a `read:` field');
  assert.match(
    text,
    /\.testatlas\/bootstrap\.md/,
    '.aider.conf.yml read[] must include .testatlas/bootstrap.md',
  );
  assert.match(text, /CONVENTIONS\.md/, '.aider.conf.yml read[] must include CONVENTIONS.md');
});

test('Test 6: single envelope wraps all sections; aggregate hash = hashContent(join(per-source hashes))', async () => {
  const text = await readFile(CONVENTIONS_PATH, 'utf8');
  const marker = parseAdapterMarker(text);
  assert.ok(marker, 'CONVENTIONS.md must contain a single adapter envelope');
  assert.equal(marker.section, 'adapter-body');
  assert.equal(marker.source, 'commands/_aggregate');

  // Recompute aggregate hash from per-source hashes (sorted order — same as
  // listCommandFiles).
  const sources = await listCommandFiles({ cwd: repoRoot });
  const perSource = await Promise.all(
    sources.map(async (sp) => hashContent(await readFile(sp, 'utf8'))),
  );
  const expected = hashContent(perSource.join(''));
  assert.equal(marker.hash, expected, 'aggregate hash mismatch');
});

test('Test 7: renderer hard-fails when any section would exceed 7 lines', async () => {
  // Synthesize a fake source whose description forces a >7-line H2 section.
  // The renderer must reject with an explicit error message.
  const fakeLongDescription = 'X'.repeat(2000); // far longer than any wrap threshold
  const fakeSource = `---
command: super-long
version: 1.0.0
description: ${fakeLongDescription}
capabilities: [shell, file-write, browser, MCP, web-fetch]
---

# super-long body
`;
  // Combine with an arbitrary set of real sources to keep the renderer doing
  // its full job; insert the synthetic one in the mix.
  const sources = [
    { sourcePath: '/fake/.testatlas/commands/super-long.md', sourceText: fakeSource },
  ];
  let threw = null;
  try {
    renderAider({ sources, adapterCaps: ['shell', 'file-write'] });
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'renderAider must throw when a section exceeds 7 lines');
  assert.match(
    threw.message,
    /super-long|max 7|7 lines/,
    `error must mention the offending command and the 7-line cap; got: ${threw.message}`,
  );
});

test('Test 8: README.md exists with required sections', async () => {
  const readmePath = path.join(ADAPTER_DIR, 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'degradation', 'one file', 'Regeneration']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section/topic: ${heading}`);
  }
  assert.match(text, /CONVENTIONS\.md/, 'README must reference CONVENTIONS.md');
});
