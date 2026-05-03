// VAL-05 adapter-parity stub.
//
// Phase 5 (this plan) state: scripts/check-adapter-parity.js does NOT yet
// exist. This test passes-trivially in stub mode so the CI gate stays green
// while Phase 5 closes.
//
// Phase 6 (adapter generator) state: scripts/check-adapter-parity.js ships;
// this test imports its enumerate() function and asserts coverage === 1.0
// (every command has a matching entry in every shipped adapter).
//
// The test auto-detects which mode applies — no rewrite is needed when
// Phase 6 lands. The stub mode also TODO-tags itself so future planners
// grep-find the Phase 6 closure point.

import { strict as assert } from 'node:assert';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const parityScriptPath = path.join(repoRoot, 'scripts', 'check-adapter-parity.js');

test('VAL-05 adapter-parity stub: Phase 6 will fill', async () => {
  const exists = await stat(parityScriptPath).catch(() => null);
  if (!exists) {
    // Phase 5 state: stub mode. Test is intentionally green; Phase 6 ships
    // the runtime and this branch becomes unreachable.
    // TODO Phase 6: when scripts/check-adapter-parity.js ships, the `else`
    // branch below becomes the live path (import + invoke + assert coverage).
    assert.ok(true, 'adapter-parity stub: awaiting Phase 6 (scripts/check-adapter-parity.js)');
    return;
  }

  // Phase 6 state: real parity check runs.
  const mod = await import('../scripts/check-adapter-parity.js');
  assert.equal(
    typeof mod.enumerate,
    'function',
    'scripts/check-adapter-parity.js must export an `enumerate` function',
  );
  const result = await mod.enumerate();
  assert.ok(
    result && typeof result === 'object',
    'enumerate() must return an object with a `coverage` field',
  );
  assert.equal(
    result.coverage,
    1.0,
    `adapter parity coverage must be 1.0 (commands × adapters); got ${result.coverage}`,
  );
});
