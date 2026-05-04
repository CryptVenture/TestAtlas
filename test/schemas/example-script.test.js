// test/schemas/example-script.test.js
//
// Plan 08-01 Task 2 — the 19th JSON Schema (example-script.schema.json).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const SCHEMA_ID = 'https://testatlas.dev/schemas/v1/example-script.schema.json';

async function getValidator() {
  const ajv = await loadAllSchemas({ cwd: process.cwd() });
  const v = ajv.getSchema(SCHEMA_ID);
  assert.ok(v, `example-script schema must be loadable at ${SCHEMA_ID}`);
  return v;
}

test('example-script schema: registered + compiles cleanly under AJV (Draft 2020-12)', async () => {
  await getValidator();
});

test('example-script schema: $id is the canonical URL', async () => {
  await getValidator();
  // Direct registry lookup confirms the $id we registered with.
  // Already implicit in getValidator() — adding an explicit assertion below.
  const ajv = await loadAllSchemas({ cwd: process.cwd() });
  const sch = ajv.getSchema(SCHEMA_ID);
  assert.ok(sch, 'must resolve by canonical $id');
});

test('example-script schema: minimal valid script passes', async () => {
  const v = await getValidator();
  const ok = v({
    exampleName: 'node-api',
    fixedTimestamp: '2026-05-03T00:00:00.000Z',
    steps: [{ id: 'init', command: 'init-workspace' }],
  });
  assert.ok(ok, `should validate; errors: ${JSON.stringify(v.errors)}`);
});

test('example-script schema: missing exampleName fails', async () => {
  const v = await getValidator();
  const ok = v({
    fixedTimestamp: '2026-05-03T00:00:00.000Z',
    steps: [{ id: 'init', command: 'init-workspace' }],
  });
  assert.equal(ok, false);
  const msg = (v.errors ?? []).map((e) => e.message).join(' | ');
  assert.match(msg, /required|exampleName/i);
});

test('example-script schema: invalid fixedTimestamp (not date-time) fails', async () => {
  const v = await getValidator();
  const ok = v({
    exampleName: 'node-api',
    fixedTimestamp: 'not-a-date',
    steps: [{ id: 'init', command: 'init-workspace' }],
  });
  assert.equal(ok, false);
});

test('example-script schema: unknown step.command (not in enum) fails', async () => {
  const v = await getValidator();
  const ok = v({
    exampleName: 'node-api',
    fixedTimestamp: '2026-05-03T00:00:00.000Z',
    steps: [{ id: 'init', command: 'rm-rf-everything' }],
  });
  assert.equal(ok, false);
});

test('example-script schema: exampleName must be kebab-slug', async () => {
  const v = await getValidator();
  const ok = v({
    exampleName: 'NodeAPI',
    fixedTimestamp: '2026-05-03T00:00:00.000Z',
    steps: [{ id: 'init', command: 'init-workspace' }],
  });
  assert.equal(ok, false);
});

test('example-script schema: empty steps array fails (minItems 1)', async () => {
  const v = await getValidator();
  const ok = v({
    exampleName: 'node-api',
    fixedTimestamp: '2026-05-03T00:00:00.000Z',
    steps: [],
  });
  assert.equal(ok, false);
});
