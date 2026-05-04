/**
 * test/templates/canonical-templates.test.js
 *
 * TPL-01 / WORK-02: Canonical-template structural verification.
 *
 * Asserts:
 *  - All 14 PRD §8 canonical templates are present at .testatlas/templates/canonical/.
 *  - Each canonical file is non-empty.
 *  - Each markdown canonical contains every PRD §14 required-section heading
 *    as a level-2 (`## `) heading, in any order, case-insensitive after
 *    normalization.
 *  - 11_workspace_manifest.json template parses as JSON and has required keys
 *    (matches workspace-manifest.schema.json shape).
 *  - 12_app_map.json template parses as JSON with empty arrays for each
 *    required app-map field.
 *  - Marker-bearing templates have balanced START/END marker pairs with
 *    matching `section="..."` attributes.
 *  - 10_command_log.md ships with all 9 column headers verbatim — pre-resolves
 *    Plan 02-05's command-result.schema.json↔10_command_log.md parity test.
 *  - .testatlas/templates/_gitignore exists with required ignore lines.
 */

import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CANONICAL_DIR = join(REPO_ROOT, '.testatlas', 'templates', 'canonical');
const TEMPLATES_DIR = join(REPO_ROOT, '.testatlas', 'templates');

const CANONICAL_FILES = [
  '00_overview.md',
  '01_system_map.md',
  '02_test_strategy.md',
  '03_execution_status.md',
  '04_open_questions.md',
  '05_assumptions.md',
  '06_risks_and_gaps.md',
  '07_environment_and_access.md',
  '08_glossary.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '11_workspace_manifest.json',
  '12_app_map.json',
  '13_quality_scorecard.md',
];

// PRD §14 required sections per canonical document.
const REQUIRED_SECTIONS = {
  '00_overview.md': [
    'Application Summary',
    'Product Purpose',
    'Primary Users',
    'Core Domains',
    'Architecture Shape',
    'Current Testing Status',
    'Highest Risks',
    'Latest Report Pointer',
    'Last Updated Timestamp',
  ],
  '01_system_map.md': [
    'Repository Structure',
    'Apps and Packages and Services',
    'Languages and Runtimes',
    'Surfaces',
    'APIs',
    'CLIs',
    'Jobs',
    'Data Stores',
    'Integrations',
    'Deployment',
    'Environment Boundaries',
    'Ownership',
    'Evidence and Source References',
  ],
  '02_test_strategy.md': [
    'Scope',
    'Non-Scope',
    'Environments',
    'Personas',
    'Priorities',
    'Severity Model',
    'Confidence Model',
    'Evidence Strategy',
    'Domain Strategy',
    'Flow Strategy',
    'Accessibility Strategy',
    'Performance Strategy',
    'Retest Rules',
    'Risk-Based Prioritization',
  ],
  '03_execution_status.md': [
    'Current Command',
    'Completed Analysis',
    'Completed Explorations',
    'Domains Mapped',
    'Flows Mapped',
    'Flows Tested',
    'Issues Filed',
    'Pending Retests',
    'Blockers',
    'Next Highest-Value Steps',
    'Latest Update Timestamp',
  ],
  '04_open_questions.md': [
    'Unresolved Product Behavior Questions',
    'Missing Access',
    'Unclear Environment Requirements',
    'Conflicting Documentation',
    'Unknown Third-Party Dependencies',
    'Blockers',
    'Owner',
    'Status',
  ],
  '05_assumptions.md': ['Assumption', 'Source', 'Confidence', 'Validation Path', 'Status'],
  '06_risks_and_gaps.md': [
    'Untested Domains',
    'Missing Data or Accounts',
    'Unavailable Services',
    'Setup Problems',
    'Observability Gaps',
    'Security and Privacy Concerns',
    'Product Ambiguity',
    'Automation Gaps',
    'Severity',
    'Mitigation',
  ],
  '07_environment_and_access.md': [
    'Local Setup',
    'Environments',
    'Ports',
    'URLs',
    'Roles and Accounts',
    'Environment Variables',
    'Feature Flags',
    'External Dependencies',
    'Seed Data',
    'Safety Boundaries',
    'Caveats',
  ],
  '08_glossary.md': [
    'Product Terms',
    'Domain Terms',
    'Entity Names',
    'Role Names',
    'Status Names',
    'Abbreviations',
  ],
  '09_artifact_index.md': [
    'Canonical Documents',
    'Domain Documents',
    'Flow Documents',
    'Issue Documents',
    'Evidence',
    'Reports',
    'JSON Maps',
    'Command Outputs',
    'Sub-Agent Outputs',
  ],
  '13_quality_scorecard.md': [
    'Coverage',
    'Severity-Weighted Issue Load',
    'Confidence',
    'Blockers Over Time',
  ],
};

const MARKER_BEARING = [
  '00_overview.md',
  '03_execution_status.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '13_quality_scorecard.md',
];

const COMMAND_LOG_REQUIRED_HEADERS = [
  'command',
  'invoked at',
  'completed at',
  'status',
  'outputs',
  'errors',
  'artifacts created',
  'artifacts updated',
  'manifest updated',
];

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractH2Headings(content) {
  const lines = content.split(/\r?\n/);
  const headings = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) headings.push(m[1].trim());
  }
  return headings;
}

function sectionPresent(headings, expected) {
  const target = normalize(expected);
  return headings.some((h) => normalize(h).includes(target));
}

test('TPL-01: all 14 canonical templates present', async () => {
  const entries = await readdir(CANONICAL_DIR);
  for (const f of CANONICAL_FILES) {
    assert.ok(entries.includes(f), `Missing canonical template: ${f}`);
  }
});

test('TPL-01: every canonical template is non-empty (>100 bytes)', async () => {
  for (const f of CANONICAL_FILES) {
    const s = await stat(join(CANONICAL_DIR, f));
    assert.ok(s.size > 100, `Canonical template too small: ${f} (${s.size} bytes)`);
  }
});

test('WORK-02: each canonical .md template contains every PRD §14 required section as a `## ` heading', async () => {
  for (const [file, expectedSections] of Object.entries(REQUIRED_SECTIONS)) {
    const content = await readFile(join(CANONICAL_DIR, file), 'utf8');
    const headings = extractH2Headings(content);
    for (const sec of expectedSections) {
      assert.ok(
        sectionPresent(headings, sec),
        `${file}: missing required section "${sec}". Found H2 headings: ${JSON.stringify(headings)}`,
      );
    }
  }
});

test('WORK-02: 11_workspace_manifest.json template parses as JSON and has required keys', async () => {
  const content = await readFile(join(CANONICAL_DIR, '11_workspace_manifest.json'), 'utf8');
  const parsed = JSON.parse(content);
  const requiredKeys = [
    '$schema',
    'suite',
    'workspaceVersion',
    'workspaceDir',
    'initializedAt',
    'lastUpdatedAt',
    'project',
    'counts',
    'latestReport',
    'status',
    'generatedSections',
  ];
  for (const k of requiredKeys) {
    assert.ok(Object.hasOwn(parsed, k), `workspace-manifest template missing key: ${k}`);
  }
  assert.equal(parsed.suite, 'TestAtlas');
  assert.equal(typeof parsed.counts, 'object');
  for (const c of ['domains', 'flows', 'issues', 'evidenceRecords', 'testRuns']) {
    assert.ok(Object.hasOwn(parsed.counts, c), `workspace-manifest counts missing: ${c}`);
  }
});

test('WORK-02: 12_app_map.json template parses and has empty arrays for required app-map fields', async () => {
  const content = await readFile(join(CANONICAL_DIR, '12_app_map.json'), 'utf8');
  const parsed = JSON.parse(content);
  const requiredArrays = [
    'domains',
    'routes',
    'components',
    'apis',
    'cliCommands',
    'jobs',
    'integrations',
    'entities',
    'flows',
    'tests',
    'relationships',
  ];
  for (const k of requiredArrays) {
    assert.ok(Array.isArray(parsed[k]), `app-map template field "${k}" is not an array`);
    assert.equal(parsed[k].length, 0, `app-map template field "${k}" should be empty initially`);
  }
});

test('WORK-02: marker-bearing templates have well-formed START/END pairs', async () => {
  const startRe = /<!--\s*TESTATLAS:GENERATED:START\s+section="([^"]+)"\s*-->/g;
  const endRe = /<!--\s*TESTATLAS:GENERATED:END\s+section="([^"]+)"\s*-->/g;
  for (const f of MARKER_BEARING) {
    const content = await readFile(join(CANONICAL_DIR, f), 'utf8');
    // Strip fenced code blocks before scanning so documentation examples don't
    // count as live markers.
    const lines = content.split(/\r?\n/);
    let inFence = false;
    const liveLines = [];
    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        continue;
      }
      if (!inFence) liveLines.push(line);
    }
    const live = liveLines.join('\n');
    const starts = [...live.matchAll(startRe)].map((m) => m[1]);
    const ends = [...live.matchAll(endRe)].map((m) => m[1]);
    assert.equal(
      starts.length,
      ends.length,
      `${f}: START/END marker count mismatch (${starts.length} vs ${ends.length})`,
    );
    assert.ok(starts.length > 0, `${f}: expected at least one marker pair`);
    // Each START section must have an END section with the same name (count
    // by section).
    const startCount = {};
    const endCount = {};
    for (const s of starts) startCount[s] = (startCount[s] || 0) + 1;
    for (const e of ends) endCount[e] = (endCount[e] || 0) + 1;
    for (const sec of Object.keys(startCount)) {
      assert.equal(
        startCount[sec],
        endCount[sec] || 0,
        `${f}: section "${sec}" START/END count mismatch`,
      );
    }
  }
});

test('WORK-02: 10_command_log.md ships with all 9 required column headers (parity with command-result.schema.json)', async () => {
  const content = await readFile(join(CANONICAL_DIR, '10_command_log.md'), 'utf8');
  // Find the first markdown table header row (line starting with `|` and
  // containing more than one pipe-delimited cell).
  const lines = content.split(/\r?\n/);
  let headerRow = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('|') && t.endsWith('|') && t.split('|').length >= 4) {
      // Skip alignment rows like `|---|---|`
      if (/^[\s|:-]+$/.test(t)) continue;
      headerRow = t;
      break;
    }
  }
  assert.ok(headerRow, '10_command_log.md: no markdown table header row found');
  const cells = headerRow
    .split('|')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
  for (const required of COMMAND_LOG_REQUIRED_HEADERS) {
    assert.ok(
      cells.includes(required),
      `10_command_log.md header missing column "${required}". Found: ${JSON.stringify(cells)}`,
    );
  }
  assert.ok(
    cells.length >= 9,
    `10_command_log.md header should have >=9 columns, got ${cells.length}: ${JSON.stringify(cells)}`,
  );
});

test('TPL-01: _gitignore template exists with required ignore lines', async () => {
  const content = await readFile(join(TEMPLATES_DIR, '_gitignore'), 'utf8');
  for (const required of [
    'evidence/screenshots/',
    'evidence/videos/',
    'evidence/traces/',
    'evidence/logs/',
  ]) {
    assert.ok(content.includes(required), `_gitignore missing ignore line: ${required}`);
  }
});
