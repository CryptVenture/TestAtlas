// test/templates/schema-template-parity.test.js
//
// TPL-03: every required field in every JSON schema must appear in its matched
// markdown/JSON template. Parity failure = CI failure (Pitfall 2 drift gate).
//
// TPL-01 (orphan complement): every per-artifact template that is NOT mapped
// to a schema must satisfy a structural lower bound (1 H1, 3+ H2, >50 chars).
// This catches Plan 02-02's per-artifact orphans shipping as empty stubs.
//
// See .planning/phases/02-schemas-templates-workspace-skeleton/02-RESEARCH.md
// §"Schema/Template Parity Test Design" for the matching algorithm.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ----------------------------------------------------------------------------
// SCHEMA_TEMPLATE_MAPPING — 15 (schema, template) pairs. Single source of
// truth for the parity gate. Adding a schema MUST also add a mapping entry.
// ----------------------------------------------------------------------------
const SCHEMA_TEMPLATE_MAPPING = [
  {
    schemaId: 'https://testatlas.dev/schemas/v1/workspace-manifest.schema.json',
    templatePath: '.testatlas/templates/canonical/11_workspace_manifest.json',
    templateFormat: 'json',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/app-map.schema.json',
    templatePath: '.testatlas/templates/canonical/12_app_map.json',
    templateFormat: 'json',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/domain.schema.json',
    templatePath: '.testatlas/templates/domains/domain.json',
    templateFormat: 'json',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/flow.schema.json',
    templatePath: '.testatlas/templates/flows/flow.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/route.schema.json',
    templatePath: '.testatlas/templates/pages/page.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/component.schema.json',
    templatePath: '.testatlas/templates/components/component.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/api-endpoint.schema.json',
    templatePath: '.testatlas/templates/api/api-endpoint.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/cli-command.schema.json',
    templatePath: '.testatlas/templates/cli/cli-command.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/issue.schema.json',
    templatePath: '.testatlas/templates/issues/ISSUE.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/evidence.schema.json',
    templatePath: '.testatlas/templates/evidence/evidence_record.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/test-scenario.schema.json',
    templatePath: '.testatlas/templates/tests/scenario.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/test-run.schema.json',
    templatePath: '.testatlas/templates/tests/run.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/report.schema.json',
    templatePath: '.testatlas/templates/reports/REPORT.md',
    templateFormat: 'markdown',
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/command-result.schema.json',
    templatePath: '.testatlas/templates/canonical/10_command_log.md',
    templateFormat: 'markdown',
    // Plan 02-02 ships this template with the full 9-column header set
    // (Command | Invoked At | Completed At | Status | Outputs | Errors |
    //  Artifacts Created | Artifacts Updated | Manifest Updated). The
    //  table-column-header rule in templateHasField succeeds without any
    //  special-casing.
  },
  {
    schemaId: 'https://testatlas.dev/schemas/v1/sub-agent-handoff.schema.json',
    // Phase 17 Plan 17-05: relocated from templates/sub_agents/ to templates/handoffs/
    // matching the actual workspace write path used by commands/handoff.md
    // (_testatlas/handoffs/HANDOFF-<ts>.{md,json}). Sub-agents are a host-runtime
    // concept, not a workspace folder.
    templatePath: '.testatlas/templates/handoffs/HANDOFF.md',
    templateFormat: 'markdown',
  },
  {
    // 16th schema: validates the YAML frontmatter of every .testatlas/commands/*.md.
    // Plans 03-02/03-03 author the live command files; until then the parity gate
    // exercises its logic against the minimal-valid.md fixture, which carries all 8
    // required frontmatter keys.
    schemaId: 'https://testatlas.dev/schemas/v1/command-instruction.schema.json',
    templatePath: 'test/fixtures/commands/minimal-valid.md',
    templateFormat: 'markdown',
  },
];

// ----------------------------------------------------------------------------
// ORPHAN_TEMPLATES — per-artifact templates with no matching schema. They
// must clear a structural floor: ≥1 H1, ≥3 H2, >50 chars (TPL-01 supplement).
// reports/quality_scorecard_section.md is intentionally excluded — it's a
// snippet, not a full doc.
// ----------------------------------------------------------------------------
const ORPHAN_TEMPLATES = [
  '.testatlas/templates/stories/story.md',
  '.testatlas/templates/personas/persona.md',
  '.testatlas/templates/jobs/job.md',
  '.testatlas/templates/states/state.md',
  '.testatlas/templates/data/entity.md',
  '.testatlas/templates/integrations/integration.md',
  '.testatlas/templates/plans/PLAN-master.md',
  '.testatlas/templates/plans/PLAN-domain.md',
  '.testatlas/templates/domains/domain_overview.md',
  '.testatlas/templates/domains/routes_and_entrypoints.md',
  '.testatlas/templates/domains/ux_expectations.md',
  '.testatlas/templates/domains/states_and_rules.md',
  '.testatlas/templates/domains/dependencies.md',
  '.testatlas/templates/domains/data_contracts.md',
  '.testatlas/templates/domains/test_notes.md',
  '.testatlas/templates/domains/evidence_index.md',
  '.testatlas/templates/domains/open_questions.md',
  '.testatlas/templates/domains/issues_index.md',
  '.testatlas/templates/domains/coverage.md',
];

// ----------------------------------------------------------------------------
// EXCLUDED_FIELDS — required schema fields that the parity test does NOT
// expect to find as headings/keys/cells in templates. See
// 02-RESEARCH.md §"Schema/Template Parity Test Design".
// ----------------------------------------------------------------------------
const EXCLUDED_FIELDS = new Set(['id', 'slug', 'lastUpdatedAt', '$schema']);

function isExcluded(name) {
  if (EXCLUDED_FIELDS.has(name)) return true;
  // Internal hash fields (e.g., contentHash) are infrastructural, not content.
  if (/Hash$/.test(name)) return true;
  return false;
}

/**
 * Generate template-form candidate strings for a camelCase schema field.
 * Returns the camelCase form plus spaced/snake/kebab/title-case variants.
 * @param {string} name
 * @returns {string[]}
 */
export function fieldCandidates(name) {
  const spaced = name
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
  const snake = name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
  const kebab = name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
  const titleSpaced = spaced.replace(/\b\w/g, (c) => c.toUpperCase());
  return [name, spaced, snake, kebab, titleSpaced];
}

/** Lower-case + collapse separators (whitespace, _, -) to single space. */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/**
 * Return true iff `text` (markdown) contains `fieldName` as either:
 *   - a heading line (#..######) whose text is/starts-with/ends-with/contains the candidate
 *   - a YAML frontmatter key inside the leading `---` fence
 *   - a list-item key (`- key:` / `* key:`)
 *   - a table column header cell (between `|` separators)
 * Matching is case- and separator-insensitive.
 *
 * @param {string} text
 * @param {string} fieldName
 */
export function templateHasField(text, fieldName) {
  const candidates = fieldCandidates(fieldName).map(normalize);
  const lines = text.split(/\r?\n/);
  let frontmatterFences = 0;
  let inFrontmatter = false;
  for (const line of lines) {
    if (/^---\s*$/.test(line)) {
      frontmatterFences++;
      inFrontmatter = frontmatterFences === 1;
      continue;
    }
    // Markdown heading
    const hMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (hMatch) {
      const h = normalize(hMatch[1]);
      if (
        candidates.some(
          (c) => h === c || h.startsWith(`${c} `) || h.endsWith(` ${c}`) || h.includes(` ${c} `),
        )
      ) {
        return true;
      }
    }
    // YAML frontmatter key (only inside the leading --- fence)
    if (inFrontmatter) {
      const kMatch = line.match(/^([a-zA-Z_$][\w-]*)\s*:/);
      if (kMatch && candidates.includes(normalize(kMatch[1]))) return true;
    }
    // List-item key (e.g., `- expectedBehavior:` or `* expected_behavior:`)
    const liMatch = line.match(/^\s*[-*]\s+([a-zA-Z_$][\w-]*)\s*:/);
    if (liMatch && candidates.includes(normalize(liMatch[1]))) return true;
    // Table column header — split on `|`, normalize each cell
    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((c) => normalize(c))
        .filter(Boolean);
      if (cells.some((c) => candidates.includes(c))) return true;
    }
  }
  return false;
}

/**
 * For JSON templates: a field "appears" iff it is a direct property of the
 * parsed top-level object.
 *
 * @param {unknown} parsed
 * @param {string} fieldName
 */
export function jsonTemplateHasField(parsed, fieldName) {
  if (typeof parsed !== 'object' || parsed === null) return false;
  return Object.hasOwn(parsed, fieldName);
}

/**
 * Count H1 (`# `) and H2 (`## `) markdown headings in `text`.
 *
 * @param {string} text
 * @returns {{ h1: number, h2: number }}
 */
export function countHeadings(text) {
  const lines = text.split(/\r?\n/);
  let h1 = 0;
  let h2 = 0;
  for (const line of lines) {
    if (/^# \S/.test(line)) h1++;
    else if (/^## \S/.test(line)) h2++;
  }
  return { h1, h2 };
}

// ============================================================================
// TPL-03 PARITY GATE
// ============================================================================

test('TPL-03: every required schema field appears in its matched template', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const failures = [];
  for (const { schemaId, templatePath, templateFormat } of SCHEMA_TEMPLATE_MAPPING) {
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate, `Schema not registered in AJV singleton: ${schemaId}`);
    const required = (validate.schema.required ?? []).filter((f) => !isExcluded(f));
    const fullPath = path.join(REPO_ROOT, templatePath);
    const text = await readFile(fullPath, 'utf8');

    if (templateFormat === 'json') {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        failures.push(`${templatePath}: invalid JSON (${err.message})`);
        continue;
      }
      for (const field of required) {
        if (!jsonTemplateHasField(parsed, field)) {
          failures.push(
            `${schemaIdShort(schemaId)} <-> ${templatePath}: missing JSON key "${field}"`,
          );
        }
      }
    } else {
      for (const field of required) {
        if (!templateHasField(text, field)) {
          failures.push(`${schemaIdShort(schemaId)} <-> ${templatePath}: missing field "${field}"`);
        }
      }
    }
  }
  assert.deepStrictEqual(
    failures,
    [],
    `Schema/template drift detected:\n  ${failures.join('\n  ')}`,
  );
});

test('TPL-03: every mapped template file exists and is readable', async () => {
  for (const { templatePath } of SCHEMA_TEMPLATE_MAPPING) {
    const full = path.join(REPO_ROOT, templatePath);
    // readFile throws ENOENT if missing — surfaces as test failure.
    await readFile(full, 'utf8');
  }
});

test('TPL-03: every mapped schema is registered in the AJV singleton', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  for (const { schemaId } of SCHEMA_TEMPLATE_MAPPING) {
    assert.ok(ajv.getSchema(schemaId), `Schema not registered: ${schemaId}`);
  }
});

test('TPL-03: matching rule — fieldCandidates generates expected variants', () => {
  const cands = fieldCandidates('expectedBehavior');
  assert.ok(cands.includes('expectedBehavior'), 'camelCase form');
  assert.ok(cands.includes('expected behavior'), 'spaced lower-case form');
  assert.ok(cands.includes('expected_behavior'), 'snake_case form');
  assert.ok(cands.includes('expected-behavior'), 'kebab-case form');
  assert.ok(cands.includes('Expected Behavior'), 'Title Case form');
});

test('TPL-03: regression — drift simulation detects missing required field', () => {
  // Synthetic markdown missing a "Severity" heading — must be detected.
  const fakeTemplate = '# Issue\n\n## Title\n\n## Status\n';
  assert.equal(
    templateHasField(fakeTemplate, 'severity'),
    false,
    'severity should NOT match — drift simulation',
  );
  assert.equal(templateHasField(fakeTemplate, 'title'), true, 'title heading should match');
  assert.equal(templateHasField(fakeTemplate, 'status'), true, 'status heading should match');
});

// ============================================================================
// TPL-01 ORPHAN STRUCTURAL FLOOR
// ============================================================================
// Plan 02-02 ships ~20 per-artifact templates; only 15 of those are mapped to
// a schema by SCHEMA_TEMPLATE_MAPPING above. The remaining "orphan" templates
// (story, persona, job, state, entity, integration, plan-master, plan-domain,
// and the 11 non-domain.json domain markdowns) have no schema to validate
// against, so without this block they could ship as empty stubs and CI
// wouldn't catch it. Enforce a structural floor: ≥1 H1, ≥3 H2, >50 chars.

test('TPL-01: non-schema templates have minimum structure', async () => {
  const failures = [];
  for (const rel of ORPHAN_TEMPLATES) {
    const full = path.join(REPO_ROOT, rel);
    let text;
    try {
      text = await readFile(full, 'utf8');
    } catch (err) {
      failures.push(`${rel}: file missing (${err.code ?? err.message})`);
      continue;
    }
    if (text.length < 50) {
      failures.push(`${rel}: file too short (${text.length} chars; need >50)`);
    }
    const { h1, h2 } = countHeadings(text);
    if (h1 < 1) failures.push(`${rel}: missing H1 (need >=1, found ${h1})`);
    if (h2 < 3) failures.push(`${rel}: too few H2 headings (found ${h2}; need >=3)`);
  }
  assert.deepStrictEqual(
    failures,
    [],
    `Orphan template structural failures:\n  ${failures.join('\n  ')}`,
  );
});

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function schemaIdShort(id) {
  return id.replace(/^.*\/v1\//, '').replace(/\.schema\.json$/, '');
}
