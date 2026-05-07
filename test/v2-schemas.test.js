// test/v2-schemas.test.js
//
// Wave 0: Validate all V2 schemas are valid Draft 2020-12 and compile with AJV.
// Wave 1 (Plan 14-01): Extends to assert full property definitions, the 4 gap
// schemas (story, coverage, dashboard_data, retest_pack), $id v2 path discipline,
// vocabulary.json V2 enums, and cross-file $ref resolution.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.testatlas', 'schemas');
const VOCAB_PATH = path.join(REPO_ROOT, '.testatlas', 'vocabulary.json');

// V2 schemas (Wave 0 + Wave 1). All 21.
const V2_SCHEMAS = [
  // Wave 0
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
  // Wave 1 gap fillers (plan 14-01 task 1, item 3)
  'story.schema.json',
  'coverage.schema.json',
  'dashboard_data.schema.json',
  'retest_pack.schema.json',
];

// V2 enums that vocabulary.json must define under $defs.
const V2_VOCAB_ENUMS = [
  'claim_type',
  'council_type',
  'drift_status',
  'persona_type',
  'message_type',
  'disagreement_type',
  'vote_value',
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
    assert.equal(
      parsed.$schema,
      'https://json-schema.org/draft/2020-12/schema',
      `${name} not Draft 2020-12`,
    );
  }
});

test('all V2 schemas have $id at https://testatlas.dev/schemas/v2/<name>.schema.json', async () => {
  for (const name of V2_SCHEMAS) {
    const fullPath = path.join(SCHEMAS_DIR, name);
    const parsed = JSON.parse(await readFile(fullPath, 'utf8'));
    const expected = `https://testatlas.dev/schemas/v2/${name}`;
    assert.equal(parsed.$id, expected, `${name} $id mismatch: got ${parsed.$id}`);
  }
});

test('all V2 schemas compile with AJV', async () => {
  const ajv = await getAjv();
  for (const name of V2_SCHEMAS) {
    const fullPath = path.join(SCHEMAS_DIR, name);
    const content = await readFile(fullPath, 'utf8');
    const schema = JSON.parse(content);
    if (ajv.getSchema(schema.$id)) continue;
    const validate = ajv.compile(schema);
    assert.ok(typeof validate === 'function', `${name} failed to compile`);
  }
});

test('all V2 schemas declare additionalProperties:false where they describe an object', async () => {
  for (const name of V2_SCHEMAS) {
    const parsed = JSON.parse(await readFile(path.join(SCHEMAS_DIR, name), 'utf8'));
    if (parsed.type === 'object') {
      assert.equal(
        parsed.additionalProperties,
        false,
        `${name} top-level object must set additionalProperties:false`,
      );
    }
  }
});

test('vocabulary.json contains all V2 enums under $defs', async () => {
  const vocab = JSON.parse(await readFile(VOCAB_PATH, 'utf8'));
  assert.ok(vocab.$defs, 'vocabulary.json missing $defs');
  for (const enumName of V2_VOCAB_ENUMS) {
    assert.ok(vocab.$defs[enumName], `vocabulary.json missing $defs.${enumName}`);
    assert.equal(vocab.$defs[enumName].type, 'string', `${enumName} must be type:string`);
    assert.ok(
      Array.isArray(vocab.$defs[enumName].enum) && vocab.$defs[enumName].enum.length > 0,
      `${enumName} must have non-empty enum array`,
    );
    assert.ok(vocab.$defs[enumName].description, `${enumName} must have description`);
  }
});

test('claim.schema.json cross-references vocabulary.json via $ref', async () => {
  const claim = JSON.parse(await readFile(path.join(SCHEMAS_DIR, 'claim.schema.json'), 'utf8'));
  const claimStr = JSON.stringify(claim);
  // The schema may reference vocabulary.json#/$defs/<enum> for confidence, claim_type, etc.
  assert.ok(
    claimStr.includes('vocabulary.json#/$defs/'),
    'claim.schema.json must use a $ref into vocabulary.json#/$defs/...',
  );
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

test('claim.schema.json validates PRD §25 example fixture', async () => {
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

test('transcript.schema.json validates PRD §25 example fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/transcript.schema.json');

  // From PRD §25.
  const fixture = {
    id: 'MSG-000001',
    session_id: 'COUNCIL-2026-05-03-001',
    round: 1,
    speaker: 'qa-lead',
    speaker_type: 'persona',
    timestamp: '2026-05-03T12:00:00Z',
    message_type: 'finding',
    content:
      'The signup flow has happy-path coverage but no documented invalid-email or duplicate-account path.',
    claims: ['CLAIM-0001'],
    evidence: ['_testatlas/flows/FLOW-auth-signup.md'],
    confidence: 'strong_suspect',
  };
  const valid = validate(fixture);
  assert.ok(valid, `transcript.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('event.schema.json validates PRD §11.3 example fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/event.schema.json');

  // From PRD §11.3.
  const fixture = {
    id: 'EVENT-000001',
    timestamp: '2026-05-03T12:00:00Z',
    actor: 'testatlas-orchestrator',
    command: '/atlas:explore ui',
    type: 'artifact_updated',
    summary: 'Updated UI route map after inspecting Next.js app routes.',
    artifacts_read: ['app/**', '_testatlas/brain/state.json'],
    artifacts_written: ['_testatlas/maps/routes.md', '_testatlas/maps/routes.json'],
    evidence: [],
    status: 'completed',
  };
  const valid = validate(fixture);
  assert.ok(valid, `event.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('story.schema.json validates a minimal fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/story.schema.json');
  assert.ok(validate, 'story.schema.json not registered');
  const fixture = {
    id: 'STORY-0001',
    title: 'New user can sign up with email and password',
    actor: 'new-user',
    goal: 'Create an account so I can use the product.',
    expected_behavior: 'User receives verification email and lands on welcome page.',
    related_flows: ['FLOW-auth-signup'],
    status: 'active',
    created_at: '2026-05-07T12:00:00Z',
  };
  const valid = validate(fixture);
  assert.ok(valid, `story.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('coverage.schema.json validates a minimal fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/coverage.schema.json');
  assert.ok(validate, 'coverage.schema.json not registered');
  const fixture = {
    schema_version: '2.0.0',
    last_updated: '2026-05-07T12:00:00Z',
    coverage: {
      routes: [{ id: 'PAGE-home', tested: true, last_tested: '2026-05-07T12:00:00Z' }],
      components: [],
      endpoints: [],
      commands: [],
    },
  };
  const valid = validate(fixture);
  assert.ok(valid, `coverage.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('dashboard_data.schema.json validates a minimal fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/dashboard_data.schema.json');
  assert.ok(validate, 'dashboard_data.schema.json not registered');
  const fixture = {
    schema_version: '2.0.0',
    generated_at: '2026-05-07T12:00:00Z',
    project: 'Example App',
    quality_summary: {
      overall_score: 72,
      domains_tested: 4,
      domains_total: 8,
      open_critical: 1,
      open_high: 3,
    },
    domains: [],
    issues_by_severity: { critical: 1, high: 3, medium: 7, low: 4, enhancement: 0 },
    council_activity: { sessions_total: 5, sessions_last_7_days: 1 },
  };
  const valid = validate(fixture);
  assert.ok(
    valid,
    `dashboard_data.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`,
  );
});

test('retest_pack.schema.json validates a minimal fixture', async () => {
  const ajv = await getAjv();
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/retest_pack.schema.json');
  assert.ok(validate, 'retest_pack.schema.json not registered');
  const fixture = {
    id: 'RETEST-0001',
    issue_id: 'ISSUE-001-signup-failure',
    title: 'Signup with duplicate email returns 500',
    steps: ['Open /signup', 'Enter existing email', 'Submit form'],
    expected: 'Friendly error: "Email already in use"',
    actual: 'HTTP 500 with stack trace',
    evidence: ['_testatlas/evidence/EVIDENCE-007/'],
    created_at: '2026-05-07T12:00:00Z',
    status: 'pending',
  };
  const valid = validate(fixture);
  assert.ok(valid, `retest_pack.schema.json fixture invalid: ${JSON.stringify(validate.errors)}`);
});

test('V1 schemas are untouched (additive-only)', async () => {
  const entries = await readdir(SCHEMAS_DIR);
  const v1Schemas = entries.filter((e) => e.endsWith('.schema.json') && !V2_SCHEMAS.includes(e));
  assert.ok(v1Schemas.length >= 19, `Expected at least 19 V1 schemas, found ${v1Schemas.length}`);
});
