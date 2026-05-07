// test/v2-structure.test.js
//
// Wave 0: Verify V2 directory structure and skeleton files exist.

import { strict as assert } from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const REQUIRED_DIRS = [
  '_testatlas/bootstrap',
  '_testatlas/brain/schema',
  '_testatlas/agents/personas/system',
  '_testatlas/agents/personas/generated',
  '_testatlas/agents/personas/project',
  '_testatlas/agents/councils/council_templates',
  '_testatlas/agents/councils/sessions',
  '_testatlas/agents/councils/transcripts',
  '_testatlas/agents/councils/outputs',
  '_testatlas/agents/councils/consolidations',
  '_testatlas/agents/handoffs',
  '_testatlas/agents/outputs',
  '_testatlas/agents/scorecards',
  '_testatlas/maps',
  '_testatlas/stories',
  '_testatlas/tests/generated_automation',
  '_testatlas/tests/retest_packs',
  '.testatlas/templates/council',
  '.testatlas/templates/persona',
  '.testatlas/templates/reports',
  '.testatlas/commands/core',
  '.testatlas/commands/explore',
  '.testatlas/commands/test',
  '.testatlas/commands/council',
  '.testatlas/commands/brain',
  '.testatlas/commands/report',
  '.testatlas/commands/maintain',
];

const REQUIRED_FILES = [
  '_testatlas/bootstrap/BOOTSTRAP.md',
  '_testatlas/bootstrap/OPERATING_PRINCIPLES.md',
  '_testatlas/bootstrap/SOURCE_OF_TRUTH.md',
  '_testatlas/bootstrap/SAFETY.md',
  '_testatlas/bootstrap/COMMAND_LIFECYCLE.md',
  '_testatlas/bootstrap/PERSONA_PROTOCOL.md',
  '_testatlas/bootstrap/BRAIN_PROTOCOL.md',
  '_testatlas/brain/README.md',
  '_testatlas/agents/README.md',
  '_testatlas/agents/registry.json',
  '_testatlas/history/decisions.md',
  '_testatlas/history/changelog.md',
];

const BRAIN_FILES = [
  '_testatlas/brain/manifest.json',
  '_testatlas/brain/state.json',
  '_testatlas/brain/domains.json',
  '_testatlas/brain/flows.json',
  '_testatlas/brain/routes.json',
  '_testatlas/brain/components.json',
  '_testatlas/brain/commands.json',
  '_testatlas/brain/personas.json',
  '_testatlas/brain/issues.json',
  '_testatlas/brain/evidence.json',
  '_testatlas/brain/risks.json',
  '_testatlas/brain/assumptions.json',
  '_testatlas/brain/open_questions.json',
  '_testatlas/brain/decisions.json',
  '_testatlas/brain/coverage.json',
  '_testatlas/brain/quality_scores.json',
  '_testatlas/brain/agent_sessions.json',
  '_testatlas/brain/drift.json',
  '_testatlas/brain/claims.jsonl',
  '_testatlas/brain/observations.jsonl',
  '_testatlas/brain/events.jsonl',
  '_testatlas/brain/embeddings_manifest.json',
  '_testatlas/brain/graph.json',
];

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test('all required V2 directories exist', async () => {
  for (const dir of REQUIRED_DIRS) {
    const fullPath = path.join(REPO_ROOT, dir);
    const exists = await pathExists(fullPath);
    assert.ok(exists, `Directory missing: ${dir}`);
  }
});

test('all required bootstrap and README files exist', async () => {
  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(REPO_ROOT, file);
    const exists = await pathExists(fullPath);
    assert.ok(exists, `File missing: ${file}`);
  }
});

test('BOOTSTRAP.md is ≤3000 words', async () => {
  const text = await readFile(path.join(REPO_ROOT, '_testatlas/bootstrap/BOOTSTRAP.md'), 'utf8');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 3000, `BOOTSTRAP.md has ${words} words, exceeds 3000 limit`);
});

test('BOOTSTRAP.md contains load-bearing content in first 500 tokens', async () => {
  const text = await readFile(path.join(REPO_ROOT, '_testatlas/bootstrap/BOOTSTRAP.md'), 'utf8');
  const firstTokens = text.split(/\s+/).slice(0, 500).join(' ');
  assert.ok(
    firstTokens.includes('No evidence, no finding'),
    'Missing core principle in first 500 tokens',
  );
  assert.ok(
    firstTokens.includes('safety') || firstTokens.includes('Safety'),
    'Missing safety reference in first 500 tokens',
  );
  assert.ok(
    firstTokens.includes('bootstrap') || firstTokens.includes('Bootstrap'),
    'Missing bootstrap reference in first 500 tokens',
  );
});

test('all 22 brain files exist', async () => {
  for (const file of BRAIN_FILES) {
    const fullPath = path.join(REPO_ROOT, file);
    const exists = await pathExists(fullPath);
    assert.ok(exists, `Brain file missing: ${file}`);
  }
});

test('brain JSON files contain valid JSON', async () => {
  const jsonFiles = BRAIN_FILES.filter((f) => f.endsWith('.json'));
  for (const file of jsonFiles) {
    const fullPath = path.join(REPO_ROOT, file);
    const content = await readFile(fullPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(typeof parsed === 'object', `${file} is not a valid JSON object`);
  }
});

test('agents/registry.json is valid JSON', async () => {
  const content = await readFile(path.join(REPO_ROOT, '_testatlas/agents/registry.json'), 'utf8');
  const parsed = JSON.parse(content);
  assert.ok(typeof parsed === 'object', 'registry.json is not a valid JSON object');
  assert.ok(Array.isArray(parsed.personas), 'registry.json missing personas array');
});
