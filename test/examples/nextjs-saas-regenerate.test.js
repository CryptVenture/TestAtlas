// test/examples/nextjs-saas-regenerate.test.js
//
// Plan 08-02 Task 2 — examples/nextjs-saas/ regenerate-clean assertions.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { loadAndValidateScript } from '../../scripts/lib/regenerate-core.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { REPO_ROOT, runRegenerate } from './_helpers.js';

const EXAMPLE = path.join(REPO_ROOT, 'examples', 'nextjs-saas');

test('nextjs-saas: package.json declares ESM + Node 20.11+ engines + next 15.x + react 19', async () => {
  const pkg = JSON.parse(await readFile(path.join(EXAMPLE, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.match(pkg.engines.node, /20\.11/);
  assert.match(pkg.dependencies.next, /^\^15\./);
  assert.match(pkg.dependencies.react, /^\^19\./);
  assert.match(pkg.dependencies['react-dom'], /^\^19\./);
  assert.equal(pkg.private, true);
});

test('nextjs-saas: regenerate --check exits 0 (no drift)', async () => {
  const r = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:${r.stdout}\nstderr:${r.stderr}`);
});

test('nextjs-saas: regenerate (no --check) is idempotent — second --check exits 0', async () => {
  const r1 = await runRegenerate(EXAMPLE);
  assert.equal(r1.code, 0);
  const r2 = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r2.code, 0, `idempotent --check after write; stderr:${r2.stderr}`);
});

test('nextjs-saas: fixture validates against example-script.schema.json', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const script = await loadAndValidateScript(
    path.join(EXAMPLE, '_testatlas-fixture', 'example-script.json'),
    ajv,
  );
  assert.equal(script.exampleName, 'nextjs-saas');
  const domains = script.steps.filter((s) => s.command === 'create-domain');
  const flows = script.steps.filter((s) => s.command === 'create-flow');
  const issues = script.steps.filter((s) => s.command === 'create-issue');
  assert.ok(domains.length >= 3, `expected ≥3 create-domain, got ${domains.length}`);
  assert.ok(flows.length >= 4, `expected ≥4 create-flow, got ${flows.length}`);
  assert.ok(issues.length >= 3, `expected ≥3 create-issue, got ${issues.length}`);
});

test('nextjs-saas: client login-form posts to /api/auth/login', async () => {
  const src = await readFile(path.join(EXAMPLE, 'components', 'login-form.js'), 'utf8');
  assert.match(src, /^['"]use client['"]/m, 'must be a Client Component');
  assert.match(src, /fetch\(['"]\/api\/auth\/login/, 'must POST to /api/auth/login');
});

test('nextjs-saas: login page imports LoginForm from components/login-form', async () => {
  const src = await readFile(path.join(EXAMPLE, 'app', '(auth)', 'login', 'page.js'), 'utf8');
  assert.match(src, /from ['"]@\/components\/login-form|from ['"]\.\.\/.+login-form/);
});
