// test/schemas/manifest-schema-reports-field.test.js
//
// Quick 260506-dyb Gap 4 — workspace-manifest.schema.json must permit
// counts.reports (integer ≥ 0). The /atlas:report command spec instructs
// "increment counts.reports", but the schema's counts block was
// additionalProperties:false with reports absent. Impossible without the
// schema change.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const SCHEMA_ID = 'https://testatlas.dev/schemas/v1/workspace-manifest.schema.json';

function baseManifest(extra = {}) {
  return {
    $schema: SCHEMA_ID,
    suite: 'TestAtlas',
    workspaceVersion: '1',
    workspaceDir: '_testatlas',
    initializedAt: '2026-05-06T00:00:00Z',
    lastUpdatedAt: '2026-05-06T00:00:00Z',
    project: { name: 'x' },
    counts: {
      domains: 0,
      flows: 0,
      issues: 0,
      evidenceRecords: 0,
      testRuns: 0,
      ...extra,
    },
    latestReport: null,
    status: 'initialized',
  };
}

test('Gap 4: counts.reports is permitted (additionalProperties:false includes reports)', async () => {
  const ajv = await loadAllSchemas({});
  const validator = ajv.getSchema(SCHEMA_ID);
  assert.ok(validator, 'workspace-manifest.schema.json must load');

  // Without reports — still valid (additive non-breaking).
  assert.equal(validator(baseManifest()), true, JSON.stringify(validator.errors));

  // With reports = 0 — valid.
  assert.equal(validator(baseManifest({ reports: 0 })), true, JSON.stringify(validator.errors));

  // With reports = 5 — valid.
  assert.equal(validator(baseManifest({ reports: 5 })), true, JSON.stringify(validator.errors));
});

test('Gap 4: counts.reports rejects negative integer', async () => {
  const ajv = await loadAllSchemas({});
  const validator = ajv.getSchema(SCHEMA_ID);
  assert.equal(validator(baseManifest({ reports: -1 })), false);
});

test('Gap 4: counts.reports rejects non-integer', async () => {
  const ajv = await loadAllSchemas({});
  const validator = ajv.getSchema(SCHEMA_ID);
  assert.equal(validator(baseManifest({ reports: 'one' })), false);
  assert.equal(validator(baseManifest({ reports: 1.5 })), false);
});
