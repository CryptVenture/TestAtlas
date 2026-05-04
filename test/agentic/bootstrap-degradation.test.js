// Wave 0 — Bucket #2: bootstrap.md must contain the subagent-spawn degradation
// rule (the "When subagent-spawn is unavailable, perform child tasks
// sequentially with executionMode: 'sequential-fallback'" clause from
// 09-CONTEXT.md), and must contain a per-host invocation table covering all
// 18 adapters with explicit subagent-spawn marking.
//
// Tests are intentionally LOCATION-AGNOSTIC. Plan 09-02 may land the rule
// under a new H2 (e.g. "## Capability Degradation") OR extend the existing
// "## Required Actions" section. The regexes match on substring presence and
// proximity, not on section numbering.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const BOOTSTRAP = path.join(REPO_ROOT, '.testatlas', 'commands', 'bootstrap.md');

// The 9 capable adapters with their canonical sub-agent invocation keyword
// (09-RESEARCH.md § Per-Host Sub-Agent Capability Matrix). Each adapter row
// in the per-host table must mention the adapter name AND the keyword.
const CAPABLE_INVOCATION = {
  'claude-code': /\b(Task|Agent)\b/,
  opencode: /\b(runner|subagent|sub-agent)\b/i,
  kilocode: /\b(subagent|sub-agent|workflow)\b/i,
  codex: /(@subagent|@sub-agent|sub-agent|subagent)/i,
  'gemini-cli': /(@agent|sub-agent|subagent)/i,
  'github-copilot': /(\/fleet|sub-agent|subagent)/i,
  cline: /\b(subagent|sub-agent|task)\b/i,
  kiro: /\b(subagent|sub-agent|spec|workflow)\b/i,
  'sourcegraph-amp': /\b(subagent|sub-agent|agent)\b/i,
};

// All 18 adapters — the per-host table is the single source of truth.
const ALL_18 = [
  'claude-code',
  'opencode',
  'kilocode',
  'codex',
  'gemini-cli',
  'github-copilot',
  'cline',
  'kiro',
  'sourcegraph-amp',
  'aider',
  'amazon-q',
  'continue-dev',
  'cursor',
  'generic',
  'mcp',
  'roo-code',
  'windsurf',
  'zed',
];

// Allowed marker tokens for the "subagent-spawn" cell in each table row.
const ROW_MARKER = /\b(yes|no|runtime-probe|sequential|false)\b/i;

test('bootstrap.md contains subagent-spawn degradation rule with sequential-fallback + executionMode markers', async () => {
  const text = await readFile(BOOTSTRAP, 'utf8');

  // The three literals must all appear AND be near each other (within ~4000
  // chars) so the test confirms a coherent rule, not three unrelated mentions.
  assert.match(
    text,
    /subagent-spawn[\s\S]{0,4000}sequential-fallback/,
    'bootstrap.md must mention "subagent-spawn" within ~4000 chars of "sequential-fallback"',
  );
  assert.match(
    text,
    /sequential-fallback[\s\S]{0,4000}executionMode|executionMode[\s\S]{0,4000}sequential-fallback/,
    'bootstrap.md must mention "executionMode" near "sequential-fallback"',
  );
  assert.match(
    text,
    /subagent-spawn[\s\S]{0,4000}executionMode|executionMode[\s\S]{0,4000}subagent-spawn/,
    'bootstrap.md must mention "executionMode" near "subagent-spawn"',
  );
});

test('bootstrap.md contains per-host invocation row for the 9 capable adapters', async () => {
  const text = await readFile(BOOTSTRAP, 'utf8');
  for (const [adapter, invocation] of Object.entries(CAPABLE_INVOCATION)) {
    assert.ok(
      text.includes(adapter),
      `bootstrap.md must mention adapter "${adapter}" in the per-host table`,
    );
    // Slice ~400 chars after the first occurrence of the adapter name to scan
    // the row for its canonical invocation keyword.
    const idx = text.indexOf(adapter);
    const slice = text.slice(idx, idx + 400);
    assert.match(
      slice,
      invocation,
      `bootstrap.md row for "${adapter}" must mention its invocation keyword (${invocation})`,
    );
  }
});

test('bootstrap.md per-host table covers all 18 adapters with explicit subagent-spawn marker', async () => {
  const text = await readFile(BOOTSTRAP, 'utf8');
  for (const adapter of ALL_18) {
    assert.ok(
      text.includes(adapter),
      `bootstrap.md must mention adapter "${adapter}" in the single-source-of-truth per-host table`,
    );
    const idx = text.indexOf(adapter);
    // Scan ~250 chars after the adapter name for one of the allowed marker tokens.
    const slice = text.slice(idx, idx + 250);
    assert.match(
      slice,
      ROW_MARKER,
      `bootstrap.md row for "${adapter}" must mark its subagent-spawn cell ` +
        '(allowed markers: yes / no / runtime-probe / sequential / false)',
    );
  }
});
