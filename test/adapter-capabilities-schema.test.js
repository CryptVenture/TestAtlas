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
  'codex',
  'gemini-cli',
  'cline',
  'windsurf',
  'kiro',
  'continue-dev',
  'github-copilot',
  'sourcegraph-amp',
  'roo-code',
  'zed',
  'amazon-q',
]);
// Plan 09-02 (locked) extended the capability vocabulary from 5 to 6 entries
// by adding "subagent-spawn". Phase 14 Wave 5 (V2) extends to 9 entries with
// council-orchestration, brain-sync, persona-context. The Set is the
// canonical vocab guard for the schema-validity loop below.
const CAPABILITY_VOCAB = new Set([
  'browser',
  'shell',
  'web-fetch',
  'MCP',
  'file-write',
  'subagent-spawn',
  'council-orchestration',
  'brain-sync',
  'persona-context',
]);
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
  // Plan 09-02: schema $refs vocabulary.json#/$defs/capability — must load
  // vocabulary first (loadAllSchemas registers it) for the $ref to resolve.
  const ajv = await loadAllSchemas({ cwd: repoRoot });
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

test('Test 3: declares the locked adapter set with no extras', async () => {
  const data = JSON.parse(await readFile(CAPS_PATH, 'utf8'));
  const names = new Set(data.adapters.map((a) => a.name));
  assert.equal(
    names.size,
    EXPECTED_ADAPTERS.size,
    `expected ${EXPECTED_ADAPTERS.size} adapters; got ${names.size}`,
  );
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

  // V2 (Phase 14 Wave 5): claude-code declares all 9 capabilities (canonical
  // V2 multi-agent host).
  const cc = byName['claude-code'].capabilities;
  assert.equal(cc.length, 9, `claude-code declares all 9 capabilities (V1 + V2); got ${cc.length}`);
  for (const cap of CAPABILITY_VOCAB) assert.ok(cc.includes(cap), `claude-code missing ${cap}`);

  // aider: V1 [shell, file-write] + V2 [brain-sync, persona-context].
  const aider = byName.aider.capabilities.slice().sort();
  assert.deepEqual(aider, ['brain-sync', 'file-write', 'persona-context', 'shell']);

  // mcp: V1 [browser, shell, web-fetch, MCP, file-write] + V2 [brain-sync, persona-context].
  const mcp = byName.mcp.capabilities.slice().sort();
  assert.deepEqual(mcp, [
    'MCP',
    'brain-sync',
    'browser',
    'file-write',
    'persona-context',
    'shell',
    'web-fetch',
  ]);
});

test('Test 6: schema-loader auto-discovers schema #17 (and the 18th from Plan 07-01, 19th from Plan 08-01)', async () => {
  const entries = await readdir(SCHEMAS_DIR, { withFileTypes: true });
  const schemaFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.schema.json'))
    .map((e) => e.name);
  // Plan 06-01 added the 17th schema (adapter-capabilities). Plan 07-01 added the
  // 18th (install-manifest). Plan 08-01 added the 19th (example-script).
  // Plan 08-02 added the 20th (matrix). Phase 14 (V2) adds many more
  // (persona, council_session, transcript, claim, decision, drift_record,
  // dashboard_data, sub-agent-handoff, retest_pack, quality_score, risk,
  // assumption, etc.). The schema set is open for additive growth — this
  // test asserts the floor (V1 baseline is 20) and that adapter-capabilities
  // is auto-registered.
  assert.ok(
    schemaFiles.length >= 20,
    `expected ≥20 schemas (V1 baseline); got ${schemaFiles.length}`,
  );
  assert.ok(
    schemaFiles.includes('adapter-capabilities.schema.json'),
    'adapter-capabilities.schema.json must be present',
  );
  // And loadAllSchemas registers the adapter-capabilities schema without error.
  const ajv = await loadAllSchemas({ cwd: repoRoot });
  assert.ok(ajv.getSchema(SCHEMA_ID), 'auto-discovered schema must be registered with AJV');
});
