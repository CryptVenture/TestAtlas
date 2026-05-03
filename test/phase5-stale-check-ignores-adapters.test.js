// test/phase5-stale-check-ignores-adapters.test.js
//
// Pitfall 1 regression test (.planning/phases/06-adapter-layer/06-RESEARCH.md
// §Pitfall 1).
//
// Phase 5's `check-stale-generated-sections` walks the workspace tree (the
// `_testatlas/` workspace dir handed to validateWorkspace) — NOT the suite
// tree at `.testatlas/`. Phase 6's adapter trees live under
// `.testatlas/adapters/<name>/...` and use the same TESTATLAS:GENERATED
// marker syntax as the workspace's generated sections. A careless future
// change to walkWorkspace() that started crossing into `.testatlas/` would
// flag every adapter file as drift (false positive) — this test pins that
// invariant.
//
// The test:
//   1. Build a tmp workspace fixture (`_testatlas/`) via the existing
//      makeValidationFixture helper.
//   2. Place a deliberately-mismatched adapter file under
//      `.testatlas/adapters/<dummy>/` (the suite tree, NOT the workspace).
//   3. Run validateWorkspace against the workspace.
//   4. Assert the report does NOT mention any path under `.testatlas/adapters/`.

import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { validateWorkspace } from '../scripts/validate-workspace.js';
import { makeValidationFixture } from './_helpers.js';

test('Phase 5 stale-section check ignores .testatlas/adapters/ tree', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Place a deliberately-mismatched generated section under the suite tree's
  // adapter dir (NOT the workspace `_testatlas/`). If the stale-section check
  // were mistakenly walking `.testatlas/`, it would surface this file.
  const dummyAdapterDir = path.join(fx.tmp, '.testatlas', 'adapters', 'dummy-regression');
  await mkdir(dummyAdapterDir, { recursive: true });
  await writeFile(
    path.join(dummyAdapterDir, 'fake-derived.md'),
    [
      '<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/init.md" hash="0000000000000000" -->',
      'Body content that intentionally does NOT match any real source hash.',
      '<!-- TESTATLAS:GENERATED:END section="adapter-body" -->',
      '',
    ].join('\n'),
    'utf8',
  );

  const result = await validateWorkspace({ cwd: fx.tmp });

  // Every finding's `path` field should reference workspace-relative paths
  // (e.g. "11_workspace_manifest.json") — never anything starting with
  // `.testatlas/adapters/`.
  for (const r of result.results) {
    for (const f of r.findings) {
      const p = f.path ?? '';
      assert.equal(
        p.includes('.testatlas/adapters'),
        false,
        `validate-workspace must not surface .testatlas/adapters paths; got finding: ${JSON.stringify(f)}`,
      );
      assert.equal(
        p.includes('dummy-regression'),
        false,
        `validate-workspace must not surface dummy-regression dir; got finding: ${JSON.stringify(f)}`,
      );
    }
  }
});
