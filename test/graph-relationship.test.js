// test/graph-relationship.test.js
//
// Plan 14-01 Task 3 — relationship schema for the brain graph.
//
// PRD §11.2 enumerates 16 relationship types. This test verifies they are all
// declared in `_testatlas/brain/schema/relationship.schema.json`, the schema
// compiles, the existing `_testatlas/brain/graph.json` validates against it,
// and a synthetic graph with one of each relationship type validates.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Canonical schema source-of-truth lives in the suite tree (.testatlas/schemas/);
// install/init-workspace mirrors it to _testatlas/brain/schema/ in target repos.
// In this self-dogfood repo we read the suite copy directly.
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas', 'schemas', 'relationship.schema.json');
const GRAPH_PATH = path.join(REPO_ROOT, '_testatlas', 'brain', 'graph.json');

const PRD_RELATIONSHIP_TYPES = [
  'domain-contains-flow',
  'flow-touches-route',
  'flow-touches-component',
  'flow-calls-endpoint',
  'flow-depends-on-integration',
  'issue-affects-flow',
  'issue-affects-domain',
  'evidence-supports-issue',
  'evidence-supports-claim',
  'claim-originates-from-transcript',
  'decision-resolves-disagreement',
  'persona-participated-in-council',
  'story-defines-expected-behavior-for-flow',
  'test-scenario-validates-flow',
  'drift-invalidates-confidence',
  'risk-blocks-release',
];

async function getAjv() {
  const { loadAllSchemas } = await import(
    path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')
  );
  return loadAllSchemas({ cwd: REPO_ROOT });
}

test('Test 1: relationship.schema.json exists and is valid JSON', async () => {
  const text = await readFile(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(text);
  assert.ok(schema.$id, 'missing $id');
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
});

test('Test 2: relationship schema declares all 16 PRD §11.2 types', async () => {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  // Look for the enum somewhere within the schema (could be on
  // properties.type.enum or under $defs.relationshipType.enum).
  const text = JSON.stringify(schema);
  for (const t of PRD_RELATIONSHIP_TYPES) {
    assert.ok(text.includes(`"${t}"`), `relationship.schema.json missing type "${t}"`);
  }
});

test('Test 3: relationship schema compiles with AJV', async () => {
  const ajv = await getAjv();
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  if (!ajv.getSchema(schema.$id)) {
    const validate = ajv.compile(schema);
    assert.equal(typeof validate, 'function');
  } else {
    assert.equal(typeof ajv.getSchema(schema.$id), 'function');
  }
});

test('Test 4: existing _testatlas/brain/graph.json validates against relationship schema', async () => {
  const ajv = await getAjv();
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const graph = JSON.parse(await readFile(GRAPH_PATH, 'utf8'));
  const valid = validate(graph);
  assert.ok(valid, `graph.json fails relationship.schema.json: ${JSON.stringify(validate.errors)}`);
});

test('Test 5: synthetic graph with one edge of each relationship type validates', async () => {
  const ajv = await getAjv();
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const synthetic = {
    schema_version: '2.0.0',
    last_updated: '2026-05-07T00:00:00Z',
    nodes: [{ id: 'src' }, { id: 'tgt' }],
    edges: PRD_RELATIONSHIP_TYPES.map((type) => ({ source: 'src', target: 'tgt', type })),
  };
  const valid = validate(synthetic);
  assert.ok(valid, `synthetic graph invalid: ${JSON.stringify(validate.errors)}`);
});

test('Test 6: edge with unknown relationship type is rejected', async () => {
  const ajv = await getAjv();
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const bad = {
    schema_version: '2.0.0',
    last_updated: '2026-05-07T00:00:00Z',
    nodes: [{ id: 'a' }, { id: 'b' }],
    edges: [{ source: 'a', target: 'b', type: 'not-a-real-relationship' }],
  };
  const valid = validate(bad);
  assert.equal(valid, false, 'unknown relationship type must be rejected');
});
