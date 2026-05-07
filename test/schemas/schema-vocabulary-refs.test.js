// test/schemas/schema-vocabulary-refs.test.js
//
// TPL-04: vocabulary.json structure + AJV registration via schema-loader.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getAjv } from '../../scripts/lib/ajv-instance.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

const VOCAB_PATH = path.join(repoRoot, '.testatlas/vocabulary.json');
const VOCAB_ID = 'https://testatlas.dev/schemas/v1/vocabulary.schema.json';

// V1 vocabulary keys — must be present and stable.
const V1_REQUIRED_DEFS = [
  'capability',
  'severity',
  'confidence',
  'issueStatus',
  'issueType',
  'flowStatus',
  'domainStatus',
  'lowMedHighConfidence',
  'evidenceType',
  'testType',
  'testStatus',
  'manifestStatus',
  'isoTimestamp',
  'kebabSlug',
  'issueId',
  'evidenceId',
  'domainId',
  'flowId',
  'testId',
  'pageId',
  'apiId',
  'cliId',
  'componentId',
  'jobId',
  'integrationId',
  'personaId',
];

// V2 vocabulary keys — added by Plan 14-01 (Wave 1) per PRD §10.3.
const V2_REQUIRED_DEFS = [
  'claim_type',
  'council_type',
  'drift_status',
  'persona_type',
  'message_type',
  'disagreement_type',
  'vote_value',
];

const REQUIRED_DEFS = [...V1_REQUIRED_DEFS, ...V2_REQUIRED_DEFS];

test('TPL-04: vocabulary present at canonical path', async () => {
  const vocab = await readJson(VOCAB_PATH);
  assert.equal(vocab.$id, VOCAB_ID);
  assert.equal(vocab.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(vocab.$defs && typeof vocab.$defs === 'object', 'vocabulary must have $defs');
});

test('TPL-04: vocabulary structure has all required $defs entries', async () => {
  const vocab = await readJson(VOCAB_PATH);
  for (const key of REQUIRED_DEFS) {
    assert.ok(key in vocab.$defs, `vocabulary.json $defs missing key "${key}"`);
  }
  assert.equal(
    Object.keys(vocab.$defs).length,
    REQUIRED_DEFS.length,
    `vocabulary.json should have exactly ${REQUIRED_DEFS.length} $defs entries`,
  );
});

test('TPL-04: severity enum', async () => {
  const vocab = await readJson(VOCAB_PATH);
  assert.deepEqual(vocab.$defs.severity.enum, ['critical', 'high', 'medium', 'low', 'enhancement']);
});

test('TPL-04: confidence enum', async () => {
  const vocab = await readJson(VOCAB_PATH);
  assert.deepEqual(vocab.$defs.confidence.enum, [
    'confirmed',
    'strong-suspect',
    'needs-validation',
  ]);
});

test('TPL-04: vocabulary registers in AJV singleton via loadAllSchemas', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  const ajv = getAjv();
  assert.equal(typeof ajv.getSchema(VOCAB_ID), 'function');
});

test('TPL-04: loader is idempotent (second call does not throw)', async () => {
  await loadAllSchemas({ cwd: repoRoot });
  await loadAllSchemas({ cwd: repoRoot });
  // No throw = pass.
});
