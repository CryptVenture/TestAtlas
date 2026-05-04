// test/examples/_helpers.js
//
// Plan 08-01 Task 2 — shared helpers for the regenerate-example.js test
// surface and the per-example tests in plans 08-01..05.

import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Stage a synthetic example tree under tmpdir for regenerate tests. The tree
 * mirrors the canonical layout:
 *   <tmp>/<name>/
 *     ├── _testatlas-fixture/example-script.json   (caller-provided)
 *     └── (no _testatlas yet — to be regenerated)
 *
 * The repo's `.testatlas/` suite tree is NOT copied — regenerate-core.js
 * resolves emitter scripts from `suiteRoot`, which the test passes as the
 * REPO_ROOT.
 *
 * @param {{ name: string, script: object }} opts
 * @returns {Promise<{ examplePath: string, fixturePath: string, cleanup: () => Promise<void> }>}
 */
export async function makeSyntheticExample({ name, script }) {
  const tmp = await mkdtemp(path.join(tmpdir(), `regen-ex-${name}-`));
  const examplePath = path.join(tmp, name);
  const fixtureDir = path.join(examplePath, '_testatlas-fixture');
  await mkdir(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, 'example-script.json');
  await writeFile(fixturePath, `${JSON.stringify(script, null, 2)}\n`, 'utf8');
  return {
    examplePath,
    fixturePath,
    cleanup: () => rm(tmp, { recursive: true, force: true }),
  };
}

/**
 * Run regenerate-example.js as a child process; return {code, stdout, stderr}.
 *
 * @param {string} examplePath
 * @param {{ check?: boolean }} [opts]
 */
export function runRegenerate(examplePath, opts = {}) {
  return new Promise((resolve, reject) => {
    const argv = [path.join(REPO_ROOT, 'scripts/regenerate-example.js'), examplePath];
    if (opts.check) argv.push('--check');
    const child = spawn('node', argv, {
      cwd: REPO_ROOT,
      env: { ...process.env },
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
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Snapshot a checked-in `_testatlas/` directory to a temp tar — used so we
 * can mutate, run --check, then restore for tests that need to leave the
 * repo state clean.
 *
 * Simpler alternative: copy the tree to a sibling tmp dir, mutate the tmp
 * copy.
 *
 * @param {string} src absolute path to the workspace dir
 * @returns {Promise<{ snapshot: string, cleanup: () => Promise<void> }>}
 */
export async function snapshotTree(src) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'regen-snap-'));
  const snapshot = path.join(tmp, 'tree');
  await cp(src, snapshot, { recursive: true });
  return {
    snapshot,
    cleanup: () => rm(tmp, { recursive: true, force: true }),
  };
}
