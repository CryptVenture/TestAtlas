// test/install/install-manifest-schema.test.js
//
// Plan 07-01 Task 1 — Schema-level tests for the 18th JSON Schema:
// `.testatlas/schemas/install-manifest.schema.json`.
//
// Verifies:
//  - Schema loads via the existing `schema-loader.js` and AJV singleton compiles
//    it without error (Draft 2020-12 + ajv-formats already wired).
//  - Canonical $id, $schema, additionalProperties:false, required fields locked.
//  - A valid sample validates green.
//  - A manifest missing `files` fails with `keyword === 'required'`.
//  - Windows-style backslash paths fail the `^[^/].*` POSIX pattern.
//  - Forward-slash relative paths pass.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INSTALL_MANIFEST_SCHEMA_ID } from '../../scripts/lib/constants.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, '.testatlas/schemas/install-manifest.schema.json');

function validManifest(overrides = {}) {
  return {
    manifestVersion: '1',
    suiteVersion: '0.1.0-pre',
    schemaVersion: 1,
    installedAt: '2026-05-04T12:00:00.000Z',
    target: '/abs/target/path',
    adapters: ['claude-code', 'generic'],
    files: [
      {
        path: '.testatlas/bootstrap.md',
        source: '.testatlas/bootstrap.md',
        type: 'suite',
        hash: '0123456789abcdef',
      },
    ],
    ...overrides,
  };
}

test('install-manifest-schema: file exists and parses as JSON', async () => {
  const text = await readFile(SCHEMA_PATH, 'utf8');
  const parsed = JSON.parse(text);
  assert.equal(parsed.$id, INSTALL_MANIFEST_SCHEMA_ID);
  assert.equal(parsed.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(parsed.additionalProperties, false);
  assert.deepStrictEqual(parsed.required, [
    'manifestVersion',
    'suiteVersion',
    'schemaVersion',
    'installedAt',
    'target',
    'adapters',
    'files',
  ]);
  assert.equal(parsed.properties.manifestVersion.const, '1');
});

test('install-manifest-schema: AJV singleton compiles + registers via schema-loader', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  assert.ok(validate, 'install-manifest schema must be registered in AJV singleton');
});

test('install-manifest-schema: a valid sample manifest validates green', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  const ok = validate(validManifest());
  assert.equal(ok, true, `errors: ${JSON.stringify(validate.errors)}`);
});

test('install-manifest-schema: missing `files` fails with keyword=required', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  const { files: _omit, ...m } = validManifest();
  const ok = validate(m);
  assert.equal(ok, false, 'schema must reject manifest missing `files`');
  const required = validate.errors.find(
    (e) => e.keyword === 'required' && e.params?.missingProperty === 'files',
  );
  assert.ok(
    required,
    `expected required-error for "files"; got ${JSON.stringify(validate.errors)}`,
  );
  assert.equal(required.instancePath, '');
});

test('install-manifest-schema: Windows-backslash file path FAILS the POSIX pattern', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  const m = validManifest({
    files: [
      {
        path: 'C:\\Users\\foo\\file.md',
        source: '.testatlas/foo.md',
        type: 'suite',
        hash: '0123456789abcdef',
      },
    ],
  });
  const ok = validate(m);
  assert.equal(ok, false, 'Windows backslash path must be rejected');
  const patternErr = validate.errors.find(
    (e) => e.keyword === 'pattern' && e.instancePath.includes('files/0/path'),
  );
  assert.ok(
    patternErr,
    `expected pattern error on files/0/path; got ${JSON.stringify(validate.errors)}`,
  );
});

test('install-manifest-schema: forward-slash relative path passes', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  const m = validManifest({
    files: [
      {
        path: 'src/foo.ts',
        source: '.testatlas/src/foo.ts',
        type: 'suite',
        hash: '0123456789abcdef',
      },
    ],
  });
  const ok = validate(m);
  assert.equal(ok, true, `errors: ${JSON.stringify(validate.errors)}`);
});

test('install-manifest-schema: hash pattern requires 16-hex lowercase', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(INSTALL_MANIFEST_SCHEMA_ID);
  // Too short
  assert.equal(
    validate(
      validManifest({
        files: [{ path: 'a.md', source: 'a.md', type: 'suite', hash: 'abc123' }],
      }),
    ),
    false,
  );
  // Uppercase rejected
  assert.equal(
    validate(
      validManifest({
        files: [{ path: 'a.md', source: 'a.md', type: 'suite', hash: 'ABCDEF0123456789' }],
      }),
    ),
    false,
  );
});
