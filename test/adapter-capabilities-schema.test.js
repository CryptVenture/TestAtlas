// test/adapter-capabilities-schema.test.js
//
// Validates the 17th JSON Schema (`adapter-capabilities.schema.json`) and the
// adapter-capabilities.json declaration that lists all 7 adapters TestAtlas
// ships in v1. Plan 06-01.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getAjv } from '../scripts/lib/ajv-instance.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SCHEMA_PATH = path.join(
  repoRoot,
  '.testatlas',
  'schemas',
  'adapter-capabilities.schema.json',
);
const CAPS_PATH = path.join(repoRoot, '.testatlas', 'adapters', 'adapter-capabilities.json');
const SCHEMAS_DIR = path.join(repoRoot, '.testatlas', 'schemas');

const SCHEMA_ID = 'https://testatlas.dev/schemas/adapter-capabilities.schema.json';
const EXPECTED_ADAPTERS = new Set([
  'claude-code',
  'generic',
  'opencode',
  'kilocode',
  'cursor',
  'aider',
  'mcp',
]);
const CAPABILITY_VOCAB = new Set(['browser', 'shell', 'web-fetch', 'MCP', 'file-write']);
const RENDER_STRATEGIES = new Set(['per-command-file', 'concatenated-conventions', 'mcp-server']);

test('Test 1: AJV compiles adapter-capabilities.schema.json (Draft 2020-12)', async () => {
  const text = await readFile(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(text);
  assert.equal(
    schema.$schema,
    'https://json-schema.org/draft/2020-12/schema',
    '$schema must be Draft 2020-12',
  );
  // Compile via a fresh AJV (avoid singleton collisions).
  const ajv = getAjv();
  // Ensure not already loaded (use addSchema; if already there, getSchema will hit it).
  if (!ajv.getSchema(schema.$id)) {
    ajv.addSchema(schema);
  }
  const validate = ajv.getSchema(schema.$id);
  assert.equal(typeof validate, 'function', 'getSchema should return validator');
});

test('Test 2: adapter-capabilities.json validates against schema', async () => {
  const ajv = await loadAllSchemas({ cwd: repoRoot });
  const validate = ajv.getSchema(SCHEMA_ID);
  assert.equal(typeof validate, 'function', 'schema-loader auto-discovered the 17th schema');
  const data = JSON.parse(await readFile(CAPS_PATH, 'utf8'));
  const ok = validate(data);
  assert.equal(
    ok,
    true,
    `adapter-capabilities.json must validate; errors: ${JSON.stringify(validate.errors, null, 2)}`,
  );
});

test('Test 3: declares EXACTLY 7 adapters with locked names', async () => {
  const data = JSON.parse(await readFile(CAPS_PATH, 'utf8'));
  const names = new Set(data.adapters.map((a) => a.name));
  assert.equal(names.size, 7, `expected 7 adapters; got ${names.size}`);
  for (const expected of EXPECTED_ADAPTERS) {
    assert.ok(names.has(expected), `missing adapter: ${expected}`);
  }
  for (const name of names) {
    assert.ok(EXPECTED_ADAPTERS.has(name), `unexpected adapter: ${name}`);
  }
});

test('Test 4: required fields + capability vocab + renderStrategy enum', async () => {
  const data = JSON.parse(await readFile(CAPS_PATH, 'utf8'));
  for (const a of data.adapters) {
    assert.ok(a.name, `${a.name}: missing name`);
    assert.ok(a.displayName, `${a.name}: missing displayName`);
    assert.ok(a.outputDir, `${a.name}: missing outputDir`);
    assert.ok(Array.isArray(a.capabilities), `${a.name}: capabilities must be array`);
    assert.ok(
      RENDER_STRATEGIES.has(a.renderStrategy),
      `${a.name}: bad renderStrategy ${a.renderStrategy}`,
    );
    for (const cap of a.capabilities) {
      assert.ok(CAPABILITY_VOCAB.has(cap), `${a.name}: bad capability ${cap}`);
    }
  }
});

test('Test 5: adapter capability sets per spec', async () => {
  const data = JSON.parse(await readFile(CAPS_PATH, 'utf8'));
  const byName = Object.fromEntries(data.adapters.map((a) => [a.name, a]));

  // claude-code: all 5 capabilities (canonical)
  const cc = byName['claude-code'].capabilities;
  assert.equal(cc.length, 5, 'claude-code declares all 5 capabilities');
  for (const cap of CAPABILITY_VOCAB) assert.ok(cc.includes(cap), `claude-code missing ${cap}`);

  // aider: [shell, file-write] only
  const aider = byName.aider.capabilities.slice().sort();
  assert.deepEqual(aider, ['file-write', 'shell']);

  // mcp: [shell, web-fetch, file-write]
  const mcp = byName.mcp.capabilities.slice().sort();
  assert.deepEqual(mcp, ['file-write', 'shell', 'web-fetch']);
});

test('Test 6: schema-loader auto-discovers schema #17 (and the 18th from Plan 07-01)', async () => {
  const entries = await readdir(SCHEMAS_DIR, { withFileTypes: true });
  const schemaFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.schema.json'))
    .map((e) => e.name);
  // Plan 06-01 added the 17th schema (adapter-capabilities). Plan 07-01 adds the
  // 18th (install-manifest). Future schema additions bump this count.
  assert.equal(
    schemaFiles.length,
    18,
    `expected 18 schemas after Plan 07-01; got ${schemaFiles.length}`,
  );
  // And loadAllSchemas registers the adapter-capabilities schema without error.
  const ajv = await loadAllSchemas({ cwd: repoRoot });
  assert.ok(ajv.getSchema(SCHEMA_ID), 'auto-discovered schema must be registered with AJV');
});
