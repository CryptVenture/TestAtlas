// Tests for Phase 1 — BOOT-02 (24 sections), BOOT-03 (first-500 zone +
// anti-hallucination rule), BOOT-05 (capability vocab + degradation rule).
//
// Structural-only. LLM behavioral compliance is verified manually per
// .planning/phases/01-bootstrap-constitution-config-layer/01-VALIDATION.md.

import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const read = (relPath) => readFile(path.join(repoRoot, relPath), 'utf8');

const PRD_SECTIONS = [
  'Identity',
  'Workspace ownership',
  'Instruction precedence',
  'Safety',
  'Persistence',
  'Domain modeling',
  'Flow modeling',
  'Evidence rules',
  'Issue rules',
  'Severity vocabulary',
  'Confidence vocabulary',
  'Explorer standards',
  'Test standards',
  'UX standards',
  'Accessibility standards',
  'Performance standards',
  'Error standards',
  'Sub-agent rules',
  'Command lifecycle',
  'Status rules',
  'Index rules',
  'Retest rules',
  'Final-response rules',
  'Stop-condition rules',
];

// ---- BOOT-02: all 24 PRD §9 section headings present ----
test('BOOT-02: bootstrap.md contains all 24 PRD §9 section headings', async () => {
  const md = await read('.testatlas/bootstrap.md');
  for (let i = 0; i < PRD_SECTIONS.length; i += 1) {
    const n = i + 1;
    const name = PRD_SECTIONS[i];
    // Author may vary the wording slightly (e.g., "Workspace ownership" vs "Workspace
    // Ownership and Two-Tree Invariant"); require the leading word/phrase from PRD §9.
    const firstWord = name.split(/\s+/)[0];
    const headingRe = new RegExp(`^##\\s+${n}\\.\\s+${firstWord}`, 'mi');
    assert.match(md, headingRe, `bootstrap.md must include a "## ${n}. ${name}" section heading`);
  }
});

// ---- BOOT-02: 24 headings appear in strictly increasing PRD order ----
test('BOOT-02: section headings appear in PRD §9 order', async () => {
  const md = await read('.testatlas/bootstrap.md');
  const matches = [...md.matchAll(/^##\s+(\d+)\.\s+/gm)].map((m) => Number(m[1]));
  assert.equal(
    matches.length,
    24,
    `expected exactly 24 numbered ## headings, got ${matches.length}`,
  );
  assert.deepEqual(
    matches,
    [...Array(24).keys()].map((i) => i + 1),
    'numbered ## headings must appear in 1..24 order',
  );
});

// ---- BOOT-02: every reference/<file>.md link resolves ----
test('BOOT-02: all reference/<file>.md links in bootstrap point to real shards', async () => {
  const md = await read('.testatlas/bootstrap.md');
  const linkRe = /reference\/([a-z][\w-]*)\.md/g;
  const targets = new Set([...md.matchAll(linkRe)].map((m) => m[1]));
  assert.ok(targets.size > 0, 'bootstrap should link to at least one reference shard');
  for (const name of targets) {
    await assert.doesNotReject(
      access(path.join(repoRoot, '.testatlas/reference', `${name}.md`)),
      `bootstrap links to reference/${name}.md but the file does not exist`,
    );
  }
});

// ---- BOOT-03: first 500 words contain all seven load-bearing concepts ----
test('BOOT-03: first 500 words contain all six (+1) load-bearing rules', async () => {
  const md = await read('.testatlas/bootstrap.md');
  const first500 = md.trim().split(/\s+/).filter(Boolean).slice(0, 500).join(' ');
  const concepts = [
    { name: 'identity (TestAtlas)', pattern: /\bTestAtlas\b/i },
    { name: 'workspace ownership', pattern: /\b_testatlas\b|\bworkspace\b/i },
    { name: 'instruction precedence', pattern: /\bprecedence\b|\bconflict\b|\boverride\b/i },
    { name: 'safety', pattern: /\bsafe[ -]?mode\b|\bsafety\b|\bdestructive\b/i },
    {
      name: 'persistence',
      pattern: /\bpersist|\bephemeral\s+memory\b|\bmust\s+be\s+written\b/i,
    },
    {
      name: 'anti-hallucination ("no evidence" / "MUST cite")',
      pattern: /\bno\s+evidence\b|\bevidence-backed\b|\bMUST\s+cite\b/i,
    },
    {
      name: 'capability degradation',
      pattern: /\bcapabilit(y|ies)\b|\btool[\s_-]*unavailable\b|\bdegrade\b/i,
    },
  ];
  for (const { name, pattern } of concepts) {
    assert.match(first500, pattern, `first 500 words must mention ${name}`);
  }
});

// ---- BOOT-03: anti-hallucination rule wording ----
test('BOOT-03: anti-hallucination rule names "no evidence" + a MUST + evidence path', async () => {
  const md = await read('.testatlas/bootstrap.md');
  assert.match(md, /no\s+evidence/i, 'bootstrap must contain the literal phrase "no evidence"');
  assert.match(
    md,
    /MUST\s+cite|MUST\s+NOT\s+fabricate|MUST\s+(?:not\s+)?include\s+an?\s+evidence/i,
    'bootstrap must use a MUST/MUST NOT directive on evidence',
  );
  assert.match(
    md,
    /_testatlas\/evidence\//,
    'bootstrap must reference the canonical evidence directory `_testatlas/evidence/`',
  );
});

// ---- BOOT-05: capability vocabulary completeness ----
test('BOOT-05: bootstrap names all five capabilities with canonical spelling', async () => {
  const md = await read('.testatlas/bootstrap.md');
  // Canonical spellings for the multi-token / acronym capabilities; case-sensitive.
  for (const cap of ['web-fetch', 'MCP', 'file-write']) {
    assert.ok(md.includes(cap), `bootstrap must include the canonical capability name "${cap}"`);
  }
  // browser/shell — case-insensitive (more flexible authoring).
  for (const cap of ['browser', 'shell']) {
    assert.match(md, new RegExp(`\\b${cap}\\b`, 'i'), `bootstrap must mention capability "${cap}"`);
  }
});

// ---- BOOT-05: capability-degradation rule directives ----
test('BOOT-05: capability-degradation rule names MUST NOT fabricate, tool_unavailable, confidence: needs-validation', async () => {
  const md = await read('.testatlas/bootstrap.md');
  assert.match(md, /MUST\s+NOT\s+fabricate/, 'must contain literal "MUST NOT fabricate"');
  assert.match(md, /tool_unavailable/, 'must contain literal token "tool_unavailable"');
  assert.match(
    md,
    /confidence\s*:\s*needs-validation/,
    'must contain literal "confidence: needs-validation"',
  );
});

// ---- BOOT-04 forward-compat: word budget local signal ----
test('BOOT-04 (local signal): bootstrap.md ≤3000 words', async () => {
  const md = await read('.testatlas/bootstrap.md');
  const wc = md.trim().split(/\s+/).filter(Boolean).length;
  assert.ok(wc <= 3000, `bootstrap.md must be ≤3000 words (got ${wc})`);
});
