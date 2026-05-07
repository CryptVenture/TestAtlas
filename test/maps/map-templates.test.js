// test/maps/map-templates.test.js
//
// Plan 14-03 Task 2 — validate the 8 V2 map JSON templates under
// _testatlas/maps/. Per PRD §7.13 each map type has required fields:
//
//   routes        : path, name, owning_domain, components, user_purpose, props,
//                   states, accessibility, responsive, observed_behavior,
//                   test_coverage, evidence, issues, confidence
//   pages         : path, title, layout, components, states, accessibility,
//                   responsive, evidence, confidence
//   components    : name, type, owning_domain, routes_using, props, states,
//                   accessibility, responsive, observed_behavior, test_coverage,
//                   evidence, issues, confidence
//   states        : state_name, component, trigger, visual_indicator,
//                   accessibility, evidence
//   endpoints     : path, method, auth, request_schema, response_schema, errors,
//                   pagination, idempotency, rate_limit, test_coverage, evidence,
//                   confidence
//   jobs          : name, schedule, queue, retry_policy, timeout, dependencies,
//                   test_coverage, evidence
//   cli_commands  : command, flags, help_text, config_files, env_vars,
//                   output_formats, exit_codes, test_coverage, evidence
//   integrations  : service, type, auth_method, sandbox_strategy, endpoints,
//                   test_coverage, evidence
//
// Plus: explore-all.md routes to all 20 explorers and includes idempotency
// filter + execution-mode selection.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
// Canonical map templates ship under .testatlas/templates/maps/ and are
// copied to _testatlas/maps/ at init time. We validate the shipped
// (version-controlled) templates so the test is hermetic.
const MAPS_DIR = path.join(REPO_ROOT, '.testatlas', 'templates', 'maps');

const REQUIRED_FIELDS = {
  routes: [
    'path',
    'name',
    'owning_domain',
    'components',
    'user_purpose',
    'props',
    'states',
    'accessibility',
    'responsive',
    'observed_behavior',
    'test_coverage',
    'evidence',
    'issues',
    'confidence',
  ],
  pages: [
    'path',
    'title',
    'layout',
    'components',
    'states',
    'accessibility',
    'responsive',
    'evidence',
    'confidence',
  ],
  components: [
    'name',
    'type',
    'owning_domain',
    'routes_using',
    'props',
    'states',
    'accessibility',
    'responsive',
    'observed_behavior',
    'test_coverage',
    'evidence',
    'issues',
    'confidence',
  ],
  states: ['state_name', 'component', 'trigger', 'visual_indicator', 'accessibility', 'evidence'],
  endpoints: [
    'path',
    'method',
    'auth',
    'request_schema',
    'response_schema',
    'errors',
    'pagination',
    'idempotency',
    'rate_limit',
    'test_coverage',
    'evidence',
    'confidence',
  ],
  jobs: [
    'name',
    'schedule',
    'queue',
    'retry_policy',
    'timeout',
    'dependencies',
    'test_coverage',
    'evidence',
  ],
  cli_commands: [
    'command',
    'flags',
    'help_text',
    'config_files',
    'env_vars',
    'output_formats',
    'exit_codes',
    'test_coverage',
    'evidence',
  ],
  integrations: [
    'service',
    'type',
    'auth_method',
    'sandbox_strategy',
    'endpoints',
    'test_coverage',
    'evidence',
  ],
};

async function loadMap(name) {
  const file = path.join(MAPS_DIR, `${name}.json`);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw);
}

test('Test 1: all 8 map JSON files exist and parse', async () => {
  for (const name of Object.keys(REQUIRED_FIELDS)) {
    const data = await loadMap(name);
    assert.equal(typeof data, 'object', `${name}.json must parse to an object`);
    assert.ok(data !== null, `${name}.json must not be null`);
  }
});

test('Test 2: every map declares schema_version 2.0.0', async () => {
  for (const name of Object.keys(REQUIRED_FIELDS)) {
    const data = await loadMap(name);
    assert.equal(
      data.schema_version,
      '2.0.0',
      `${name}.json missing or wrong schema_version (expected 2.0.0)`,
    );
  }
});

test('Test 3: every map exposes a top-level array matching its name', async () => {
  for (const name of Object.keys(REQUIRED_FIELDS)) {
    const data = await loadMap(name);
    assert.ok(Array.isArray(data[name]), `${name}.json must contain an array at .${name}`);
  }
});

test('Test 4: every map has a template entry exposing all required fields', async () => {
  for (const [name, fields] of Object.entries(REQUIRED_FIELDS)) {
    const data = await loadMap(name);
    assert.ok(
      data[name].length >= 1,
      `${name}.json must include at least one template entry illustrating field shape`,
    );
    const templateEntry = data[name][0];
    const missing = fields.filter((f) => !(f in templateEntry));
    assert.deepEqual(
      missing,
      [],
      `${name}.json template entry missing required fields: ${missing.join(', ')}`,
    );
  }
});

test('Test 5: every map markdown file exists', async () => {
  for (const name of Object.keys(REQUIRED_FIELDS)) {
    const file = path.join(MAPS_DIR, `${name}.md`);
    const raw = await readFile(file, 'utf8');
    assert.ok(raw.length > 0, `${name}.md must not be empty`);
    assert.match(
      raw,
      new RegExp(`# .* ${name.replace('_', ' ')} ?map`, 'i'),
      `${name}.md must start with a Map header`,
    );
  }
});

test('Test 6: explore-all umbrella routes to all 20 explorers', async () => {
  const file = path.join(REPO_ROOT, '.testatlas', 'commands', 'explore', 'explore-all.md');
  const raw = await readFile(file, 'utf8');
  const explorers = [
    // V1 (11)
    'explore-codebase',
    'explore-ui',
    'explore-cli',
    'explore-api',
    'explore-docs',
    'explore-runtime',
    'explore-data',
    'explore-integrations',
    'explore-accessibility',
    'explore-performance',
    'explore-security',
    // V2 (10)
    'explore-state',
    'explore-errors',
    'explore-components',
    'explore-routes',
    'explore-jobs',
    'explore-security-privacy',
    'explore-observability',
    'explore-tests',
    'explore-brain',
    'explore-release-readiness',
  ];
  // explore-security and explore-security-privacy are both retained
  // (V1 stays + V2 expansion); 11 + 10 = 21 entries enumerated, but the
  // *count* of distinct explorers is 20 because V2 explore-security-privacy
  // supersedes V1 explore-security in the V2 routing model.
  const missing = explorers.filter((name) => !new RegExp(`\\b${name}\\b`).test(raw));
  assert.deepEqual(missing, [], `explore-all missing references: ${missing.join(', ')}`);
});

test('Test 7: explore-all umbrella declares execution modes', async () => {
  const file = path.join(REPO_ROOT, '.testatlas', 'commands', 'explore', 'explore-all.md');
  const raw = await readFile(file, 'utf8');
  for (const mode of ['parallel-subagents', 'sequential-fallback', 'classify-only']) {
    assert.match(raw, new RegExp(`\\b${mode}\\b`), `explore-all missing execution mode: ${mode}`);
  }
});

test('Test 8: explore-all umbrella includes idempotency filter', async () => {
  const file = path.join(REPO_ROOT, '.testatlas', 'commands', 'explore', 'explore-all.md');
  const raw = await readFile(file, 'utf8');
  assert.match(raw, /idempoten/i, 'explore-all must declare idempotency / cache-skip behavior');
  assert.match(
    raw,
    /(skip|cached|already[\s-]?mapped)/i,
    'explore-all must explain how already-mapped items are skipped',
  );
});
