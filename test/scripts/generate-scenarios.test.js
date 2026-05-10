// test/scripts/generate-scenarios.test.js
//
// Plan 14-07 Task 1 — generate-scenarios.js reads flow docs and produces
// scenarios validating against test-scenario.schema.json, marked
// generated-not-yet-validated.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-scenarios.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-gen-scen-'));
  const ws = path.join(dir, '_testatlas');
  const flowsDir = path.join(ws, 'flows');
  const brainDir = path.join(ws, 'brain');
  const testsDir = path.join(ws, 'tests', 'scenarios');
  await mkdir(flowsDir, { recursive: true });
  await mkdir(brainDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });

  const now = new Date().toISOString();
  await writeFile(
    path.join(brainDir, 'manifest.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      suite_version: '2.0.0',
      initialized_at: now,
      last_updated: now,
      project_name: 'fixture',
      adapters: [],
      schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
    }),
  );

  // Write a flow JSON sidecar — V1 flow.schema.json shape.
  const flowJson = {
    $schema: 'https://testatlas.dev/schemas/v1/flow.schema.json',
    id: 'FLOW-auth-login',
    name: 'Login flow',
    domain: 'domain-auth',
    persona: 'returning-user',
    priority: 'high',
    status: 'mapped',
    confidence: 'high',
    goal: 'User logs in with valid credentials and reaches dashboard.',
    preconditions: ['Account exists', 'Password known'],
    entryPoints: ['/login'],
    expectedBehavior: ['200 OK', 'Session cookie set'],
    alternatePaths: [],
    edgeCases: ['expired password'],
    failurePaths: ['invalid credentials'],
    dataRequirements: [],
    dependencies: [],
    testScenarios: [],
    evidence: [],
    issues: [],
    retestNotes: [],
    lastUpdatedAt: now,
  };
  await writeFile(path.join(flowsDir, 'FLOW-auth-login.json'), JSON.stringify(flowJson, null, 2));
  await writeFile(
    path.join(flowsDir, 'FLOW-auth-login.md'),
    [
      '---',
      'id: FLOW-auth-login',
      'schema_version: 2.0.0',
      'status: mapped',
      '---',
      '',
      '# Flow: Login flow',
      '',
      '## Goal',
      '',
      'User logs in with valid credentials.',
      '',
      '## Steps',
      '',
      '1. Navigate to /login',
      '2. Enter credentials',
      '3. Submit',
      '',
      '## Expected Behavior',
      '',
      'Session cookie set; user routed to dashboard.',
      '',
    ].join('\n'),
  );

  return { dir, ws, flowsDir, testsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: generateScenarios reads flow docs and writes scenario md+json under _testatlas/tests/scenarios/', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateScenarios } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateScenarios({ cwd: ctx.dir, all: true });
    assert.equal(r.ok, true);
    assert.ok(Array.isArray(r.scenarios));
    assert.ok(r.scenarios.length >= 1, 'expected ≥1 scenario emitted');

    const entries = await readdir(ctx.testsDir);
    const md = entries.filter((e) => e.endsWith('.md'));
    const js = entries.filter((e) => e.endsWith('.json'));
    assert.ok(md.length >= 1, `expected ≥1 markdown scenario; got ${md.length}`);
    assert.ok(js.length >= 1, `expected ≥1 json scenario; got ${js.length}`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: generated scenarios marked status: "generated-not-yet-validated"', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateScenarios } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateScenarios({ cwd: ctx.dir, all: true });
    assert.equal(r.ok, true);
    for (const s of r.scenarios) {
      assert.equal(
        s.status,
        'generated-not-yet-validated',
        `scenario ${s.id} should carry status=generated-not-yet-validated`,
      );
    }

    const entries = await readdir(ctx.testsDir);
    const jsonFile = entries.find((e) => e.endsWith('.json'));
    const body = JSON.parse(await readFile(path.join(ctx.testsDir, jsonFile), 'utf8'));
    assert.equal(body.status, 'generated-not-yet-validated');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: --flow filter restricts output to a single flow', async () => {
  const ctx = await setupWorkspace();
  try {
    // Add a second flow.
    await writeFile(
      path.join(ctx.flowsDir, 'FLOW-billing-checkout.json'),
      JSON.stringify(
        {
          $schema: 'https://testatlas.dev/schemas/v1/flow.schema.json',
          id: 'FLOW-billing-checkout',
          name: 'Checkout flow',
          domain: 'domain-billing',
          persona: 'paying-user',
          priority: 'high',
          status: 'mapped',
          confidence: 'medium',
          goal: 'Pay for cart.',
          preconditions: [],
          entryPoints: ['/checkout'],
          expectedBehavior: ['Payment captured'],
          alternatePaths: [],
          edgeCases: [],
          failurePaths: [],
          dataRequirements: [],
          dependencies: [],
          testScenarios: [],
          evidence: [],
          issues: [],
          retestNotes: [],
          lastUpdatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    const { generateScenarios } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateScenarios({ cwd: ctx.dir, flow: 'FLOW-auth-login' });
    assert.equal(r.ok, true);
    assert.ok(r.scenarios.every((s) => s.flow === 'FLOW-auth-login'));
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: scenarios reference originating flow id and include steps + expectedResults', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateScenarios } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateScenarios({ cwd: ctx.dir, all: true });
    assert.equal(r.ok, true);
    const s = r.scenarios[0];
    assert.equal(s.flow, 'FLOW-auth-login');
    assert.ok(Array.isArray(s.steps) && s.steps.length >= 1);
    assert.ok(Array.isArray(s.expectedResults) && s.expectedResults.length >= 1);
    assert.ok(s.id.startsWith('TEST-'));
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: written scenario validates against test-scenario.schema.json (key fields shape)', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateScenarios } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateScenarios({ cwd: ctx.dir, all: true });
    assert.equal(r.ok, true);

    const entries = await readdir(ctx.testsDir);
    const jsonFile = entries.find((e) => e.endsWith('.json'));
    const body = JSON.parse(await readFile(path.join(ctx.testsDir, jsonFile), 'utf8'));
    // Key fields per test-scenario.schema.json (V1) — id, name, domain,
    // flow, priority, type, status, userGoal, steps, expectedResults,
    // preconditions, testData, evidence, issues, lastUpdatedAt.
    for (const k of [
      'id',
      'name',
      'domain',
      'flow',
      'priority',
      'type',
      'status',
      'userGoal',
      'steps',
      'expectedResults',
      'preconditions',
      'testData',
      'evidence',
      'issues',
      'lastUpdatedAt',
    ]) {
      assert.ok(k in body, `scenario JSON missing required key: ${k}`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: writes only under _testatlas/tests/ — never outside', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateScenarios } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateScenarios({ cwd: ctx.dir, all: true });
    assert.equal(r.ok, true);
    for (const f of r.written ?? []) {
      const rel = path.relative(ctx.dir, f);
      assert.ok(
        rel.startsWith(path.join('_testatlas', 'tests')),
        `wrote outside _testatlas/tests/: ${rel}`,
      );
    }
  } finally {
    await ctx.cleanup();
  }
});
