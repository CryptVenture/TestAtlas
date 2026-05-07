// test/commands/frontmatter-walkthrough-description.test.js
//
// Phase 13 / Plan 13-08 — Frontmatter description sweep regression guard.
//
// The MCP-adapter manifest carries ONLY the frontmatter `description` field
// as user-visible content (per 13-RESEARCH.md §"Surprise to flag for planner",
// "Adapter Propagation Path"). Without the walkthrough mention in the
// description, MCP-manifest clients see stale promises that don't reflect the
// new mandatory walkthrough mandate.
//
// This test enforces:
//   1. Each of the 7 UI-touching commands' frontmatter `description` MUST
//      mention walkthrough discipline (matches /walkthrough|walk through|
//      every component|every state/i).
//   2. Each description stays under 400 chars (regression guard against bloat).
//   3. Non-UI-touching commands' descriptions MUST NOT carry the walkthrough
//      phrase (regression guard against leak into commands the discipline
//      doesn't apply to).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';
import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

const UI_TOUCHING = new Set([
  'explore-ui.md',
  'explore-accessibility.md',
  'explore-performance.md',
  'test-flow.md',
  'test-domain.md',
  'test-accessibility.md',
  'test-performance.md',
]);

const WALKTHROUGH_RE = /walkthrough|walk through|every component|every state/i;

test('UI-touching commands carry walkthrough mention in frontmatter description', async () => {
  const files = await listCommandFiles();
  const failures = [];
  for (const f of files) {
    const base = path.basename(f);
    if (!UI_TOUCHING.has(base)) continue;
    const text = await readFile(f, 'utf8');
    const frontmatter = parseFrontmatter(text);
    const desc = frontmatter.description || '';
    if (!WALKTHROUGH_RE.test(desc)) {
      failures.push(
        `${base}: description missing walkthrough mention. Current: "${desc.slice(0, 100)}..."`,
      );
    }
    if (desc.length > 400) {
      failures.push(`${base}: description over 400 chars (${desc.length})`);
    }
  }
  assert.deepEqual(failures, []);
});

test('Non-UI-touching commands MUST NOT carry walkthrough phrase in description', async () => {
  const files = await listCommandFiles();
  const violations = [];
  for (const f of files) {
    const base = path.basename(f);
    if (UI_TOUCHING.has(base)) continue;
    const text = await readFile(f, 'utf8');
    const frontmatter = parseFrontmatter(text);
    const desc = frontmatter.description || '';
    if (/walkthrough|walk through/i.test(desc)) {
      violations.push(`${base}: walkthrough leaked into non-UI description: "${desc}"`);
    }
  }
  assert.deepEqual(violations, []);
});
