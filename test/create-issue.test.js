// test/create-issue.test.js
//
// Plan 05-01 Task 2 tests for scripts/create-issue.js:
//   - Happy path emits valid record (passes AJV).
//   - Empty `evidence` array throws TESTATLAS_NO_EVIDENCE.
//   - ID allocation = max(manifest.counts.issues, on-disk-max) + 1.
//   - assertNotUpdate('command') is the FIRST call.
//   - --dry-run writes ZERO files.

import { strict as assert } from 'node:assert';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { createIssue } from '../scripts/create-issue.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';
import { makeValidationFixture } from './_helpers.js';

const ISSUE_SCHEMA = 'https://testatlas.dev/schemas/v1/issue.schema.json';

test('createIssue: happy path — emits a record that AJV-validates against issue.schema.json', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await createIssue({
    cwd: fx.cwd,
    title: 'Email validation accepts spaces',
    domain: 'domain-auth',
    severity: 'high',
    confidence: 'confirmed',
    type: 'validation',
    summary: 'Email field accepts trailing spaces.',
    expectedBehavior: 'Trailing whitespace should be rejected.',
    actualBehavior: 'Form accepts and submits.',
    reproductionSteps: ['enter "a@b.com "', 'submit'],
    evidence: ['EVIDENCE-001'],
    acceptanceCriteria: ['form rejects trailing whitespace'],
  });

  assert.equal(r.validated, true);
  const written = JSON.parse(await readFile(r.jsonPath, 'utf8'));
  assert.match(written.id, /^ISSUE-\d{3,}-/);
  assert.equal(written.evidence[0], 'EVIDENCE-001');

  // Re-validate via AJV directly.
  const ajv = await loadAllSchemas({ cwd: fx.cwd });
  const v = ajv.getSchema(ISSUE_SCHEMA);
  assert.ok(v(written), `record must validate; errors: ${JSON.stringify(v.errors)}`);
});

test('createIssue: refuses empty evidence array with TESTATLAS_NO_EVIDENCE', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await assert.rejects(
    () =>
      createIssue({
        cwd: fx.cwd,
        title: 'No evidence finding',
        domain: 'domain-auth',
        evidence: [],
      }),
    (err) => err.code === 'TESTATLAS_NO_EVIDENCE',
  );
});

test('createIssue: ID allocation = max(manifest, disk) + 1', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Seed an ISSUE-005 on disk; the base-good manifest has counts.issues=1.
  // Expected next allocated id: 006.
  await writeFile(
    path.join(fx.wsDir, 'to_fix/ISSUE-005-existing.json'),
    JSON.stringify(
      {
        id: 'ISSUE-005-existing',
        slug: 'existing',
      },
      null,
      2,
    ),
    'utf8',
  );

  const r = await createIssue({
    cwd: fx.cwd,
    title: 'Next allocated should be 006',
    domain: 'domain-auth',
    evidence: ['EVIDENCE-001'],
  });

  const written = JSON.parse(await readFile(r.jsonPath, 'utf8'));
  assert.match(written.id, /^ISSUE-006-/, `expected ISSUE-006-..., got ${written.id}`);
});

test("createIssue: assertNotUpdate('command') is the FIRST call (verified via _inject spy)", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await createIssue(
    {
      cwd: fx.cwd,
      title: 'Spy test',
      domain: 'domain-auth',
      evidence: ['EVIDENCE-001'],
      dryRun: true,
    },
    {
      assertNotUpdate: (ctx) => {
        calls.push(ctx);
      },
    },
  );

  assert.deepEqual(
    calls,
    ['command', 'command'],
    'create-issue + emit each call assertNotUpdate("command")',
  );
  // FIRST call must be the create-issue entry guard, not emit's.
  assert.equal(calls[0], 'command');
});

test('createIssue: --dry-run writes ZERO files', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const before = (await readdir(path.join(fx.wsDir, 'to_fix'))).length;
  await createIssue({
    cwd: fx.cwd,
    title: 'Should not be written',
    domain: 'domain-auth',
    evidence: ['EVIDENCE-001'],
    dryRun: true,
  });
  const after = (await readdir(path.join(fx.wsDir, 'to_fix'))).length;
  assert.equal(after, before, 'no new files in to_fix/');
});
