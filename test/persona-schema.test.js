// test/persona-schema.test.js
//
// Plan 14-04 Task 1 — verify all 14 V2 system personas:
//   1. Each persona has both .md and .json under .testatlas/agents/personas/system/.
//   2. Each persona JSON validates against persona.schema.json.
//   3. Each persona JSON includes: id, name, type ("system"), version, mission,
//      domains, default_tools, read_first, may_update, must_not_update,
//      output_schema, blind_spots, questions.
//   4. Each persona markdown contains all 12 PRD §7.7 sections.
//   5. registry.md lists all 14 personas (mission + domains).
//   6. md+json round-trip: id/name/type in markdown frontmatter agree with JSON.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PERSONAS_DIR = path.join(REPO_ROOT, '.testatlas', 'agents', 'personas', 'system');
const REGISTRY_MD = path.join(REPO_ROOT, '.testatlas', 'agents', 'registry.md');

const PERSONA_SCHEMA_ID = 'https://testatlas.dev/schemas/v2/persona.schema.json';

const EXPECTED_PERSONAS = [
  'product-strategist',
  'user-advocate',
  'qa-lead',
  'accessibility-reviewer',
  'performance-skeptic',
  'security-privacy-reviewer',
  'api-contract-analyst',
  'codebase-mapper',
  'runtime-investigator',
  'data-steward',
  'adversarial-red-team-tester',
  'documentation-curator',
  'automation-engineer',
  'release-readiness-judge',
];

// PRD §7.7 — required markdown sections.
const REQUIRED_MD_SECTIONS = [
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

// PRD §7.7 — required JSON fields beyond schema-required.
const REQUIRED_JSON_FIELDS = [
  'id',
  'name',
  'type',
  'version',
  'mission',
  'domains',
  'default_tools',
  'read_first',
  'may_update',
  'must_not_update',
  'output_schema',
  'blind_spots',
  'questions',
];

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fm[key] = value;
  }
  return fm;
}

test('Test 1: All 14 V2 system personas exist as md+json pairs', async () => {
  const entries = await readdir(PERSONAS_DIR);
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();
  const jsonFiles = entries.filter((f) => f.endsWith('.json')).sort();
  assert.equal(mdFiles.length, 14, `expected 14 .md files, found ${mdFiles.length}`);
  assert.equal(jsonFiles.length, 14, `expected 14 .json files, found ${jsonFiles.length}`);
  for (const id of EXPECTED_PERSONAS) {
    assert.ok(mdFiles.includes(`${id}.md`), `missing markdown for ${id}`);
    assert.ok(jsonFiles.includes(`${id}.json`), `missing json for ${id}`);
  }
});

test('Test 2: Each persona JSON validates against persona.schema.json', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema(PERSONA_SCHEMA_ID);
  assert.ok(validate, 'persona schema must be registered');
  for (const id of EXPECTED_PERSONAS) {
    const json = JSON.parse(await readFile(path.join(PERSONAS_DIR, `${id}.json`), 'utf8'));
    const ok = validate(json);
    assert.ok(ok, `${id}.json failed schema: ${JSON.stringify(validate.errors)}`);
  }
});

test('Test 3: Each persona JSON contains all 13 required PRD §7.7 fields', async () => {
  for (const id of EXPECTED_PERSONAS) {
    const json = JSON.parse(await readFile(path.join(PERSONAS_DIR, `${id}.json`), 'utf8'));
    for (const field of REQUIRED_JSON_FIELDS) {
      assert.ok(Object.hasOwn(json, field), `${id}.json missing field: ${field}`);
    }
    assert.equal(json.type, 'system', `${id}.json type must be 'system'`);
    assert.equal(json.id, id, `${id}.json id must match filename`);
    assert.ok(Array.isArray(json.domains), `${id}.json domains must be array`);
    assert.ok(Array.isArray(json.default_tools), `${id}.json default_tools must be array`);
    assert.ok(Array.isArray(json.read_first), `${id}.json read_first must be array`);
    assert.ok(Array.isArray(json.may_update), `${id}.json may_update must be array`);
    assert.ok(Array.isArray(json.must_not_update), `${id}.json must_not_update must be array`);
    assert.ok(Array.isArray(json.blind_spots) && json.blind_spots.length > 0);
    assert.ok(Array.isArray(json.questions) && json.questions.length > 0);
    assert.equal(typeof json.output_schema, 'string');
  }
});

test('Test 4: Each persona markdown contains all 11 PRD §7.7 sections', async () => {
  for (const id of EXPECTED_PERSONAS) {
    const text = await readFile(path.join(PERSONAS_DIR, `${id}.md`), 'utf8');
    for (const section of REQUIRED_MD_SECTIONS) {
      assert.match(
        text,
        new RegExp(`^##\\s+${section}\\b`, 'm'),
        `${id}.md missing section: ${section}`,
      );
    }
    // Frontmatter must declare type:system
    const fm = parseFrontmatter(text);
    assert.ok(fm, `${id}.md must have frontmatter`);
    assert.equal(fm.type, 'system', `${id}.md frontmatter.type must be 'system'`);
    assert.equal(fm.id, id, `${id}.md frontmatter.id must match filename`);
  }
});

test('Test 5: md+json round-trip — frontmatter id/name/type/version match JSON', async () => {
  for (const id of EXPECTED_PERSONAS) {
    const md = await readFile(path.join(PERSONAS_DIR, `${id}.md`), 'utf8');
    const json = JSON.parse(await readFile(path.join(PERSONAS_DIR, `${id}.json`), 'utf8'));
    const fm = parseFrontmatter(md);
    assert.equal(fm.id, json.id, `${id}: id mismatch`);
    assert.equal(fm.name, json.name, `${id}: name mismatch`);
    assert.equal(fm.type, json.type, `${id}: type mismatch`);
    assert.equal(fm.version, json.version, `${id}: version mismatch`);
  }
});

test('Test 6: registry.md lists all 14 personas with mission + domains', async () => {
  const text = await readFile(REGISTRY_MD, 'utf8');
  for (const id of EXPECTED_PERSONAS) {
    assert.match(text, new RegExp(`\\b${id}\\b`), `registry.md missing persona id: ${id}`);
  }
  // Registry must contain a table-style summary with at least Name, Mission, Domains columns.
  assert.match(text, /Mission/i);
  assert.match(text, /Domain/i);
  // Verify each persona JSON's mission line appears (or a reasonable fragment).
  for (const id of EXPECTED_PERSONAS) {
    const json = JSON.parse(await readFile(path.join(PERSONAS_DIR, `${id}.json`), 'utf8'));
    // Use first 20 chars of mission as fingerprint.
    const fragment = json.mission.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(text, new RegExp(fragment), `registry.md missing mission for ${id}`);
  }
});
