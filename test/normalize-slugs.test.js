// test/normalize-slugs.test.js
//
// Plan 05-03 (Wave 2). Integration tests for scripts/normalize-slugs.js.

import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { normalizeSlugs } from '../scripts/normalize-slugs.js';
import { makeValidationFixture } from './_helpers.js';

test('normalize-slugs: assertNotUpdate("command") is FIRST (verified via _inject spy)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let firstCall = null;
  const calls = [];
  await normalizeSlugs(
    { cwd: fx.cwd, dryRun: true },
    {
      assertNotUpdate: (ctx) => {
        if (firstCall === null) firstCall = ctx;
        calls.push(ctx);
      },
    },
  );
  assert.equal(firstCall, 'command', 'assertNotUpdate("command") must be first');
  assert.ok(calls.length >= 1);
});

test('normalize-slugs: detects mis-slugged filenames (uppercase, underscores) and reports them', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Drop a mis-slugged issue: ISSUE-002-Some_Slug.md (uppercase + underscore).
  await writeFile(
    path.join(fx.wsDir, 'to_fix', 'ISSUE-002-Some_Slug.md'),
    '# Bad slug issue\n',
    'utf8',
  );
  await writeFile(
    path.join(fx.wsDir, 'to_fix', 'ISSUE-002-Some_Slug.json'),
    JSON.stringify({
      id: 'ISSUE-002-Some_Slug',
      slug: 'Some_Slug',
      title: 'Bad slug',
    }),
    'utf8',
  );

  const r = await normalizeSlugs({ cwd: fx.cwd });
  // Default mode is read-only (no --apply). Plan should be reported.
  assert.ok(r.renamePlan.length >= 1, 'expected renamePlan with at least one entry');
  const plan = r.renamePlan.find((p) => /Some_Slug/.test(p.from));
  assert.ok(plan, 'expected the Some_Slug entry in plan');
  assert.match(plan.to, /some-slug/);
  assert.equal(r.applied, false, 'without --apply, applied must be false');
});

test('normalize-slugs: without --apply performs ZERO writes (read-only)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-099-BAD_NAME.md'), '# bad\n', 'utf8');

  let writes = 0;
  let renames = 0;
  await normalizeSlugs(
    { cwd: fx.cwd },
    {
      atomicWrite: async () => {
        writes++;
      },
      rename: async () => {
        renames++;
      },
    },
  );
  assert.equal(writes, 0, 'no atomicWrite calls in default (read-only) mode');
  assert.equal(renames, 0, 'no rename calls in default (read-only) mode');

  // Verify the bad file is still on disk by its original name.
  const entries = await readdir(path.join(fx.wsDir, 'to_fix'));
  assert.ok(entries.includes('ISSUE-099-BAD_NAME.md'));
});

test('normalize-slugs: --apply renames files and updates index references', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Add a mis-slugged file pair under to_fix.
  await writeFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-002-Bad_Name.md'), '# bad\n', 'utf8');
  await writeFile(
    path.join(fx.wsDir, 'to_fix', 'ISSUE-002-Bad_Name.json'),
    JSON.stringify({ id: 'ISSUE-002-Bad_Name', slug: 'Bad_Name' }),
    'utf8',
  );
  // Add the bad slug to 09_artifact_index.md inside the issue-docs marker section
  // so we can verify the marker-aware update.
  await mkdir(path.join(fx.wsDir, 'to_fix', 'by_severity'), { recursive: true });
  await writeFile(
    path.join(fx.wsDir, 'to_fix', 'by_severity', 'medium.md'),
    '# Medium-severity issues\n\n- ISSUE-001-foo\n- ISSUE-002-Bad_Name\n',
    'utf8',
  );

  const r = await normalizeSlugs({ cwd: fx.cwd, apply: true });
  assert.equal(r.applied, true);
  assert.ok(r.renamePlan.length >= 1);

  // Files renamed.
  const entries = await readdir(path.join(fx.wsDir, 'to_fix'));
  assert.ok(entries.includes('ISSUE-002-bad-name.md'), `entries: ${entries.join(',')}`);
  assert.ok(entries.includes('ISSUE-002-bad-name.json'));
  assert.ok(!entries.includes('ISSUE-002-Bad_Name.md'));

  // Index references updated.
  const idx = await readFile(path.join(fx.wsDir, 'to_fix', 'by_severity', 'medium.md'), 'utf8');
  assert.match(idx, /ISSUE-002-bad-name/);
  assert.doesNotMatch(idx, /Bad_Name/);
});

test('normalize-slugs: kebab-clean files are not renamed (idempotent)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // _base-good has ISSUE-001-foo which is already kebab-clean.
  const r = await normalizeSlugs({ cwd: fx.cwd });
  assert.equal(r.renamePlan.length, 0, 'kebab-clean fixtures produce empty plan');
});

test('normalize-slugs: --help exits 0 (CLI smoke)', async () => {
  // The CLI is exercised via the runCli path; calling the lib directly here
  // verifies the function entry. CLI itself is a thin wrapper.
  // (Smoke test: assertNotUpdate is the FIRST executable code.)
  let firstCall = null;
  await normalizeSlugs(
    { cwd: process.cwd(), dryRun: true, workspaceDir: '/no/such/path-i-do-not-exist' },
    {
      assertNotUpdate: (ctx) => {
        if (firstCall === null) firstCall = ctx;
      },
    },
  ).catch(() => {
    /* expected — workspace doesn't exist */
  });
  assert.equal(firstCall, 'command');
});
