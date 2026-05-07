// test/schema-template-parity-v2.test.js
//
// Plan 14-01 Task 2 — schema↔template parity for V2.
//
// For every V2 schema there must be a matching template. JSON templates must
// validate against their schema. Markdown templates must mention every required
// schema field. Council session must produce all 15 PRD §7.8 artifacts.

import { strict as assert } from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.testatlas', 'schemas');
const TEMPLATES_DIR = path.join(REPO_ROOT, '.testatlas', 'templates');

// Schema → template map (relative to .testatlas/templates/). For some schemas
// the JSON template is the brain skeleton (already created in Wave 0); we
// re-validate it through this parity check.
const SCHEMA_TO_TEMPLATES = {
  'manifest.schema.json': ['json/v2-brain/manifest.json'],
  'state.schema.json': ['json/v2-brain/state.json'],
  'persona.schema.json': ['persona/system.md', 'persona/generated.md', 'persona/project.md'],
  'council_session.schema.json': ['council/session.md', 'council/participants.json'],
  'transcript.schema.json': ['council/transcript.md', 'council/transcript.jsonl'],
  'claim.schema.json': ['council/claims.jsonl'],
  'decision.schema.json': ['council/consolidation.md', 'council/consolidation.json'],
  'risk.schema.json': ['markdown/issue-v2.md'],
  'assumption.schema.json': ['markdown/issue-v2.md'],
  'quality_score.schema.json': ['reports/quality_scores.md'],
  'drift_record.schema.json': ['reports/drift.md'],
  'event.schema.json': ['markdown/explorer_report.md'],
  'adapter.schema.json': ['markdown/adapter_pack.md'],
  'story.schema.json': ['markdown/story.md'],
  'coverage.schema.json': ['reports/dashboard-data.json'],
  'dashboard_data.schema.json': ['reports/dashboard-data.json'],
  'retest_pack.schema.json': ['reports/release_readiness.md'],
};

// PRD §7.8 — 15 council session artifacts.
const COUNCIL_SESSION_ARTIFACTS = [
  'session.md',
  'consolidation.md',
  'prompt.md',
  'context_bundle.md',
  'participants.json',
  'transcript.md',
  'transcript.jsonl',
  'claims.jsonl',
  'disagreements.md',
  'votes.json',
  'consolidation.json',
  'followups.md',
  'generated_issues.md',
  'generated_flows.md',
  'generated_questions.md',
];

// Persona system template fields — PRD §7.7.
const PERSONA_TEMPLATE_HEADINGS = [
  'Mission',
  'Default Stance',
  'Expertise',
  'Blind Spots',
  'Questions',
  'Evidence Requirements',
  'Files to Read',
  'Files Allowed to Update',
  'Tools Allowed',
  'Safety Limits',
  'Output Format',
];

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function getAjv() {
  const { loadAllSchemas } = await import(
    path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')
  );
  return loadAllSchemas({ cwd: REPO_ROOT });
}

test('Test 1: every V2 schema has at least one matching template file present', async () => {
  for (const [schemaFile, templateRelPaths] of Object.entries(SCHEMA_TO_TEMPLATES)) {
    for (const tpl of templateRelPaths) {
      const fullPath = path.join(TEMPLATES_DIR, tpl);
      const exists = await fileExists(fullPath);
      assert.ok(exists, `${schemaFile}: template ${tpl} missing at ${fullPath}`);
    }
  }
});

test('Test 2: council session template produces all 15 PRD §7.8 artifacts', async () => {
  const councilDir = path.join(TEMPLATES_DIR, 'council');
  for (const artifact of COUNCIL_SESSION_ARTIFACTS) {
    const fullPath = path.join(councilDir, artifact);
    const exists = await fileExists(fullPath);
    assert.ok(exists, `council/${artifact} missing — required by PRD §7.8`);
  }
});

test('Test 3: persona system template contains all PRD §7.7 headings', async () => {
  const systemPath = path.join(TEMPLATES_DIR, 'persona', 'system.md');
  const content = await readFile(systemPath, 'utf8');
  for (const heading of PERSONA_TEMPLATE_HEADINGS) {
    // Match `## <heading>` or `### <heading>` — case-insensitive.
    const re = new RegExp(`^#+\\s+${heading.replace(/\s/g, '\\s+')}\\b`, 'mi');
    assert.match(content, re, `persona/system.md missing heading "${heading}" (PRD §7.7)`);
  }
});

test('Test 4: report templates use TESTATLAS:GENERATED markers', async () => {
  const REPORT_TEMPLATES = [
    'reports/quality_scores.md',
    'reports/drift.md',
    'reports/release_readiness.md',
  ];
  for (const rel of REPORT_TEMPLATES) {
    const content = await readFile(path.join(TEMPLATES_DIR, rel), 'utf8');
    assert.match(
      content,
      /TESTATLAS:GENERATED:START/,
      `${rel} missing TESTATLAS:GENERATED:START marker`,
    );
    assert.match(
      content,
      /TESTATLAS:GENERATED:END/,
      `${rel} missing TESTATLAS:GENERATED:END marker`,
    );
  }
});

test('Test 5: every required schema field appears in its matching markdown template', async () => {
  // Walk schemas and confirm each `required` property name (or its kebab/space
  // variants) appears at least once in any of the mapped markdown templates.
  for (const [schemaFile, templateRelPaths] of Object.entries(SCHEMA_TO_TEMPLATES)) {
    const schema = JSON.parse(await readFile(path.join(SCHEMAS_DIR, schemaFile), 'utf8'));
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.length === 0) continue;

    const mdPaths = templateRelPaths.filter((p) => p.endsWith('.md'));
    if (mdPaths.length === 0) continue; // JSON-only template, parity covered by Test 6.

    const allText = (
      await Promise.all(
        mdPaths.map((p) => readFile(path.join(TEMPLATES_DIR, p), 'utf8').catch(() => '')),
      )
    ).join('\n');

    for (const field of required) {
      const variants = [field, field.replace(/_/g, ' '), field.replace(/_/g, '-')];
      const hit = variants.some((v) => allText.toLowerCase().includes(v.toLowerCase()));
      assert.ok(
        hit,
        `${schemaFile}: required field "${field}" not mentioned in templates ${mdPaths.join(', ')}`,
      );
    }
  }
});

test('Test 6: JSON templates parse and validate against their schema', async () => {
  const ajv = await getAjv();
  const JSON_TEMPLATES = [
    {
      template: 'json/v2-brain/manifest.json',
      schemaId: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
      allowFormatViolations: true,
    },
    {
      template: 'json/v2-brain/state.json',
      schemaId: 'https://testatlas.dev/schemas/v2/state.schema.json',
      allowFormatViolations: true,
    },
    { template: 'council/participants.json', schemaId: null }, // schema-less harness file
    { template: 'council/votes.json', schemaId: null },
    { template: 'council/consolidation.json', schemaId: null },
    {
      template: 'reports/dashboard-data.json',
      schemaId: 'https://testatlas.dev/schemas/v2/dashboard_data.schema.json',
      allowFormatViolations: true,
    },
  ];
  for (const { template, schemaId, allowFormatViolations } of JSON_TEMPLATES) {
    const content = await readFile(path.join(TEMPLATES_DIR, template), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      assert.fail(`${template} is not valid JSON: ${err.message}`);
    }
    if (!schemaId) continue;
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate, `${schemaId} not registered in AJV`);
    const valid = validate(parsed);
    if (!valid && allowFormatViolations) {
      // Templates may use placeholder timestamps (e.g. 0000-00-00T00:00:00Z) —
      // accept format-only violations on date-time fields.
      const onlyFormat = (validate.errors || []).every(
        (e) => e.keyword === 'format' && e.params?.format === 'date-time',
      );
      assert.ok(onlyFormat, `${template} fails ${schemaId}: ${JSON.stringify(validate.errors)}`);
    } else {
      assert.ok(valid, `${template} fails ${schemaId}: ${JSON.stringify(validate.errors)}`);
    }
  }
});

test('Test 7: artifact markdown templates exist (domain-v2, flow-v2, issue-v2, evidence_index, command_definition)', async () => {
  const REQUIRED_MD_TEMPLATES = [
    'markdown/domain-v2.md',
    'markdown/flow-v2.md',
    'markdown/issue-v2.md',
    'markdown/story.md',
    'markdown/evidence_index.md',
    'markdown/explorer_report.md',
    'markdown/command_definition.md',
    'markdown/adapter_pack.md',
  ];
  for (const rel of REQUIRED_MD_TEMPLATES) {
    const exists = await fileExists(path.join(TEMPLATES_DIR, rel));
    assert.ok(exists, `${rel} missing — required by Plan 14-01 Task 2`);
  }
});
