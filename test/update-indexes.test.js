// test/update-indexes.test.js
//
// Plan 05-01 Task 3 tests.

import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parseMarkers } from '../scripts/lib/markers.js';
import { updateIndexes } from '../scripts/update-indexes.js';
import { makeValidationFixture } from './_helpers.js';

test('updateIndexes: regenerates 09_artifact_index.md sections; preserves human prose outside markers', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Inject a human note OUTSIDE markers in the artifact index.
  const indexPath = path.join(fx.wsDir, '09_artifact_index.md');
  const before = await readFile(indexPath, 'utf8');
  const HUMAN = '\n\n## Human Notes\n\nWe deprecated the old `payments-v1` domain on 2026-04-01.\n';
  await writeFile(indexPath, before + HUMAN, 'utf8');

  await updateIndexes({ cwd: fx.cwd });

  const after = await readFile(indexPath, 'utf8');
  assert.ok(after.includes('We deprecated the old `payments-v1`'), 'human prose preserved');

  // The "issue-docs" section should now list the on-disk issue.
  const { sections, errors } = parseMarkers(after);
  assert.equal(errors.length, 0);
  const issueSection = sections.get('issue-docs');
  assert.ok(issueSection, 'issue-docs section present');
  const body = issueSection.contentLines.join('\n');
  assert.ok(
    body.includes('to_fix/ISSUE-001-foo.md'),
    `expected ISSUE-001-foo.md in body; got: ${body}`,
  );
});

test('updateIndexes: refuses on malformed markers (TESTATLAS_MARKER_INVALID)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const indexPath = path.join(fx.wsDir, '09_artifact_index.md');
  // Inject an unmatched START marker.
  await writeFile(
    indexPath,
    '# 09 Artifact Index\n\n<!-- TESTATLAS:GENERATED:START section="orphan" -->\noops\n',
    'utf8',
  );

  await assert.rejects(
    () => updateIndexes({ cwd: fx.cwd }),
    (err) => err.code === 'TESTATLAS_MARKER_INVALID',
  );
});

test('updateIndexes: --only=domain-docs regenerates only that section', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const before = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const beforeSections = parseMarkers(before).sections;
  const beforeIssueBody = beforeSections.get('issue-docs').contentLines.join('\n');

  // Add a NEW issue file on disk that is NOT in the original index.
  await writeFile(path.join(fx.wsDir, 'to_fix/ISSUE-007-newly-added.md'), '# new\n', 'utf8');

  await updateIndexes({ cwd: fx.cwd, only: ['domain-docs'] });

  const after = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const afterIssueBody = parseMarkers(after).sections.get('issue-docs').contentLines.join('\n');
  assert.equal(
    afterIssueBody,
    beforeIssueBody,
    'issue-docs section untouched when --only=domain-docs',
  );
});

test('updateIndexes: --dry-run writes ZERO files', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let writes = 0;
  await updateIndexes(
    { cwd: fx.cwd, dryRun: true },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0);
});

test("updateIndexes: assertNotUpdate('command') is the FIRST call", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await updateIndexes(
    { cwd: fx.cwd, dryRun: true },
    {
      assertNotUpdate: (ctx) => {
        calls.push(ctx);
      },
    },
  );
  assert.equal(calls[0], 'command');
});
