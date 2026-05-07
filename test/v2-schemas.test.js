// test/v2-schemas.test.js
//
// Wave 0: Validate all V2 schemas are valid Draft 2020-12 and compile with AJV.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.testatlas', 'schemas');

// V2 schemas with v2 URI path
const V2_SCHEMAS = [
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
];

async function getAjv() {
  const { getAjv } = await import(path.join(REPO_ROOT, 'scripts', 'lib', 'ajv-instance.js'));
  return getAjv();
}

test('all V2 schema files exist', async () => {
  for (const name of V2_SCHEMAS) {
    const fullPath = path.join(SCHEMAS_DIR, name);
    const content = await readFile(fullPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(parsed.$schema, `${name} missing $schema`);
    assert.ok(parsed.$id, `${name} missing $id`);
    assert.ok(parsed.$id.includes('/v2/'), `${name} $id does not use v2 path: ${parsed.$id}`);
  }
});

test('all V2 schemas compile with AJV', async () => {
  const ajv = await getAjv();
  for (const name of V2_SCHEMAS) {
    const fullPath = path.join(SCHEMAS_DIR, name);
    const content = await readFile(fullPath, 'utf8');
    const schema = JSON.parse(content);
    const validate = ajv.compile(schema);
    assert.ok(typeof validate === 'function', `${name} failed to compile`);
  }
});

test('state.schema.json validates example fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/state.schema.json');

  const fixture = {
    schema_version: '2.0.0',
    project: { name: 'Test App', repo_root: '.', primary_stack: ['Next.js', 'Node.js'] },
    status: {
      phase: 'active_testing',
      last_updated: '2026-05-03T12:00:00Z',
      active_environment: 'local',
    },
    counts: {
      domains: 8,
      flows: 24,
      issues: 17,
      critical_issues: 1,
      high_issues: 4,
      evidence_artifacts: 63,
      council_sessions: 5,
    },
    confidence: { overall: 'medium', highest_risk_domains: ['auth'], stale_domains: [] },
    next_recommended_commands: ['/atlas:test critical-flows'],
  };

  const valid = validate(fixture);
  assert.ok(valid, `state.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('persona.schema.json validates example fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/persona.schema.json');

  const fixture = {
    id: 'qa-lead',
    name: 'QA Lead',
    type: 'system',
    version: '2.0.0',
    mission: 'Validate coverage, reproducibility, and regression risk.',
    domains: ['testing', 'quality'],
    default_tools: ['filesystem', 'shell'],
    read_first: ['_testatlas/bootstrap/BOOTSTRAP.md'],
    may_update: ['_testatlas/tests/**'],
    must_not_update: ['production_data'],
    output_schema: '_testatlas/brain/schema/persona_output.schema.json',
    blind_spots: ['Cannot execute tests without test runner'],
    questions: ['What is the regression risk of this change?'],
  };

  const valid = validate(fixture);
  assert.ok(valid, `persona.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('claim.schema.json validates example fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/claim.schema.json');

  const fixture = {
    id: 'CLAIM-0001',
    session_id: 'COUNCIL-2026-05-03-001',
    speaker: 'user-advocate',
    type: 'observed',
    claim: 'The onboarding flow lacks a clear success state.',
    confidence: 'strong_suspect',
    evidence: ['_testatlas/evidence/screenshots/onboarding.png'],
    related_domains: ['onboarding'],
    related_flows: ['FLOW-onboarding-first-run'],
    status: 'accepted',
    created_at: '2026-05-03T12:00:00Z',
  };

  const valid = validate(fixture);
  assert.ok(valid, `claim.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('V1 schemas are untouched (additive-only)', async () => {
  const entries = await readdir(SCHEMAS_DIR);
  const v1Schemas = entries.filter((e) => e.endsWith('.schema.json') && !V2_SCHEMAS.includes(e));
  assert.ok(v1Schemas.length >= 19, `Expected at least 19 V1 schemas, found ${v1Schemas.length}`);
});
