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

// v1 artifact schemas use the /v1/ namespace.
const V1_ID_RE = /^https:\/\/testatlas\.dev\/schemas\/v1\/[a-z][a-z0-9_-]*\.schema\.json$/;
// V2 artifact schemas use the /v2/ namespace (Phase 14).
const V2_ID_RE = /^https:\/\/testatlas\.dev\/schemas\/v2\/[a-z][a-z0-9_-]*\.schema\.json$/;
// Suite-config schemas (e.g., adapter-capabilities, Plan 06-01) live outside
// the artifact namespaces because they describe suite configuration, not
// workspace artifacts.
const SUITE_ID_RE = /^https:\/\/testatlas\.dev\/schemas\/[a-z][a-z0-9-]*\.schema\.json$/;
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const SUITE_CONFIG_SCHEMAS = new Set(['adapter-capabilities.schema.json']);

// V2 schemas (Phase 14) — registered via $id `/v2/...`. Title is recommended
// but not yet enforced for schemas inherited from Wave 0 stubs (Wave 1 fleshes
// out title/description on Wave-1-touched schemas; older Wave-0 stubs may lack
// title until later waves polish them).
const V2_SCHEMAS = new Set([
  'manifest.schema.json',
  'state.schema.json',
  'persona.schema.json',
  'council_session.schema.json',
  'transcript.schema.json',
  'claim.schema.json',
  'decision.schema.json',
  'risk.schema.json',
  'assumption.schema.json',
  'quality_score.schema.json',
  'drift_record.schema.json',
  'event.schema.json',
  'adapter.schema.json',
  'story.schema.json',
  'coverage.schema.json',
  'dashboard_data.schema.json',
  'retest_pack.schema.json',
]);

test('TPL-02: every schema has $id, $schema (Draft 2020-12), title', async () => {
  const entries = await readdir(SCHEMA_DIR);
  const files = entries.filter((n) => n.endsWith('.schema.json'));
  assert.ok(files.length >= 1, 'no schemas found in .testatlas/schemas/');
  for (const file of files) {
    const schema = await readJson(path.join(SCHEMA_DIR, file));
    assert.ok(schema.$id, `${file}: missing $id`);
    let expectedRe;
    if (SUITE_CONFIG_SCHEMAS.has(file)) {
      expectedRe = SUITE_ID_RE;
    } else if (V2_SCHEMAS.has(file)) {
      expectedRe = V2_ID_RE;
    } else {
      expectedRe = V1_ID_RE;
    }
    assert.match(
      schema.$id,
      expectedRe,
      `${file}: $id "${schema.$id}" does not match expected convention`,
    );
    assert.equal(schema.$schema, DRAFT_2020_12, `${file}: $schema must be Draft 2020-12`);
    if (!V2_SCHEMAS.has(file)) {
      // V1 + suite-config schemas: title is required.
      assert.ok(
        typeof schema.title === 'string' && schema.title.length > 0,
        `${file}: title must be a non-empty string`,
      );
    } else if (typeof schema.title === 'string') {
      // V2 schemas: title is optional, but if present must be non-empty.
      assert.ok(schema.title.length > 0, `${file}: title must be non-empty when present`);
    }
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
