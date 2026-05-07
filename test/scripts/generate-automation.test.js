// test/scripts/generate-automation.test.js
//
// Plan 14-07 Task 1 — generate-automation.js produces framework-specific
// skeletons for Playwright, Cypress, API, CLI, contract, and smoke tests.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-automation.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-gen-auto-'));
  const ws = path.join(dir, '_testatlas');
  const flowsDir = path.join(ws, 'flows');
  const brainDir = path.join(ws, 'brain');
  await mkdir(flowsDir, { recursive: true });
  await mkdir(brainDir, { recursive: true });
  await mkdir(path.join(ws, 'tests', 'generated_automation'), { recursive: true });

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

  await writeFile(
    path.join(flowsDir, 'FLOW-auth-login.json'),
    JSON.stringify(
      {
        $schema: 'https://testatlas.dev/schemas/v1/flow.schema.json',
        id: 'FLOW-auth-login',
        name: 'Login flow',
        domain: 'domain-auth',
        persona: 'returning-user',
        priority: 'high',
        status: 'mapped',
        confidence: 'high',
        goal: 'User logs in.',
        preconditions: [],
        entryPoints: ['/login'],
        expectedBehavior: ['200'],
        alternatePaths: [],
        edgeCases: [],
        failurePaths: [],
        dataRequirements: [],
        dependencies: [],
        testScenarios: [],
        evidence: [],
        issues: [],
        retestNotes: [],
        lastUpdatedAt: now,
      },
      null,
      2,
    ),
  );

  return { dir, ws, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const FRAMEWORKS = ['playwright', 'cypress', 'api', 'cli', 'contract', 'smoke'];

test('Test 1: generateAutomation supports all six framework flags', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateAutomation } = await import(SCRIPT);
    for (const fw of FRAMEWORKS) {
      const r = await generateAutomation({ cwd: ctx.dir, framework: fw, all: true });
      assert.equal(r.ok, true, `framework ${fw} should succeed`);
      assert.ok(
        Array.isArray(r.skeletons) && r.skeletons.length >= 1,
        `framework ${fw} produced no skeletons`,
      );
      const outDir = path.join(ctx.ws, 'tests', 'generated_automation', fw);
      const entries = await readdir(outDir);
      assert.ok(entries.length >= 1, `framework ${fw} wrote no files`);
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: each generated skeleton mentions fixture requirements + mock data plan', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateAutomation } = await import(SCRIPT);
    for (const fw of FRAMEWORKS) {
      const r = await generateAutomation({ cwd: ctx.dir, framework: fw, all: true });
      assert.equal(r.ok, true);
      const outDir = path.join(ctx.ws, 'tests', 'generated_automation', fw);
      const entries = (await readdir(outDir)).filter(
        (e) =>
          e.endsWith('.md') ||
          e.endsWith('.spec.ts') ||
          e.endsWith('.spec.js') ||
          e.endsWith('.cy.js') ||
          e.endsWith('.http') ||
          e.endsWith('.sh') ||
          e.endsWith('.json'),
      );
      for (const e of entries) {
        const body = await readFile(path.join(outDir, e), 'utf8');
        assert.ok(/fixture/i.test(body), `${fw}/${e}: missing fixture mention`);
        assert.ok(/mock/i.test(body), `${fw}/${e}: missing mock data mention`);
      }
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: each skeleton tracks status=generated-but-not-validated in companion JSON', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateAutomation } = await import(SCRIPT);
    for (const fw of FRAMEWORKS) {
      const r = await generateAutomation({ cwd: ctx.dir, framework: fw, all: true });
      assert.equal(r.ok, true);
      for (const s of r.skeletons) {
        assert.equal(
          s.status,
          'generated-but-not-validated',
          `${fw} skeleton should track status=generated-but-not-validated; got ${s.status}`,
        );
      }
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: status enum lists generated-but-not-validated, validated, committed, flaky', async () => {
  const { STATUS_VALUES } = await import(SCRIPT);
  assert.ok(Array.isArray(STATUS_VALUES));
  for (const want of ['generated-but-not-validated', 'validated', 'committed', 'flaky']) {
    assert.ok(STATUS_VALUES.includes(want), `status enum missing ${want}`);
  }
});

test('Test 5: only writes under _testatlas/tests/generated_automation/', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateAutomation } = await import(SCRIPT);
    const r = await generateAutomation({ cwd: ctx.dir, framework: 'playwright', all: true });
    assert.equal(r.ok, true);
    for (const f of r.written ?? []) {
      const rel = path.relative(ctx.dir, f);
      assert.ok(
        rel.startsWith(path.join('_testatlas', 'tests', 'generated_automation')),
        `wrote outside generated_automation/: ${rel}`,
      );
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: --flow restricts skeletons to a single flow id', async () => {
  const ctx = await setupWorkspace();
  try {
    // Add a second flow.
    await writeFile(
      path.join(ctx.ws, 'flows', 'FLOW-billing-checkout.json'),
      JSON.stringify(
        {
          $schema: 'https://testatlas.dev/schemas/v1/flow.schema.json',
          id: 'FLOW-billing-checkout',
          name: 'Checkout',
          domain: 'domain-billing',
          persona: 'p',
          priority: 'high',
          status: 'mapped',
          confidence: 'high',
          goal: 'g',
          preconditions: [],
          entryPoints: [],
          expectedBehavior: [],
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

    const { generateAutomation } = await import(SCRIPT);
    const r = await generateAutomation({
      cwd: ctx.dir,
      framework: 'playwright',
      flow: 'FLOW-auth-login',
    });
    assert.equal(r.ok, true);
    assert.ok(r.skeletons.every((s) => s.flow === 'FLOW-auth-login'));
  } finally {
    await ctx.cleanup();
  }
});
