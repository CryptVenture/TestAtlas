// test/dashboard-schema.test.js
//
// Plan 14-08 Task 1 — Schema-shape coverage for dashboard_data.schema.json
// and the report-dashboard-data command instruction file.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

test('Test 1: dashboard_data.schema.json declares required PRD §16 fields', async () => {
  const schema = JSON.parse(
    await readFile(
      path.join(REPO_ROOT, '.testatlas', 'schemas', 'dashboard_data.schema.json'),
      'utf8',
    ),
  );
  assert.equal(schema.$id, 'https://testatlas.dev/schemas/v2/dashboard_data.schema.json');
  for (const f of [
    'schema_version',
    'generated_at',
    'project',
    'quality_summary',
    'domains',
    'issues_by_severity',
    'council_activity',
    'drift',
  ]) {
    assert.ok(schema.properties[f], `schema missing property: ${f}`);
  }
});

test('Test 2: report-dashboard-data command file exists with bootstrap preamble', async () => {
  const cmd = await readFile(
    path.join(REPO_ROOT, '.testatlas', 'commands', 'report', 'report-dashboard-data.md'),
    'utf8',
  );
  assert.match(cmd, /^---\n/, 'frontmatter present');
  assert.match(cmd, /command: report-dashboard-data/);
  assert.match(cmd, /\.testatlas\/bootstrap\.md/, 'bootstrap reference');
  assert.match(cmd, /generate-dashboard-data\.js/);
  assert.match(cmd, /dashboard-data\.json/);
});

test('Test 3: dashboard-data.json template scaffold exists and parses', async () => {
  const tpl = JSON.parse(
    await readFile(
      path.join(REPO_ROOT, '.testatlas', 'templates', 'reports', 'dashboard-data.json'),
      'utf8',
    ),
  );
  assert.equal(tpl.schema_version, '2.0.0');
  assert.ok(tpl.quality_summary);
  assert.ok(Array.isArray(tpl.domains));
});

test('Test 4: report-dashboard-data command stays under 1800 words', async () => {
  const cmd = await readFile(
    path.join(REPO_ROOT, '.testatlas', 'commands', 'report', 'report-dashboard-data.md'),
    'utf8',
  );
  const words = cmd.split(/\s+/).filter((w) => w.length > 0).length;
  assert.ok(words <= 1800, `command is ${words} words (>1800)`);
});
