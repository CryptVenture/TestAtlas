// Wave 0 scaffold filled in by Plan 09-05 (Wave 5).
//
// Buckets #11 + #12 (E2E pipeline). Both tests are gated on
// `TESTATLAS_E2E=1` so the default `pnpm test` continues to skip them
// and CI is unaffected. With the env flag set, both tests invoke
// `scripts/e2e/run-node-api-graph.js` as a subprocess and assert:
//
//   #11 parallel-spawn:    exit 0 + JSON.executionMode === "parallel-subagents"
//                          + reportPath points to an existing file.
//   #12 sequential-fallback: exit 0 + JSON.executionMode === "sequential-fallback".
//
// The harness itself is a fixture-replay (programmatic init + report);
// it does NOT call out to a real AI agent. Real-agent runs are
// documented as a manual verification step in 09-VALIDATION.md.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const E2E = process.env.TESTATLAS_E2E === '1';
const SKIP_REASON = 'set TESTATLAS_E2E=1 to enable end-to-end pipeline tests';

const __thisFile = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__thisFile), '..', '..');
const HARNESS = path.join(REPO_ROOT, 'scripts', 'e2e', 'run-node-api-graph.js');

function runHarness(mode, extraEnv = {}) {
  const result = spawnSync('node', [HARNESS, `--mode=${mode}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    timeout: 60_000,
  });
  return result;
}

test('E2E parallel-spawn graph against examples/node-api', {
  skip: E2E ? false : SKIP_REASON,
}, async () => {
  const result = runHarness('parallel');
  assert.equal(
    result.status,
    0,
    `harness exited ${result.status}; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
  );
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(
    json.executionMode,
    'parallel-subagents',
    `expected executionMode "parallel-subagents", got "${json.executionMode}"`,
  );
  assert.ok(json.reportPath, 'harness output must include reportPath');
  assert.ok(
    existsSync(json.reportPath),
    `reportPath ${json.reportPath} does not exist on disk after harness run`,
  );
});

test('E2E sequential-fallback graph against examples/node-api', {
  skip: E2E ? false : SKIP_REASON,
}, async () => {
  const result = runHarness('sequential');
  assert.equal(
    result.status,
    0,
    `harness exited ${result.status}; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
  );
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(
    json.executionMode,
    'sequential-fallback',
    `expected executionMode "sequential-fallback", got "${json.executionMode}"`,
  );
  assert.ok(json.reportPath, 'harness output must include reportPath');
  assert.ok(
    existsSync(json.reportPath),
    `reportPath ${json.reportPath} does not exist on disk after harness run`,
  );
});
