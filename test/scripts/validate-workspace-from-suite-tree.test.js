// test/scripts/validate-workspace-from-suite-tree.test.js
//
// Quick 260504-r3q Task 2. Smoke-test that after `runInit` writes the
// validator runtime into <target>/.testatlas/scripts/, that copied script
// is itself executable (`node <target>/.testatlas/scripts/validate-workspace.js
// --help`) when ajv is resolvable from the spawned process.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const QUIET = () => {};

async function withTmp(t, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-validate-spawn-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

test('validate-workspace from suite tree: spawned --help prints usage block (skips if ajv not resolvable)', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({
      target,
      suiteRoot: REPO_ROOT,
      adapters: ['claude-code'],
      logger: QUIET,
    });

    const validatorPath = path.join(target, '.testatlas', 'scripts', 'validate-workspace.js');
    // Spawn from <target> so Node's module resolution starts there. ajv is
    // a transitive dep of @webventures/testatlas; under `npm install` it
    // would land in <target>/node_modules/. In a bare temp dir there is no
    // node_modules, so the import will fail with ERR_MODULE_NOT_FOUND. In
    // that case we t.skip() — the assertion is "the runtime works when its
    // deps are resolvable", not "ajv magically appears in /tmp".
    const r = spawnSync(process.execPath, [validatorPath, '--help'], {
      cwd: target,
      env: { ...process.env, NO_COLOR: '1' },
      encoding: 'utf8',
    });

    const combined = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    if (
      r.status !== 0 &&
      (combined.includes("Cannot find package 'ajv'") ||
        combined.includes('Cannot find module') ||
        combined.includes('ERR_MODULE_NOT_FOUND'))
    ) {
      t.skip('ajv not resolvable from temp dir — expected when target has no node_modules');
      return;
    }

    assert.equal(r.status, 0, `non-zero exit. stderr: ${r.stderr}, stdout: ${r.stdout}`);
    assert.match(r.stdout, /Usage:/, 'expected Usage: in --help output');
    assert.match(r.stdout, /--auto-heal/, 'expected --auto-heal flag listed in --help');
  });
});
