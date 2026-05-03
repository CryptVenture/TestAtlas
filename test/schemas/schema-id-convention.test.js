// test/schemas/schema-id-convention.test.js
//
// TPL-02: every schema has $id matching the v1 namespace, $schema set to
// Draft 2020-12, a non-empty title, and the $id stem matches the filename.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const SCHEMA_DIR = path.join(repoRoot, '.testatlas/schemas');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

const ID_RE = /^https:\/\/testatlas\.dev\/schemas\/v1\/[a-z][a-z0-9-]*\.schema\.json$/;
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

test('TPL-02: every schema has $id, $schema (Draft 2020-12), title', async () => {
  const entries = await readdir(SCHEMA_DIR);
  const files = entries.filter((n) => n.endsWith('.schema.json'));
  assert.ok(files.length >= 1, 'no schemas found in .testatlas/schemas/');
  for (const file of files) {
    const schema = await readJson(path.join(SCHEMA_DIR, file));
    assert.ok(schema.$id, `${file}: missing $id`);
    assert.match(schema.$id, ID_RE, `${file}: $id "${schema.$id}" does not match v1 convention`);
    assert.equal(schema.$schema, DRAFT_2020_12, `${file}: $schema must be Draft 2020-12`);
    assert.ok(
      typeof schema.title === 'string' && schema.title.length > 0,
      `${file}: title must be a non-empty string`,
    );
  }
});

test('TPL-02: $id stem matches filename', async () => {
  const entries = await readdir(SCHEMA_DIR);
  const files = entries.filter((n) => n.endsWith('.schema.json'));
  for (const file of files) {
    const schema = await readJson(path.join(SCHEMA_DIR, file));
    const expectedSuffix = `/${file}`;
    assert.ok(
      schema.$id.endsWith(expectedSuffix),
      `${file}: $id "${schema.$id}" must end with "${expectedSuffix}"`,
    );
  }
});
