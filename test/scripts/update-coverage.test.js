// test/scripts/update-coverage.test.js
//
// Plan 14-03 Task 3 — scripts/update-coverage.js reads the 8 V2 map JSON
// files and computes per-category coverage into _testatlas/brain/coverage.json.
//
// Contract:
//   - Tracks 6 categories: routes, components, endpoints, commands (CLI), jobs,
//     integrations.
//   - Per category: total = #items in the map, covered = #items with
//     test_coverage.percent > 0 OR test_coverage.tests.length > 0.
//   - Output written to _testatlas/brain/coverage.json, validates against
//     coverage.schema.json.
//   - Each item appears in coverage.<category>[] with id, tested, evidence
//     (and last_tested if known).
//   - --category <name|all> filter; --output <path> override.
//   - Exposes updateCoverage({ cwd, brainDir, mapsDir, category }) for
//     programmatic use.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'update-coverage.js');
const COVERAGE_SCHEMA_ID = 'https://testatlas.dev/schemas/v2/coverage.schema.json';

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-cov-'));
  const wsDir = path.join(dir, '_testatlas');
  const mapsDir = path.join(wsDir, 'maps');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(mapsDir, { recursive: true });
  await mkdir(brainDir, { recursive: true });

  // Mock maps with known covered/uncovered items.
  await writeFile(
    path.join(mapsDir, 'routes.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      routes: [
        {
          path: '/a',
          name: 'A',
          owning_domain: 'd',
          components: [],
          user_purpose: 'p',
          props: [],
          states: [],
          accessibility: {},
          responsive: {},
          observed_behavior: '',
          test_coverage: { tests: ['T-1'], percent: 80 },
          evidence: ['e1'],
          issues: [],
          confidence: 'high',
        },
        {
          path: '/b',
          name: 'B',
          owning_domain: 'd',
          components: [],
          user_purpose: 'p',
          props: [],
          states: [],
          accessibility: {},
          responsive: {},
          observed_behavior: '',
          test_coverage: { tests: [], percent: 0 },
          evidence: [],
          issues: [],
          confidence: 'low',
        },
      ],
    }),
  );

  await writeFile(
    path.join(mapsDir, 'components.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      components: [
        {
          name: 'C1',
          type: 't',
          owning_domain: 'd',
          routes_using: [],
          props: [],
          states: [],
          accessibility: {},
          responsive: {},
          observed_behavior: '',
          test_coverage: { tests: ['T-2'], percent: 50 },
          evidence: ['e2'],
          issues: [],
          confidence: 'medium',
        },
      ],
    }),
  );

  await writeFile(
    path.join(mapsDir, 'endpoints.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      endpoints: [
        {
          path: '/api/x',
          method: 'GET',
          auth: { required: true, schemes: [] },
          request_schema: '',
          response_schema: '',
          errors: [],
          pagination: null,
          idempotency: { method_implies_idempotent: true, header: null },
          rate_limit: null,
          test_coverage: { tests: [], percent: 0 },
          evidence: [],
          confidence: 'low',
        },
      ],
    }),
  );

  await writeFile(
    path.join(mapsDir, 'jobs.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      jobs: [
        {
          name: 'J1',
          schedule: { type: 'cron', expression: '0 0 * * *', timezone: 'UTC' },
          queue: { runner: 'r', name: 'q', concurrency: 1 },
          retry_policy: {},
          timeout: { value_ms: 1000, source: 's' },
          dependencies: [],
          test_coverage: { tests: [], percent: 0 },
          evidence: ['e3'],
        },
      ],
    }),
  );

  await writeFile(
    path.join(mapsDir, 'cli_commands.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      cli_commands: [
        {
          command: 'cli x',
          flags: [],
          help_text: 'h',
          config_files: [],
          env_vars: [],
          output_formats: [],
          exit_codes: [],
          test_coverage: { tests: ['T-3'], percent: 100 },
          evidence: ['e4'],
        },
      ],
    }),
  );

  await writeFile(
    path.join(mapsDir, 'integrations.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      integrations: [
        {
          service: 'S1',
          type: 't',
          auth_method: 'a',
          sandbox_strategy: { available: true },
          endpoints: [],
          test_coverage: { tests: [], percent: 0 },
          evidence: [],
        },
      ],
    }),
  );

  // Empty pages + states (we don't compute coverage for these per PRD §7.13:
  // pages roll up under routes; states are decorations on components).
  await writeFile(
    path.join(mapsDir, 'pages.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      pages: [],
    }),
  );
  await writeFile(
    path.join(mapsDir, 'states.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      last_updated: '2026-01-01T00:00:00.000Z',
      states: [],
    }),
  );

  return {
    dir,
    wsDir,
    mapsDir,
    brainDir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test('Test 1: updateCoverage tracks all 6 categories from the map files', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateCoverage } = await import(SCRIPT);
    const result = await updateCoverage({
      cwd: ctx.dir,
      brainDir: ctx.brainDir,
      mapsDir: ctx.mapsDir,
      category: 'all',
    });
    assert.equal(result.ok, true);
    const cov = JSON.parse(await readFile(path.join(ctx.brainDir, 'coverage.json'), 'utf8'));
    assert.equal(cov.schema_version, '2.0.0');
    assert.ok(Array.isArray(cov.coverage.routes));
    assert.ok(Array.isArray(cov.coverage.components));
    assert.ok(Array.isArray(cov.coverage.endpoints));
    assert.ok(Array.isArray(cov.coverage.commands));
    // jobs + integrations live in the schema as additional properties or in
    // the per-category summary; ensure they're tracked too.
    assert.ok(result.summary.jobs, 'summary must include jobs');
    assert.ok(result.summary.integrations, 'summary must include integrations');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: coverage percentage computed correctly per category', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateCoverage } = await import(SCRIPT);
    const result = await updateCoverage({
      cwd: ctx.dir,
      brainDir: ctx.brainDir,
      mapsDir: ctx.mapsDir,
      category: 'all',
    });
    assert.equal(result.summary.routes.total, 2);
    assert.equal(result.summary.routes.covered, 1);
    assert.equal(result.summary.routes.percent, 50);
    assert.equal(result.summary.components.total, 1);
    assert.equal(result.summary.components.covered, 1);
    assert.equal(result.summary.components.percent, 100);
    assert.equal(result.summary.endpoints.total, 1);
    assert.equal(result.summary.endpoints.covered, 0);
    assert.equal(result.summary.endpoints.percent, 0);
    assert.equal(result.summary.commands.total, 1);
    assert.equal(result.summary.commands.covered, 1);
    assert.equal(result.summary.commands.percent, 100);
    assert.equal(result.summary.jobs.total, 1);
    assert.equal(result.summary.jobs.covered, 0);
    assert.equal(result.summary.integrations.total, 1);
    assert.equal(result.summary.integrations.covered, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: uncovered items linked to their map id (test scenarios when present)', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateCoverage } = await import(SCRIPT);
    await updateCoverage({
      cwd: ctx.dir,
      brainDir: ctx.brainDir,
      mapsDir: ctx.mapsDir,
      category: 'all',
    });
    const cov = JSON.parse(await readFile(path.join(ctx.brainDir, 'coverage.json'), 'utf8'));
    // Find /b (uncovered) in routes
    const b = cov.coverage.routes.find((r) => r.id === '/b');
    assert.ok(b, 'uncovered route /b must appear in coverage.routes');
    assert.equal(b.tested, false);
    // Covered /a has test ids
    const a = cov.coverage.routes.find((r) => r.id === '/a');
    assert.equal(a.tested, true);
    assert.deepEqual(a.test_ids, ['T-1']);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: output validates against coverage.schema.json', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateCoverage } = await import(SCRIPT);
    await updateCoverage({
      cwd: ctx.dir,
      brainDir: ctx.brainDir,
      mapsDir: ctx.mapsDir,
      category: 'all',
    });
    const cov = JSON.parse(await readFile(path.join(ctx.brainDir, 'coverage.json'), 'utf8'));
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const validate = ajv.getSchema(COVERAGE_SCHEMA_ID);
    assert.ok(validate, 'coverage schema must be registered');
    const ok = validate(cov);
    assert.ok(ok, `coverage.json failed schema: ${JSON.stringify(validate.errors)}`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: --category filter restricts the update to one category', async () => {
  const ctx = await setupWorkspace();
  try {
    const { updateCoverage } = await import(SCRIPT);
    // First populate everything.
    await updateCoverage({
      cwd: ctx.dir,
      brainDir: ctx.brainDir,
      mapsDir: ctx.mapsDir,
      category: 'all',
    });
    const before = JSON.parse(await readFile(path.join(ctx.brainDir, 'coverage.json'), 'utf8'));

    // Now mutate the routes map and call with category=routes only;
    // components/endpoints/commands MUST be unchanged.
    const routes = JSON.parse(await readFile(path.join(ctx.mapsDir, 'routes.json'), 'utf8'));
    routes.routes[1].test_coverage.percent = 75;
    routes.routes[1].test_coverage.tests = ['T-NEW'];
    await writeFile(path.join(ctx.mapsDir, 'routes.json'), JSON.stringify(routes));

    const r = await updateCoverage({
      cwd: ctx.dir,
      brainDir: ctx.brainDir,
      mapsDir: ctx.mapsDir,
      category: 'routes',
    });
    assert.equal(r.summary.routes.covered, 2);

    const after = JSON.parse(await readFile(path.join(ctx.brainDir, 'coverage.json'), 'utf8'));
    // Routes should have changed.
    assert.notDeepEqual(before.coverage.routes, after.coverage.routes);
    // Components / endpoints / commands rows must be byte-identical.
    assert.deepEqual(before.coverage.components, after.coverage.components);
    assert.deepEqual(before.coverage.endpoints, after.coverage.endpoints);
    assert.deepEqual(before.coverage.commands, after.coverage.commands);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: missing maps gracefully degrade to zero-count categories', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-cov-empty-'));
  const wsDir = path.join(dir, '_testatlas');
  const mapsDir = path.join(wsDir, 'maps');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(mapsDir, { recursive: true });
  await mkdir(brainDir, { recursive: true });
  try {
    const { updateCoverage } = await import(SCRIPT);
    const r = await updateCoverage({ cwd: dir, brainDir, mapsDir, category: 'all' });
    assert.equal(r.ok, true);
    assert.equal(r.summary.routes.total, 0);
    assert.equal(r.summary.routes.percent, 0);
    const cov = JSON.parse(await readFile(path.join(brainDir, 'coverage.json'), 'utf8'));
    assert.deepEqual(cov.coverage.routes, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
