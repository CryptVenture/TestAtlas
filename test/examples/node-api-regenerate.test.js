// test/examples/node-api-regenerate.test.js
//
// Plan 08-01 Task 3 — examples/node-api/ regenerate-clean assertions.

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { loadAndValidateScript } from '../../scripts/lib/regenerate-core.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { REPO_ROOT, runRegenerate } from './_helpers.js';

const EXAMPLE = path.join(REPO_ROOT, 'examples', 'node-api');
const WS = path.join(EXAMPLE, '_testatlas');

test('node-api: package.json declares ESM + Node 20.11+ engines + express 5', async () => {
  const pkg = JSON.parse(await readFile(path.join(EXAMPLE, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.match(pkg.engines.node, /20\.11/);
  assert.match(pkg.dependencies.express, /\^5\./);
});

test('node-api: server.js is plain ESM and mounts 4 routers', async () => {
  const src = await readFile(path.join(EXAMPLE, 'server.js'), 'utf8');
  assert.match(src, /^import express from 'express';/m, 'must use ESM imports');
  // Mounts 4 routers: health, auth, tasks, users.
  for (const r of ['health', 'auth', 'tasks', 'users']) {
    assert.match(src, new RegExp(`/api/${r}`), `must mount /api/${r}`);
  }
});

test('node-api: regenerate --check exits 0 (no drift)', async () => {
  const r = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:${r.stdout}\nstderr:${r.stderr}`);
});

test('node-api: regenerate (no --check) is idempotent — second --check exits 0', async () => {
  const r1 = await runRegenerate(EXAMPLE);
  assert.equal(r1.code, 0);
  const r2 = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r2.code, 0, `idempotent --check after write; stderr:${r2.stderr}`);
});

test('node-api: validate-workspace exits 0 against the checked-in _testatlas', async () => {
  // Use the regenerate runner indirectly by spawning validate-workspace.
  const { spawn } = await import('node:child_process');
  const code = await new Promise((resolve, reject) => {
    const c = spawn(
      'node',
      [path.join(REPO_ROOT, 'scripts/validate-workspace.js'), '--workspace', WS],
      { cwd: REPO_ROOT, stdio: 'ignore' },
    );
    c.on('error', reject);
    c.on('close', (n) => resolve(n ?? 0));
  });
  assert.equal(code, 0);
});

test('node-api: fixture validates against example-script.schema.json', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const script = await loadAndValidateScript(
    path.join(EXAMPLE, '_testatlas-fixture', 'example-script.json'),
    ajv,
  );
  assert.equal(script.exampleName, 'node-api');
  assert.ok(script.steps.length >= 10, `expected ≥10 steps, got ${script.steps.length}`);
});

test('node-api: at least one issue with severity medium and a slug containing delete-task or delete-api', async () => {
  const issues = await readdir(path.join(WS, 'to_fix'));
  const issueJsons = issues.filter((n) => n.startsWith('ISSUE-') && n.endsWith('.json'));
  assert.ok(issueJsons.length >= 3, `expected ≥3 seeded issues, got ${issueJsons.length}`);

  const records = await Promise.all(
    issueJsons.map((n) => readFile(path.join(WS, 'to_fix', n), 'utf8').then(JSON.parse)),
  );
  const mediums = records.filter((r) => r.severity === 'medium');
  assert.ok(mediums.length >= 1, 'expected at least one medium-severity issue');
  const slugs = records.map((r) => r.slug);
  assert.ok(
    slugs.some((s) => /delete-api-tasks-id|delete-task|missing-ownership/.test(s)),
    `expected NO-AUTH-ON-DELETE-TASK-style slug; got: ${slugs.join(', ')}`,
  );
});

test('node-api: _testatlas does NOT contain an .install-manifest.json (examples are checked-in source-of-truth)', async () => {
  const installManifest = path.join(WS, '.install-manifest.json');
  await assert.rejects(() => stat(installManifest), { code: 'ENOENT' });
});
