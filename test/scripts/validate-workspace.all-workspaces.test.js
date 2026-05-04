// test/scripts/validate-workspace.all-workspaces.test.js
//
// Plan 08-03 Task 1 — `--all-workspaces` flag + `discoverWorkspaces` helper.
//
// 7 unit tests for discoverWorkspaces() + 3 integration tests for the
// validate-workspace.js CLI's --all-workspaces code path.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverWorkspaces } from '../../scripts/lib/all-workspaces.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function makeTmpRoot(prefix = 'discover-ws-') {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

async function makeDir(...parts) {
  const p = path.join(...parts);
  await mkdir(p, { recursive: true });
  return p;
}

// ─────────────────────── discoverWorkspaces unit tests ───────────────────────

test('discoverWorkspaces: returns empty array when no _testatlas/ dirs exist', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeDir(root, 'src');
  await makeDir(root, 'docs');
  const r = await discoverWorkspaces(root);
  assert.deepEqual(r, []);
});

test('discoverWorkspaces: returns single path when one _testatlas/ exists at depth 0', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const ws = await makeDir(root, '_testatlas');
  const r = await discoverWorkspaces(root);
  assert.deepEqual(r, [ws]);
});

test('discoverWorkspaces: returns multiple paths sorted lexically when multiple exist at varying depths', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const wsRoot = await makeDir(root, '_testatlas');
  const wsApi = await makeDir(root, 'apps', 'api', '_testatlas');
  const wsWeb = await makeDir(root, 'apps', 'web', '_testatlas');
  const r = await discoverWorkspaces(root);
  // Walk-order: directory entries are visited in lexical order at each
  // depth. With localeCompare, `_testatlas` (leading underscore) sorts
  // before `apps`, so the root workspace is discovered first; then
  // `apps/` is walked, yielding `api/_testatlas` before `web/_testatlas`.
  assert.deepEqual(r, [wsRoot, wsApi, wsWeb]);
});

test('discoverWorkspaces: prunes node_modules/<anything>/_testatlas (does NOT descend into node_modules)', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeDir(root, 'node_modules', 'pkg-a', '_testatlas');
  await makeDir(root, 'node_modules', '_testatlas');
  const wsReal = await makeDir(root, 'apps', 'web', '_testatlas');
  const r = await discoverWorkspaces(root);
  assert.deepEqual(r, [wsReal]);
});

test('discoverWorkspaces: prunes .git, dist, build, .next, .expo, coverage', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prune of ['.git', 'dist', 'build', '.next', '.expo', 'coverage']) {
    await makeDir(root, prune, '_testatlas');
  }
  const wsReal = await makeDir(root, 'src', '_testatlas');
  const r = await discoverWorkspaces(root);
  assert.deepEqual(r, [wsReal]);
});

test('discoverWorkspaces: does NOT match .testatlas/ (suite tree, not workspace tree)', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  // .testatlas is the SUITE tree (instructions, schemas) — not a workspace.
  await makeDir(root, '.testatlas');
  await makeDir(root, '.testatlas', 'schemas');
  // Real workspace alongside.
  const wsReal = await makeDir(root, '_testatlas');
  const r = await discoverWorkspaces(root);
  assert.deepEqual(r, [wsReal]);
});

test('discoverWorkspaces: returns absolute paths even when given a relative rootPath', async (t) => {
  const root = await makeTmpRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await makeDir(root, '_testatlas');
  // Compute a relative path from cwd to root.
  const rel = path.relative(process.cwd(), root);
  const r = await discoverWorkspaces(rel);
  assert.equal(r.length, 1);
  assert.ok(path.isAbsolute(r[0]), `expected absolute path, got: ${r[0]}`);
});

// ───────────────── Integration tests for --all-workspaces CLI ─────────────────

/**
 * Build a fixture tree with N valid `_testatlas/` workspaces by copying the
 * known-good examples/node-api/_testatlas tree into multiple subpaths.
 *
 * @param {string} rootDir
 * @param {string[]} subpaths e.g. ['_testatlas', 'apps/web/_testatlas', 'apps/api/_testatlas']
 */
async function seedMonorepoFixture(rootDir, subpaths) {
  const src = path.join(REPO_ROOT, 'examples', 'node-api', '_testatlas');
  for (const sub of subpaths) {
    const dst = path.join(rootDir, sub);
    await mkdir(path.dirname(dst), { recursive: true });
    await cp(src, dst, { recursive: true });
  }
}

function runValidate(argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(REPO_ROOT, 'scripts/validate-workspace.js'), ...argv], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

test('--all-workspaces: validates 3 healthy workspaces and exits 0 with per-workspace summary + aggregate', async (t) => {
  const root = await makeTmpRoot('all-ws-ok-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedMonorepoFixture(root, ['_testatlas', 'apps/api/_testatlas', 'apps/web/_testatlas']);
  const r = await runValidate(['--all-workspaces', root]);
  assert.equal(r.code, 0, `expected exit 0; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  // Per-workspace block: each path appears in stdout.
  assert.match(r.stdout, /apps\/api\/_testatlas/);
  assert.match(r.stdout, /apps\/web\/_testatlas/);
  // Aggregate line.
  assert.match(r.stdout, /OK 3\/3/, `expected aggregate "OK 3/3"; got:\n${r.stdout}`);
});

test('--all-workspaces: any failing workspace causes non-zero exit and the failure is named in aggregate', async (t) => {
  const root = await makeTmpRoot('all-ws-fail-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await seedMonorepoFixture(root, ['_testatlas', 'apps/api/_testatlas', 'apps/web/_testatlas']);
  // Mutate one workspace to introduce a violation: corrupt the manifest.
  const badManifest = path.join(root, 'apps/web/_testatlas', '11_workspace_manifest.json');
  await writeFile(badManifest, '{ "this": "not-valid-against-schema" }', 'utf8');

  const r = await runValidate(['--all-workspaces', root]);
  assert.notEqual(r.code, 0, `expected nonzero exit; stdout:\n${r.stdout}`);
  // The failing workspace must appear in the aggregate line.
  assert.match(r.stdout, /FAIL/);
  assert.match(r.stdout, /apps\/web\/_testatlas/);
});

test('--all-workspaces: mutually exclusive with --workspace; using both exits non-zero with clear error', async () => {
  const r = await runValidate(['--workspace', '/tmp/foo', '--all-workspaces', '/tmp/bar']);
  assert.notEqual(r.code, 0);
  assert.match(
    r.stderr + r.stdout,
    /not both|mutually exclusive|--workspace.*--all-workspaces|--all-workspaces.*--workspace/i,
    `expected mutual-exclusion error; got stderr:\n${r.stderr}\nstdout:\n${r.stdout}`,
  );
});
