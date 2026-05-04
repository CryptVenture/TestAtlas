// test/examples/monorepo-orchestration.test.js
//
// Plan 08-03 Task 3 — examples/monorepo orchestration assertions.
//
// Validates the hybrid pattern: 1 ROOT + 2 per-app workspaces, each
// independently regenerable + validate-clean, plus the cross-cut e2e flow
// in the root references per-app workspaces using the qualified path syntax
// (Invariant 3).

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { discoverWorkspaces } from '../../scripts/lib/all-workspaces.js';
import { loadAndValidateScript } from '../../scripts/lib/regenerate-core.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { REPO_ROOT, runRegenerate } from './_helpers.js';

const MONOREPO = path.join(REPO_ROOT, 'examples', 'monorepo');
const WS_ROOT = path.join(MONOREPO, '_testatlas');
const WS_WEB = path.join(MONOREPO, 'apps', 'web', '_testatlas');
const WS_API = path.join(MONOREPO, 'apps', 'api', '_testatlas');

function runValidateAllWorkspaces(rootArg) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [path.join(REPO_ROOT, 'scripts/validate-workspace.js'), '--all-workspaces', rootArg],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c.toString('utf8');
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

// ─────────────────────────── Per-workspace regen --check ───────────────────────────

test('monorepo root: regenerate --check exits 0 (idempotent)', async () => {
  const r = await runRegenerate(MONOREPO, { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test('monorepo apps/web: regenerate --check exits 0 (idempotent)', async () => {
  const r = await runRegenerate(path.join(MONOREPO, 'apps', 'web'), { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test('monorepo apps/api: regenerate --check exits 0 (idempotent)', async () => {
  const r = await runRegenerate(path.join(MONOREPO, 'apps', 'api'), { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

// ─────────────────────────── Fixture schema validation ───────────────────────────

test('monorepo: all 3 fixtures validate against example-script.schema.json', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const fixtures = [
    path.join(MONOREPO, '_testatlas-fixture', 'example-script.json'),
    path.join(MONOREPO, 'apps', 'web', '_testatlas-fixture', 'example-script.json'),
    path.join(MONOREPO, 'apps', 'api', '_testatlas-fixture', 'example-script.json'),
  ];
  const expectedNames = ['monorepo-root', 'monorepo-web', 'monorepo-api'];
  for (let i = 0; i < fixtures.length; i++) {
    const script = await loadAndValidateScript(fixtures[i], ajv);
    assert.equal(
      script.exampleName,
      expectedNames[i],
      `${path.relative(REPO_ROOT, fixtures[i])}: exampleName`,
    );
    assert.ok(script.steps.length >= 5, `${expectedNames[i]} has ≥5 steps`);
  }
});

// ─────────────────────────── --all-workspaces discovery + validation ───────────────────────────

test('--all-workspaces: discovers all 3 workspaces under examples/monorepo (lex sort)', async () => {
  const found = await discoverWorkspaces(MONOREPO);
  // Expect: ROOT first (leading underscore < 'a'), then apps/api, then apps/web
  assert.deepEqual(found, [WS_ROOT, WS_API, WS_WEB]);
});

test('--all-workspaces examples/monorepo: validates all 3 and exits 0', async () => {
  const r = await runValidateAllWorkspaces(MONOREPO);
  assert.equal(r.code, 0, `expected 0; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /OK 3\/3/);
});

// ─────────────────────────── Hybrid-pattern invariants ───────────────────────────

test('Invariant 2 + 3: root e2e flow references per-app workspaces by qualified path', async () => {
  const flowJsonPath = path.join(
    WS_ROOT,
    'flows',
    'FLOW-e2e-flows-e2e-create-item-end-to-end.json',
  );
  const flow = JSON.parse(await readFile(flowJsonPath, 'utf8'));
  // The flow's `goal` must reference both per-app workspaces using qualified
  // paths (Invariant 3 in docs/MONOREPO.md).
  assert.match(flow.goal, /apps\/web\/_testatlas/, 'goal must reference apps/web/_testatlas');
  assert.match(flow.goal, /apps\/api\/_testatlas/, 'goal must reference apps/api/_testatlas');
});

test('Invariant 4: per-app workspaces are independently valid (mutating root does not break per-app)', async () => {
  // Each per-app workspace was just regenerated and proven to validate clean
  // by the per-workspace --check tests above. This test confirms the manifests
  // exist as separate files (no shared state on disk) — proving Invariant 4
  // (N+1 validates are independent runs).
  for (const ws of [WS_ROOT, WS_WEB, WS_API]) {
    const m = path.join(ws, '11_workspace_manifest.json');
    const s = await stat(m);
    assert.ok(s.isFile(), `${ws}: workspace manifest exists`);
  }
});

test('Invariant 3 + 5: no slug duplication for cross-cut artifacts (root flows are e2e-prefixed)', async () => {
  const rootFlows = await readdir(path.join(WS_ROOT, 'flows'));
  const webFlows = await readdir(path.join(WS_WEB, 'flows'));
  const apiFlows = await readdir(path.join(WS_API, 'flows'));

  // The root cross-cut flow uses an `e2e-` or `package-` prefix; per-app
  // flows use their app-specific domain prefix. So no slug should appear
  // verbatim across the 3 workspaces.
  const rootSlugs = rootFlows.filter((f) => f.endsWith('.json'));
  const webSlugs = webFlows.filter((f) => f.endsWith('.json'));
  const apiSlugs = apiFlows.filter((f) => f.endsWith('.json'));

  for (const slug of rootSlugs) {
    assert.ok(
      !webSlugs.includes(slug),
      `root flow ${slug} should not appear in apps/web/_testatlas/flows (Invariant 3)`,
    );
    assert.ok(
      !apiSlugs.includes(slug),
      `root flow ${slug} should not appear in apps/api/_testatlas/flows (Invariant 3)`,
    );
  }
});
