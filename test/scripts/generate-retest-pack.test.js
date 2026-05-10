// test/scripts/generate-retest-pack.test.js
//
// Plan 14-07 Task 2 — generate-retest-pack.js produces retest packs from
// issue JSON + evidence with steps + pass/fail criteria, validating against
// retest_pack.schema.json.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'generate-retest-pack.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-gen-retest-'));
  const ws = path.join(dir, '_testatlas');
  const toFix = path.join(ws, 'to_fix');
  const evidenceDir = path.join(ws, 'evidence');
  const brainDir = path.join(ws, 'brain');
  const retestDir = path.join(ws, 'tests', 'retest_packs');
  await mkdir(toFix, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(brainDir, { recursive: true });
  await mkdir(retestDir, { recursive: true });

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

  // V1 issue.schema.json shape — must include reproductionSteps + acceptanceCriteria.
  const issue = {
    $schema: 'https://testatlas.dev/schemas/v1/issue.schema.json',
    id: 'ISSUE-001-signup-failure',
    slug: 'signup-failure',
    title: 'Signup fails when email contains uppercase domain',
    status: 'open',
    severity: 'high',
    confidence: 'confirmed',
    type: 'functional',
    domain: 'domain-auth',
    flow: null,
    foundOn: now,
    summary: 'Signup form rejects valid emails with uppercase domains.',
    expectedBehavior: 'Email validation accepts uppercase domain parts.',
    actualBehavior: 'Email validation rejects valid emails with uppercase domains.',
    userImpact: 'Users with capitalised domains cannot register.',
    reproductionSteps: [
      'Navigate to /signup',
      'Enter email TestUser@EXAMPLE.com',
      'Submit form',
      'Observe validation error',
    ],
    frequency: 'always',
    evidence: ['EVIDENCE-001'],
    acceptanceCriteria: [
      'Signup accepts emails with uppercase domain parts.',
      'Validation regex is case-insensitive on the domain segment.',
    ],
    lastUpdatedAt: now,
  };
  await writeFile(
    path.join(toFix, 'ISSUE-001-signup-failure.json'),
    JSON.stringify(issue, null, 2),
  );
  await writeFile(
    path.join(toFix, 'ISSUE-001-signup-failure.md'),
    `# ${issue.title}\n\n## Acceptance criteria\n\n- ${issue.acceptanceCriteria[0]}\n- ${issue.acceptanceCriteria[1]}\n`,
  );

  return { dir, ws, retestDir, toFix, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: generateRetestPack reads issue + emits md+json under retest_packs/RET-<id>/', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateRetestPack } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateRetestPack({ cwd: ctx.dir, issueId: 'ISSUE-001-signup-failure' });
    assert.equal(r.ok, true);
    assert.ok(Array.isArray(r.packs) && r.packs.length === 1);
    const packDirs = await readdir(ctx.retestDir);
    assert.ok(
      packDirs.some((d) => d.startsWith('RET-')),
      `expected a RET-<id> subdir; got ${packDirs}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: pack JSON validates against retest_pack.schema.json (key fields)', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateRetestPack } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateRetestPack({ cwd: ctx.dir, issueId: 'ISSUE-001-signup-failure' });
    assert.equal(r.ok, true);
    const packDirs = await readdir(ctx.retestDir);
    const subdir = packDirs.find((d) => d.startsWith('RET-'));
    const files = await readdir(path.join(ctx.retestDir, subdir));
    const jsonFile = files.find((f) => f.endsWith('.json'));
    const body = JSON.parse(await readFile(path.join(ctx.retestDir, subdir, jsonFile), 'utf8'));
    for (const k of [
      'id',
      'issue_id',
      'title',
      'steps',
      'expected',
      'actual',
      'created_at',
      'status',
    ]) {
      assert.ok(k in body, `pack JSON missing required key ${k}`);
    }
    assert.match(body.id, /^RETEST-\d+$/);
    assert.equal(body.issue_id, 'ISSUE-001-signup-failure');
    assert.ok(Array.isArray(body.steps) && body.steps.length >= 1);
    assert.equal(body.status, 'pending');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: --all-open generates packs for every open issue and skips closed', async () => {
  const ctx = await setupWorkspace();
  try {
    // Add a closed issue.
    const now = new Date().toISOString();
    await writeFile(
      path.join(ctx.toFix, 'ISSUE-002-closed.json'),
      JSON.stringify(
        {
          $schema: 'https://testatlas.dev/schemas/v1/issue.schema.json',
          id: 'ISSUE-002-closed',
          slug: 'closed',
          title: 'Already-fixed issue',
          status: 'closed',
          severity: 'low',
          confidence: 'confirmed',
          type: 'functional',
          domain: 'domain-auth',
          flow: null,
          foundOn: now,
          summary: 's',
          expectedBehavior: 'e',
          actualBehavior: 'a',
          userImpact: '',
          reproductionSteps: ['x'],
          frequency: 'unknown',
          evidence: ['EVIDENCE-001'],
          acceptanceCriteria: ['done'],
          lastUpdatedAt: now,
        },
        null,
        2,
      ),
    );

    const { generateRetestPack } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateRetestPack({ cwd: ctx.dir, allOpen: true });
    assert.equal(r.ok, true);
    assert.equal(r.packs.length, 1, 'closed issue should be skipped');
    assert.equal(r.packs[0].issue_id, 'ISSUE-001-signup-failure');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: pack carries pass/fail criteria derived from acceptanceCriteria + evidence refs', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateRetestPack } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateRetestPack({ cwd: ctx.dir, issueId: 'ISSUE-001-signup-failure' });
    assert.equal(r.ok, true);
    const pack = r.packs[0];
    assert.ok(pack.expected.length > 0, 'expected (pass criteria) must be non-empty');
    assert.ok(pack.actual.length > 0, 'actual (fail-state baseline) must be non-empty');
    // Must reference the issue's evidence.
    assert.ok(
      Array.isArray(pack.evidence) && pack.evidence.includes('EVIDENCE-001'),
      'pack must carry evidence refs from the issue',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: only writes under _testatlas/tests/retest_packs/', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateRetestPack } = await import(pathToFileURL(SCRIPT).href);
    const r = await generateRetestPack({ cwd: ctx.dir, issueId: 'ISSUE-001-signup-failure' });
    assert.equal(r.ok, true);
    for (const f of r.written ?? []) {
      const rel = path.relative(ctx.dir, f);
      assert.ok(
        rel.startsWith(path.join('_testatlas', 'tests', 'retest_packs')),
        `wrote outside retest_packs/: ${rel}`,
      );
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: missing issue id halts with ISSUE_NOT_FOUND', async () => {
  const ctx = await setupWorkspace();
  try {
    const { generateRetestPack } = await import(pathToFileURL(SCRIPT).href);
    await assert.rejects(
      () => generateRetestPack({ cwd: ctx.dir, issueId: 'ISSUE-999-missing' }),
      (err) => err.code === 'ISSUE_NOT_FOUND',
    );
  } finally {
    await ctx.cleanup();
  }
});
