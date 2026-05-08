// test/scripts/normalize-slugs-safety.test.js
//
// Phase 19-02 (B1) — capability-gate denial test for scripts/normalize-slugs.js.
//
// Asserts:
//   1. With safeMode:true (production default) + apply:true → throws
//      CAPABILITY_DENIED and the rename injection point is NEVER invoked
//      (zero filesystem mutation under denial).
//   2. With safeMode:true + apply:false (read-only path) → succeeds. The
//      gate fires only on the apply branch.
//   3. With safeMode:false + allowDestructiveActions:true + apply:true →
//      proceeds without throwing (gate doesn't false-positive when allowed).
//
// The fixture flow uses test/_helpers.js makeValidationFixture which copies
// the full .testatlas/ suite into a tmpdir so loadConfig({cwd}) resolves
// against real defaults + schema, exactly as it does in a consumer repo.

import { strict as assert } from 'node:assert';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { mock } from 'node:test';

import { normalizeSlugs } from '../../scripts/normalize-slugs.js';
import { makeValidationFixture } from '../_helpers.js';

test('normalize-slugs: safeMode:true blocks apply (zero FS mutation)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Place a mis-slugged artifact so the rename plan would be non-empty if
  // the gate were not wired in.
  await writeFile(
    path.join(fx.wsDir, 'to_fix', 'ISSUE-901-Bad_Slug_Name.md'),
    '# placeholder\n',
    'utf8',
  );
  await writeFile(
    path.join(fx.wsDir, 'to_fix', 'ISSUE-901-Bad_Slug_Name.json'),
    JSON.stringify({ id: 'ISSUE-901-Bad_Slug_Name', slug: 'Bad_Slug_Name', title: 'x' }),
    'utf8',
  );

  const renameSpy = mock.fn(async () => {});
  let caught;
  try {
    await normalizeSlugs({ cwd: fx.cwd, apply: true }, { rename: renameSpy });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, 'expected normalizeSlugs to throw under safeMode:true');
  assert.equal(
    caught.code,
    'CAPABILITY_DENIED',
    `got code=${caught?.code}; message=${caught?.message}`,
  );
  assert.equal(
    renameSpy.mock.callCount(),
    0,
    'no rename calls should occur under denial — the apply branch must short-circuit before any FS mutation',
  );
});

test('normalize-slugs: safeMode:true read-only (apply:false) is permitted', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const renameSpy = mock.fn(async () => {});
  const r = await normalizeSlugs({ cwd: fx.cwd, apply: false }, { rename: renameSpy });
  assert.ok(r);
  assert.equal(renameSpy.mock.callCount(), 0);
});

test('normalize-slugs: safeMode:false + allowDestructiveActions:true permits apply path', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Override config: turn safe mode OFF and allow destructive actions.
  await writeFile(
    path.join(fx.cwd, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }, null, 2),
    'utf8',
  );

  const renameSpy = mock.fn(async () => {});
  // Empty rename plan (no mis-slugged artifacts in the fixture) — assert NO
  // throw, just runs cleanly. Proves the gate doesn't false-positive when
  // explicitly allowed.
  const r = await normalizeSlugs({ cwd: fx.cwd, apply: true }, { rename: renameSpy });
  assert.ok(r);
});
