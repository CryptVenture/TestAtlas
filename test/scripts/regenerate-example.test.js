// test/scripts/regenerate-example.test.js
//
// Plan 08-01 Task 2 — orchestrator + regenerate-core lib tests.
//
// Strategy: use a synthetic minimal example fixture under tmpdir so this
// test does NOT depend on examples/node-api or examples/cli-tool existing
// (those land in Tasks 3 and 4).

import { strict as assert } from 'node:assert';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import {
  diffTrees,
  flagifyArgs,
  loadAndValidateScript,
  regenerateExample,
} from '../../scripts/lib/regenerate-core.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { makeSyntheticExample, REPO_ROOT, runRegenerate } from '../examples/_helpers.js';

const FIXED_TS = '2026-05-03T00:00:00.000Z';

/** A minimal valid script — init only. */
function minimalScript(name = 'mini') {
  return {
    $schema: '../../../.testatlas/schemas/example-script.schema.json',
    exampleName: name,
    fixedTimestamp: FIXED_TS,
    steps: [{ id: 'init', command: 'init-workspace' }],
  };
}

/** A script with a domain + flow + issue + indexes. */
function richScript(name = 'rich') {
  return {
    exampleName: name,
    fixedTimestamp: FIXED_TS,
    steps: [
      { id: 'init', command: 'init-workspace' },
      {
        id: 'domain-core',
        command: 'create-domain',
        args: { name: 'core', purpose: 'Core domain for the synthetic example' },
      },
      {
        id: 'flow-bootstrap',
        command: 'create-flow',
        args: {
          name: 'Bootstrap',
          domain: 'domain-core',
          persona: 'developer',
          goal: 'Get the example up and running',
        },
      },
      {
        id: 'evidence-boot',
        command: 'create-evidence-record',
        args: {
          type: 'log',
          description: 'Synthetic boot log captured during example replay',
        },
      },
      {
        id: 'issue-noop',
        command: 'create-issue',
        args: {
          title: 'Synthetic placeholder issue for replay tests',
          domain: 'domain-core',
          severity: 'low',
          confidence: 'confirmed',
          evidence: 'EVIDENCE-001',
        },
      },
      { id: 'indexes', command: 'update-indexes' },
      { id: 'sync', command: 'sync-status' },
    ],
  };
}

// ─────────────────────────────── Pure unit tests ───────────────────────────────

test('flagifyArgs: handles strings, numbers, arrays, booleans, kebab keys', () => {
  const out = flagifyArgs({
    title: 'Hello',
    domain: 'domain-x',
    evidence: ['EVIDENCE-001', 'EVIDENCE-002'],
    dryRun: true,
    quiet: false,
    count: 3,
  });
  assert.deepEqual(out, [
    '--title',
    'Hello',
    '--domain',
    'domain-x',
    '--evidence',
    'EVIDENCE-001',
    '--evidence',
    'EVIDENCE-002',
    '--dry-run',
    '--count',
    '3',
  ]);
});

test('loadAndValidateScript: rejects malformed JSON before any side effect', async (t) => {
  const ex = await makeSyntheticExample({ name: 'bad', script: minimalScript('bad') });
  t.after(ex.cleanup);
  // Overwrite the file with malformed JSON.
  await writeFile(ex.fixturePath, '{ this is not json', 'utf8');
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  await assert.rejects(
    () => loadAndValidateScript(ex.fixturePath, ajv),
    (err) => err.code === 'TESTATLAS_INVALID_EXAMPLE_SCRIPT',
  );
});

test('loadAndValidateScript: rejects schema-invalid script (no exampleName)', async (t) => {
  const ex = await makeSyntheticExample({
    name: 'bad2',
    script: { fixedTimestamp: FIXED_TS, steps: [{ id: 'init', command: 'init-workspace' }] },
  });
  t.after(ex.cleanup);
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  await assert.rejects(
    () => loadAndValidateScript(ex.fixturePath, ajv),
    (err) => err.code === 'TESTATLAS_INVALID_EXAMPLE_SCRIPT',
  );
});

test('diffTrees: returns ok:true on identical trees', async (t) => {
  const ex = await makeSyntheticExample({ name: 'difftest', script: minimalScript('difftest') });
  t.after(ex.cleanup);
  const r = await diffTrees(ex.examplePath, ex.examplePath);
  assert.equal(r.ok, true);
});

// ─────────────────────────────── Orchestrator tests ───────────────────────────────

test('regenerateExample: writes a workspace from a minimal script (init only)', async (t) => {
  const ex = await makeSyntheticExample({ name: 'mini', script: minimalScript('mini') });
  t.after(ex.cleanup);
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const r = await regenerateExample({
    examplePath: ex.examplePath,
    suiteRoot: REPO_ROOT,
    ajv,
  });
  assert.ok(r.ok, `regenerateExample failed: ${JSON.stringify(r)}`);
  // Workspace should now exist with manifest.
  const manifestPath = path.join(ex.examplePath, '_testatlas', '11_workspace_manifest.json');
  const s = await stat(manifestPath);
  assert.ok(s.isFile(), 'manifest should exist after regenerateExample');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.lastUpdatedAt, FIXED_TS, 'manifest timestamp should equal fixed-ts');
});

test('regenerateExample: rich script — emits domain + flow + issue + evidence + indexes', async (t) => {
  const ex = await makeSyntheticExample({ name: 'rich', script: richScript('rich') });
  t.after(ex.cleanup);
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const r = await regenerateExample({
    examplePath: ex.examplePath,
    suiteRoot: REPO_ROOT,
    ajv,
  });
  assert.ok(r.ok, `regenerateExample failed: ${JSON.stringify(r)}`);
  const wsRoot = path.join(ex.examplePath, '_testatlas');

  // Domain dir should exist.
  const domain = await stat(path.join(wsRoot, 'domains', 'core', 'domain.json'));
  assert.ok(domain.isFile());

  // Flow file should exist.
  const flow = await stat(path.join(wsRoot, 'flows', 'FLOW-core-bootstrap.json'));
  assert.ok(flow.isFile());

  // Evidence dir.
  const evidence = await stat(path.join(wsRoot, 'evidence', 'EVIDENCE-001', 'evidence.json'));
  assert.ok(evidence.isFile());

  // Issue file (slug derived from title).
  const issueDir = path.join(wsRoot, 'to_fix');
  const entries = await import('node:fs/promises').then((m) => m.readdir(issueDir));
  const issueJson = entries.find((n) => n.startsWith('ISSUE-') && n.endsWith('.json'));
  assert.ok(issueJson, 'an issue should have been created');
});

test('regenerateExample: idempotent — replay twice → second run is byte-identical', async (t) => {
  const ex = await makeSyntheticExample({ name: 'idem', script: richScript('idem') });
  t.after(ex.cleanup);
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });

  const r1 = await regenerateExample({ examplePath: ex.examplePath, suiteRoot: REPO_ROOT, ajv });
  assert.ok(r1.ok, `first run: ${JSON.stringify(r1)}`);

  // Second run should re-init + re-replay; --check should pass (no drift).
  const r2 = await regenerateExample({
    examplePath: ex.examplePath,
    suiteRoot: REPO_ROOT,
    ajv,
    check: true,
  });
  assert.ok(r2.ok, `second --check run drift: ${JSON.stringify(r2.drift)}`);
});

test('regenerateExample: --check exits with drift after a workspace mutation', async (t) => {
  const ex = await makeSyntheticExample({ name: 'drift', script: richScript('drift') });
  t.after(ex.cleanup);
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });

  const r1 = await regenerateExample({ examplePath: ex.examplePath, suiteRoot: REPO_ROOT, ajv });
  assert.ok(r1.ok);

  // Mutate a workspace file.
  const overview = path.join(ex.examplePath, '_testatlas', '00_overview.md');
  await writeFile(overview, 'TAINTED CONTENT — should produce drift\n', 'utf8');

  const r2 = await regenerateExample({
    examplePath: ex.examplePath,
    suiteRoot: REPO_ROOT,
    ajv,
    check: true,
  });
  assert.equal(r2.ok, false, '--check should detect drift after mutation');
  assert.ok(Array.isArray(r2.drift) && r2.drift.length > 0, 'drift entries expected');
  const driftPaths = r2.drift.map((d) => d.path);
  assert.ok(
    driftPaths.includes('00_overview.md'),
    `00_overview.md should be in drift: ${driftPaths.join(', ')}`,
  );
});

test('regenerate-example.js CLI: --check (script-binary path) exits 0 on no drift', async (t) => {
  const ex = await makeSyntheticExample({ name: 'cli', script: minimalScript('cli') });
  t.after(ex.cleanup);

  // Populate first.
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const r1 = await regenerateExample({ examplePath: ex.examplePath, suiteRoot: REPO_ROOT, ajv });
  assert.ok(r1.ok);

  const child = await runRegenerate(ex.examplePath, { check: true });
  assert.equal(
    child.code,
    0,
    `expected 0, got ${child.code}\nstdout:${child.stdout}\nstderr:${child.stderr}`,
  );
});

test('regenerate-example.js CLI: --check exits non-zero on drift', async (t) => {
  const ex = await makeSyntheticExample({ name: 'cli-drift', script: minimalScript('cli-drift') });
  t.after(ex.cleanup);

  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  await regenerateExample({ examplePath: ex.examplePath, suiteRoot: REPO_ROOT, ajv });

  // Tamper.
  const overview = path.join(ex.examplePath, '_testatlas', '00_overview.md');
  await writeFile(overview, 'tampered\n', 'utf8');

  const child = await runRegenerate(ex.examplePath, { check: true });
  assert.notEqual(child.code, 0, 'should exit nonzero on drift');
});
