// test/adapter-generator-idempotency.test.js
//
// Plan 06-01 Task 3: assembleAdapter MUST be deterministic — re-running it
// on identical inputs writes byte-identical output. This is the core
// invariant that makes the parity gate (Plan 06-02) possible.

import { strict as assert } from 'node:assert';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assembleAdapter } from '../scripts/assemble-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Build a minimal workspace mirror containing the bits assembleAdapter needs:
 *   - .testatlas/vocabulary.json (schema-loader prereq)
 *   - .testatlas/schemas/*.schema.json (all 17)
 *   - .testatlas/commands/*.md (the 32 sources)
 *   - .testatlas/adapters/adapter-capabilities.json
 *
 * Returns the temp workspace dir.
 */
async function buildWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-adapter-'));
  await mkdir(path.join(dir, '.testatlas', 'schemas'), { recursive: true });
  await mkdir(path.join(dir, '.testatlas', 'commands'), { recursive: true });
  await mkdir(path.join(dir, '.testatlas', 'adapters'), { recursive: true });

  await cp(
    path.join(repoRoot, '.testatlas', 'vocabulary.json'),
    path.join(dir, '.testatlas', 'vocabulary.json'),
  );
  await cp(path.join(repoRoot, '.testatlas', 'schemas'), path.join(dir, '.testatlas', 'schemas'), {
    recursive: true,
  });
  await cp(
    path.join(repoRoot, '.testatlas', 'commands'),
    path.join(dir, '.testatlas', 'commands'),
    { recursive: true },
  );
  await cp(
    path.join(repoRoot, '.testatlas', 'adapters', 'adapter-capabilities.json'),
    path.join(dir, '.testatlas', 'adapters', 'adapter-capabilities.json'),
  );
  return dir;
}

async function readDerivedTree(workspaceA) {
  const derivedDir = path.join(
    workspaceA,
    '.testatlas',
    'adapters',
    'claude-code',
    '.claude',
    'commands',
  );
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(derivedDir);
  const result = {};
  for (const name of entries.sort()) {
    result[name] = await readFile(path.join(derivedDir, name), 'utf8');
  }
  return result;
}

test('Test 6: idempotency — assembling twice produces byte-identical output', async () => {
  const wsA = await buildWorkspace();
  const wsB = await buildWorkspace();
  try {
    await assembleAdapter({ adapter: 'claude-code', workspace: wsA });
    await assembleAdapter({ adapter: 'claude-code', workspace: wsB });

    const treeA = await readDerivedTree(wsA);
    const treeB = await readDerivedTree(wsB);

    assert.deepEqual(
      Object.keys(treeA).sort(),
      Object.keys(treeB).sort(),
      'file lists must match across runs',
    );
    for (const name of Object.keys(treeA)) {
      assert.equal(treeA[name], treeB[name], `${name}: not byte-identical across runs`);
    }
  } finally {
    await rm(wsA, { recursive: true, force: true });
    await rm(wsB, { recursive: true, force: true });
  }
});

test('Test 6b: re-running into the same workspace writes nothing on second pass', async () => {
  const ws = await buildWorkspace();
  try {
    const first = await assembleAdapter({ adapter: 'claude-code', workspace: ws });
    const second = await assembleAdapter({ adapter: 'claude-code', workspace: ws });
    assert.equal(first.adapters[0].written.length, 32, 'first run writes 32 files');
    assert.equal(second.adapters[0].written.length, 0, 'second run writes nothing');
    assert.equal(second.adapters[0].unchanged.length, 32, 'second run reports 32 unchanged');
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test('Test 6c: --check mode reports zero drift on a freshly-generated workspace', async () => {
  const ws = await buildWorkspace();
  try {
    await assembleAdapter({ adapter: 'claude-code', workspace: ws });
    const checked = await assembleAdapter({ adapter: 'claude-code', workspace: ws, check: true });
    assert.equal(checked.exitCode, 0, 'exit code must be 0 when no drift');
    assert.equal(checked.adapters[0].drift.length, 0, 'drift list must be empty');
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test('Test 6d: hand-edit detection — modifying a derived file makes --check exit 1', async () => {
  const ws = await buildWorkspace();
  try {
    await assembleAdapter({ adapter: 'claude-code', workspace: ws });
    // Hand-edit one derived file.
    const target = path.join(
      ws,
      '.testatlas',
      'adapters',
      'claude-code',
      '.claude',
      'commands',
      'atlas-init.md',
    );
    const text = await readFile(target, 'utf8');
    await writeFile(target, `${text}\n<!-- malicious hand-edit -->\n`, 'utf8');

    const checked = await assembleAdapter({
      adapter: 'claude-code',
      workspace: ws,
      check: true,
    });
    assert.equal(checked.exitCode, 1, 'exit code must be 1 when drift detected');
    assert.equal(checked.adapters[0].drift.length, 1, 'one drift entry expected');
    assert.match(checked.adapters[0].drift[0], /atlas-init\.md$/);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});
