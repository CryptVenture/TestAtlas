// test/examples/cli-tool-regenerate.test.js
//
// Plan 08-01 Task 4 — examples/cli-tool/ regenerate-clean assertions.
// 08-04 will extend this example with .aider.conf.yml + CONVENTIONS.md +
// a confidence: needs-validation issue.

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { loadAndValidateScript } from '../../scripts/lib/regenerate-core.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { REPO_ROOT, runRegenerate, snapshotTree } from './_helpers.js';

const EXAMPLE = path.join(REPO_ROOT, 'examples', 'cli-tool');
const WS = path.join(EXAMPLE, '_testatlas');

test('cli-tool: package.json declares ESM + Node 20.11+ engines + commander 14 + bin todo', async () => {
  const pkg = JSON.parse(await readFile(path.join(EXAMPLE, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.match(pkg.engines.node, /20\.11/);
  assert.match(pkg.dependencies.commander, /\^14\./);
  assert.equal(pkg.bin.todo, './bin/todo.js');
});

test('cli-tool: bin/todo.js is commander program with add/list/complete subcommands', async () => {
  const src = await readFile(path.join(EXAMPLE, 'bin', 'todo.js'), 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env node/);
  assert.match(src, /from 'commander'/);
  for (const sub of ['add', 'list', 'complete']) {
    assert.match(src, new RegExp(`\\.command\\('${sub}`), `must register subcommand ${sub}`);
  }
});

test('cli-tool: regenerate --check exits 0 (no drift)', async () => {
  const r = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:${r.stdout}\nstderr:${r.stderr}`);
});

test('cli-tool: regenerate is idempotent — write then --check both exit 0', async (t) => {
  // Snapshot to tmpdir to avoid racing with the *-validate.test.js companion
  // that reads from the same checked-in path concurrently.
  const { snapshot, cleanup } = await snapshotTree(EXAMPLE);
  t.after(cleanup);
  const r1 = await runRegenerate(snapshot);
  assert.equal(r1.code, 0);
  const r2 = await runRegenerate(snapshot, { check: true });
  assert.equal(r2.code, 0, `idempotent --check after write; stderr:${r2.stderr}`);
});

test('cli-tool: validate-workspace exits 0 against the checked-in _testatlas', async () => {
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

test('cli-tool: fixture validates against example-script.schema.json', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const script = await loadAndValidateScript(
    path.join(EXAMPLE, '_testatlas-fixture', 'example-script.json'),
    ajv,
  );
  assert.equal(script.exampleName, 'cli-tool');
});

test('cli-tool (08-04): Aider adapter present (.aider.conf.yml + CONVENTIONS.md), other adapter trees absent', async () => {
  // Plan 08-04 closes EX-07: cli-tool ships the Aider adapter ONLY.
  await stat(path.join(EXAMPLE, '.aider.conf.yml'));
  await stat(path.join(EXAMPLE, 'CONVENTIONS.md'));
  // Other adapter directories must remain absent.
  for (const adapter of ['.claude', '.opencode', '.cursor', '.kilo', '.kilocode']) {
    await assert.rejects(() => stat(path.join(EXAMPLE, adapter)), { code: 'ENOENT' });
  }
});

test('cli-tool: _testatlas has ≥3 flows (one per subcommand)', async () => {
  const flows = await readdir(path.join(WS, 'flows'));
  const flowJsons = flows.filter((n) => n.startsWith('FLOW-') && n.endsWith('.json'));
  assert.ok(
    flowJsons.length >= 3,
    `expected ≥3 flows, got ${flowJsons.length}: ${flowJsons.join(', ')}`,
  );
  // At minimum we expect flows that exercise each subcommand.
  const expected = ['add-todo', 'list-todos', 'complete-todo'];
  for (const slug of expected) {
    assert.ok(
      flowJsons.some((n) => n.includes(slug)),
      `expected a flow with slug containing ${slug}: ${flowJsons.join(', ')}`,
    );
  }
});
