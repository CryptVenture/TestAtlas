// Wave 0 — Buckets #11 + #12 (E2E pipeline scaffold, env-gated).
//
// This is intentionally a SCAFFOLD. Plan 09-05 fills in the body that runs
// the full command graph (init → explore → map-domains → plan → test-flow
// → report) against examples/node-api/ in two modes:
//
//   #11 parallel-spawn:    executionMode: "parallel-subagents"
//   #12 sequential-fallback: TESTATLAS_FORCE_SEQUENTIAL=1, executionMode: "sequential-fallback"
//
// Gate: TESTATLAS_E2E=1 environment variable. When unset (default in normal
// CI), both tests are SKIPPED with a documented reason. They do NOT fail and
// they do NOT run any real harness. The `assert.fail(...)` body is the
// contract for Plan 09-05 — it only executes when E2E is enabled (and Plan
// 09-05 will replace it with the real harness).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const E2E = process.env.TESTATLAS_E2E === '1';
const SKIP_REASON = 'set TESTATLAS_E2E=1 to enable end-to-end pipeline tests';

test('E2E parallel-spawn graph against examples/node-api', {
  skip: E2E ? false : SKIP_REASON,
}, async () => {
  assert.fail(
    'Plan 09-05 must implement this — runs init → explore → map-domains → plan → test-flow → report ' +
      'against examples/node-api with executionMode: "parallel-subagents" and asserts the final ' +
      'REPORT-latest.md schema-validates against report.schema.json.',
  );
});

test('E2E sequential-fallback graph against examples/node-api', {
  skip: E2E ? false : SKIP_REASON,
}, async () => {
  assert.fail(
    'Plan 09-05 must implement this — same graph as parallel-spawn but with TESTATLAS_FORCE_SEQUENTIAL=1 ' +
      'set; asserts executionMode: "sequential-fallback" appears in run records and that the report ' +
      'still schema-validates (degradation path produces equivalent artifacts).',
  );
});
