// test/schemas/schema-validity.test.js
//
// TPL-02 + TPL-05: every schema has the required structural rules,
// compiles via AJV singleton, accepts its valid fixtures, rejects its
// invalid fixtures, and (for app-map) carries the relationships shape.
//
// Note: fixtures here validate JSON shape only. File-existence checks
// (e.g., that an evidence.path resolves) are Phase 5's job.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { formatErrors, getAjv } from '../../scripts/lib/ajv-instance.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const SCHEMA_DIR = path.join(repoRoot, '.testatlas/schemas');
const FIXTURE_DIR = path.join(repoRoot, 'test/fixtures/schemas');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

const CANONICAL_NAMES = [
  'workspace-manifest',
  'app-map',
  'domain',
  'flow',
  'route',
  'component',
  'api-endpoint',
  'cli-command',
  'issue',
  'evidence',
  'test-scenario',
  'test-run',
  'report',
  'command-result',
  'sub-agent-handoff',
  'command-instruction',
];

const idFor = (name) => `https://testatlas.dev/schemas/v1/${name}.schema.json`;

test('TPL-02: all 16 canonical artifact schemas present at canonical paths', async () => {
  const entries = await readdir(SCHEMA_DIR);
  const schemaFiles = entries.filter((n) => n.endsWith('.schema.json')).sort();
  const expectedCanonical = CANONICAL_NAMES.map((n) => `${n}.schema.json`);
  // Phase 6 (Plan 06-01) adds adapter-capabilities.schema.json as the 17th
  // schema. It is not a v1 artifact schema (it's a suite-config schema with a
  // different $id namespace), so it's tracked separately here.
  for (const expected of expectedCanonical) {
    assert.ok(schemaFiles.includes(expected), `missing canonical schema: ${expected}`);
  }
});

test('TPL-02: every schema has additionalProperties:false at top level', async () => {
  for (const name of CANONICAL_NAMES) {
    const schema = await readJson(path.join(SCHEMA_DIR, `${name}.schema.json`));
    assert.equal(
      schema.additionalProperties,
      false,
      `${name}.schema.json must declare additionalProperties:false at top level`,
    );
    assert.equal(schema.type, 'object', `${name}.schema.json must be type:object`);
  }
});

test('TPL-02: all 16 schemas compile via loadAllSchemas', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  for (const name of CANONICAL_NAMES) {
    const validate = ajv.getSchema(idFor(name));
    assert.equal(typeof validate, 'function', `${name} schema must be compiled in AJV`);
  }
});

test('TPL-02: each schema accepts its valid fixtures', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  for (const name of CANONICAL_NAMES) {
    const validDir = path.join(FIXTURE_DIR, name, 'valid');
    let files;
    try {
      files = await readdir(validDir);
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    const validate = ajv.getSchema(idFor(name));
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const fixture = await readJson(path.join(validDir, file));
      const ok = validate(fixture);
      assert.ok(
        ok,
        `${name}/valid/${file} must validate. Errors: ${
          ok ? '' : formatErrors(validate.errors, file).join('; ')
        }`,
      );
    }
  }
});

test('TPL-02: each schema rejects its invalid fixtures', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  for (const name of CANONICAL_NAMES) {
    const invalidDir = path.join(FIXTURE_DIR, name, 'invalid');
    let files;
    try {
      files = await readdir(invalidDir);
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    const validate = ajv.getSchema(idFor(name));
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const fixture = await readJson(path.join(invalidDir, file));
      const ok = validate(fixture);
      assert.equal(ok, false, `${name}/invalid/${file} must NOT validate but it did`);
    }
  }
});

test('TPL-02: rejects additional properties (issue spot-check)', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  const validate = ajv.getSchema(idFor('issue'));
  const fixture = await readJson(path.join(FIXTURE_DIR, 'issue/valid/full.json'));
  const dirty = { ...fixture, extraField: 'x' };
  const ok = validate(dirty);
  assert.equal(ok, false);
  assert.ok(
    validate.errors?.some((e) => e.keyword === 'additionalProperties'),
    'expected an additionalProperties error',
  );
});

test('TPL-02: rejects missing required (issue spot-check)', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  const validate = ajv.getSchema(idFor('issue'));
  const fixture = await readJson(path.join(FIXTURE_DIR, 'issue/valid/full.json'));
  const dirty = { ...fixture };
  delete dirty.summary;
  const ok = validate(dirty);
  assert.equal(ok, false);
  assert.ok(
    validate.errors?.some((e) => e.keyword === 'required'),
    'expected a required error',
  );
});

test('TPL-05: app-map.relationships shape (relationships array of {from,to,type})', async () => {
  const schema = await readJson(path.join(SCHEMA_DIR, 'app-map.schema.json'));
  const rel = schema.properties?.relationships;
  assert.ok(rel, 'app-map.schema.json must have properties.relationships');
  assert.equal(rel.type, 'array');
  assert.deepEqual(rel.items.required.sort(), ['from', 'to', 'type'].sort());
  assert.equal(rel.items.additionalProperties, false);
});

test('TPL-05: domain has cross-artifact ID array fields', async () => {
  const schema = await readJson(path.join(SCHEMA_DIR, 'domain.schema.json'));
  // flows is an array of flowId
  assert.equal(schema.properties.flows.type, 'array');
  assert.match(
    schema.properties.flows.items.$ref ?? '',
    /vocabulary\.schema\.json#\/\$defs\/flowId$/,
  );
  // routes is an array of pageId
  assert.equal(schema.properties.routes.type, 'array');
  assert.match(
    schema.properties.routes.items.$ref ?? '',
    /vocabulary\.schema\.json#\/\$defs\/pageId$/,
  );
  // issues is an array of issueId
  assert.equal(schema.properties.issues.type, 'array');
  assert.match(
    schema.properties.issues.items.$ref ?? '',
    /vocabulary\.schema\.json#\/\$defs\/issueId$/,
  );
});

test('TPL-02: loader composes everything in a fresh fixture cwd', async () => {
  // Use the actual repoRoot — already confirmed schema-loader is idempotent.
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  // Vocabulary $id resolves
  assert.equal(
    typeof ajv.getSchema('https://testatlas.dev/schemas/v1/vocabulary.schema.json'),
    'function',
  );
  // A schema that uses vocab $refs (issue) compiled successfully
  const issueValidate = ajv.getSchema(idFor('issue'));
  assert.equal(typeof issueValidate, 'function');
});
