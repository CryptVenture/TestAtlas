// test/scripts/reconcile-counts.test.js
//
// Plan 22-01 Task 1 — DEC-001 + DEC-003 regression test.
//
// RED-bar harness: scripts/reconcile-counts.js does NOT exist yet at Wave 0.
// Tests fail with ERR_MODULE_NOT_FOUND. Wave 1 Task 1 creates the producer
// and turns these GREEN.
//
// Pins: DEC-001 (reconcile state.json#counts + project + manifest.adapters)
//       DEC-003 (state.json#confidence/recommendations producers — same fix)

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'reconcile-counts.js');

async function setupWorkspace(opts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-reconcile-counts-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });

  // Minimal state.json skeleton (all fields empty/defaults).
  await writeFile(
    path.join(brainDir, 'state.json'),
    `${JSON.stringify(
      {
        schema_version: '2.0.0',
        counts: { council_sessions: 0, evidence_artifacts: 0 },
        project: { name: '', primary_stack: '' },
        confidence: { overall: 'unknown', highest_risk_domains: [], stale_domains: [] },
        next_recommended_commands: [],
        status: { phase: '', last_updated: '' },
      },
      null,
      2,
    )}\n`,
  );

  // Minimal manifest.json skeleton.
  await writeFile(
    path.join(brainDir, 'manifest.json'),
    `${JSON.stringify({ schema_version: '2.0.0', adapters: [], last_updated: '' }, null, 2)}\n`,
  );

  // Optional package.json for project.name detection.
  if (opts.withPackageJson) {
    await writeFile(
      path.join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'testatlas',
          version: '2.0.0',
          dependencies: { ajv: '^8.17', commander: '^13' },
        },
        null,
        2,
      )}\n`,
    );
  }

  // Optional council session directories.
  for (const sid of opts.sessions ?? []) {
    await mkdir(path.join(wsDir, 'agents', 'councils', 'sessions', sid), { recursive: true });
  }

  // Optional evidence artifact directories.
  for (const eid of opts.evidence ?? []) {
    await mkdir(path.join(wsDir, 'evidence', eid), { recursive: true });
  }

  // Optional adapter directories.
  for (const adapter of opts.adapters ?? []) {
    await mkdir(path.join(dir, '.testatlas', 'adapters', adapter), { recursive: true });
  }

  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: counts.council_sessions + counts.evidence_artifacts reflect on-disk truth', async () => {
  const ctx = await setupWorkspace({
    sessions: ['COUNCIL-001', 'COUNCIL-002'],
    evidence: ['EVIDENCE-001', 'EVIDENCE-002', 'EVIDENCE-003'],
  });
  try {
    const { reconcileCounts } = await import(pathToFileURL(SCRIPT).href);
    await reconcileCounts({ cwd: ctx.dir });
    const state = JSON.parse(await readFile(path.join(ctx.brainDir, 'state.json'), 'utf8'));
    assert.equal(state.counts.council_sessions, 2);
    assert.equal(state.counts.evidence_artifacts, 3);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: project.name + project.primary_stack populated from package.json', async () => {
  const ctx = await setupWorkspace({ withPackageJson: true });
  try {
    const { reconcileCounts } = await import(pathToFileURL(SCRIPT).href);
    await reconcileCounts({ cwd: ctx.dir });
    const state = JSON.parse(await readFile(path.join(ctx.brainDir, 'state.json'), 'utf8'));
    assert.equal(state.project.name, 'testatlas');
    // primary_stack may be string or non-empty array — assert non-empty.
    const stack = state.project.primary_stack;
    const isNonEmptyString = typeof stack === 'string' && stack.length > 0;
    const isNonEmptyArray = Array.isArray(stack) && stack.length > 0;
    assert.ok(
      isNonEmptyString || isNonEmptyArray,
      `expected non-empty primary_stack, got ${JSON.stringify(stack)}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: manifest.adapters reflects .testatlas/adapters/ on-disk (sorted)', async () => {
  const ctx = await setupWorkspace({ adapters: ['cursor', 'aider', 'claude-code'] });
  try {
    const { reconcileCounts } = await import(pathToFileURL(SCRIPT).href);
    await reconcileCounts({ cwd: ctx.dir });
    const manifest = JSON.parse(await readFile(path.join(ctx.brainDir, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.adapters, ['aider', 'claude-code', 'cursor']);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: confidence.overall + next_recommended_commands populated (DEC-003)', async () => {
  const ctx = await setupWorkspace({
    sessions: ['COUNCIL-001'],
    evidence: ['EVIDENCE-001'],
    withPackageJson: true,
  });
  try {
    const { reconcileCounts } = await import(pathToFileURL(SCRIPT).href);
    await reconcileCounts({ cwd: ctx.dir });
    const state = JSON.parse(await readFile(path.join(ctx.brainDir, 'state.json'), 'utf8'));
    assert.notEqual(state.confidence.overall, 'unknown');
    assert.ok(
      Array.isArray(state.next_recommended_commands),
      'next_recommended_commands must be an array',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: idempotent — second invocation reports no changes', async () => {
  const ctx = await setupWorkspace({
    sessions: ['COUNCIL-001'],
    evidence: ['EVIDENCE-001'],
    adapters: ['aider'],
  });
  try {
    const { reconcileCounts } = await import(pathToFileURL(SCRIPT).href);
    await reconcileCounts({ cwd: ctx.dir });
    const r2 = await reconcileCounts({ cwd: ctx.dir });
    assert.equal(r2.stateChanged, false, 'second call should report stateChanged=false');
    assert.equal(r2.manifestChanged, false, 'second call should report manifestChanged=false');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 6: empty workspace — counts populated as 0, no error', async () => {
  const ctx = await setupWorkspace({});
  try {
    const { reconcileCounts } = await import(pathToFileURL(SCRIPT).href);
    const r = await reconcileCounts({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    const state = JSON.parse(await readFile(path.join(ctx.brainDir, 'state.json'), 'utf8'));
    assert.equal(state.counts.council_sessions, 0);
    assert.equal(state.counts.evidence_artifacts, 0);
  } finally {
    await ctx.cleanup();
  }
});
