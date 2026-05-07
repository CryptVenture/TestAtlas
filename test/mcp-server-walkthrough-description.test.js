// test/mcp-server-walkthrough-description.test.js
//
// Plan 13-09 Task 2: MCP-manifest description regression test.
//
// Phase 13 contract: the 7 UI-touching commands must declare a "mandatory
// when available" Chrome DevTools MCP walkthrough mandate in their
// frontmatter description. That description is propagated verbatim into the
// MCP manifest's `prompts[].description` field via render-mcp.js.
//
// MCP-aware clients (Claude Desktop, Cursor MCP, etc.) surface the prompt
// description in their picker UI. If a future change drops the walkthrough
// phrase, MCP users would see misleading prompt summaries. This test fails
// loudly when that happens.
//
// Symmetric guard: non-UI prompts (init, explore, plan, ...) MUST NOT mention
// walkthrough — preventing accidental leak through copy-paste edits.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'mcp',
  'mcp-server-manifest.json',
);

const UI_TOUCHING_PROMPTS = [
  'atlas-explore-ui',
  'atlas-explore-accessibility',
  'atlas-explore-performance',
  'atlas-test-flow',
  'atlas-test-domain',
  'atlas-test-accessibility',
  'atlas-test-performance',
];

async function loadManifest() {
  const text = await readFile(MANIFEST_PATH, 'utf8');
  return JSON.parse(text);
}

test('MCP manifest descriptions for UI-touching prompts mention walkthrough', async () => {
  const manifest = await loadManifest();
  const prompts = manifest.prompts || [];
  const failures = [];
  for (const name of UI_TOUCHING_PROMPTS) {
    const entry = prompts.find((p) => p.name === name);
    if (!entry) {
      failures.push(`${name}: prompt entry missing from manifest`);
      continue;
    }
    const desc = entry.description || '';
    if (!/walkthrough|walk through/i.test(desc)) {
      failures.push(
        `${name}: description missing walkthrough phrase. Current: "${desc.slice(0, 100)}..."`,
      );
    }
  }
  assert.deepEqual(failures, []);
});

test('MCP manifest descriptions for non-UI prompts MUST NOT mention walkthrough', async () => {
  const manifest = await loadManifest();
  const prompts = manifest.prompts || [];
  const violations = [];
  for (const entry of prompts) {
    if (UI_TOUCHING_PROMPTS.includes(entry.name)) continue;
    const desc = entry.description || '';
    if (/walkthrough|walk through/i.test(desc)) {
      violations.push(`${entry.name}: walkthrough leaked into non-UI prompt description`);
    }
  }
  assert.deepEqual(violations, []);
});
