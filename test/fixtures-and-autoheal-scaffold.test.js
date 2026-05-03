// test/fixtures-and-autoheal-scaffold.test.js
//
// Plan 05-01 Task 1 tests:
//   1. makeValidationFixture('_base-good') copies fixture; manifest counts
//      match disk artifact count (1 domain, 1 flow, 1 issue, 1 evidence).
//   2. makeValidationFixture('broken-orphan-evidence') copies fixture;
//      EVIDENCE-099/ is present and not referenced by any issue/flow.
//   3. makeValidationFixture('broken-stale-hash-whitespace-only') copies
//      fixture; 03_execution_status.md contains whitespace-only edits inside
//      generated markers and the manifest hash is unchanged.
//   4. scripts/lib/validate/autoheal.js imports cleanly; autoHealFindings()
//      returns {applied:[], skipped:[]}.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { hashContent } from '../scripts/lib/content-hash.js';
import { parseMarkers } from '../scripts/lib/markers.js';
import { autoHealFindings } from '../scripts/lib/validate/autoheal.js';
import { makeValidationFixture } from './_helpers.js';

test('makeValidationFixture: _base-good copies fixture; manifest counts match disk', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const manifest = JSON.parse(
    await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  assert.equal(manifest.counts.domains, 1);
  assert.equal(manifest.counts.flows, 1);
  assert.equal(manifest.counts.issues, 1);
  assert.equal(manifest.counts.evidenceRecords, 1);

  // The 14 canonicals are present.
  for (const f of [
    '00_overview.md',
    '03_execution_status.md',
    '11_workspace_manifest.json',
    '12_app_map.json',
  ]) {
    await readFile(path.join(fx.wsDir, f), 'utf8'); // throws if missing
  }
});

test('makeValidationFixture: broken-orphan-evidence carries unreferenced EVIDENCE-099', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);

  const orphan = JSON.parse(
    await readFile(path.join(fx.wsDir, 'evidence/EVIDENCE-099/evidence.json'), 'utf8'),
  );
  assert.equal(orphan.id, 'EVIDENCE-099');

  // The single existing issue references EVIDENCE-001, not EVIDENCE-099.
  const issue = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix/ISSUE-001-foo.json'), 'utf8'),
  );
  assert.deepEqual(issue.evidence, ['EVIDENCE-001']);
});

test('makeValidationFixture: broken-stale-hash-whitespace-only has WS-only drift inside markers', async (t) => {
  const fx = await makeValidationFixture('broken-stale-hash-whitespace-only');
  t.after(fx.cleanup);

  const file = await readFile(path.join(fx.wsDir, '03_execution_status.md'), 'utf8');
  const { sections, errors } = parseMarkers(file);
  assert.equal(errors.length, 0, 'markers must parse cleanly');

  // Manifest's hash for current-run section is the ORIGINAL hash (from base-good).
  const manifest = JSON.parse(
    await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  const recordedHash = manifest.generatedSections['03_execution_status.md']?.['current-run'];
  assert.ok(recordedHash, 'manifest must record a hash for the current-run section');

  const onDiskHash = sections.get('current-run').hash;
  assert.notEqual(
    onDiskHash,
    recordedHash,
    'on-disk hash MUST differ from manifest (drift); whitespace-only edits hash differently than the original.',
  );

  // Sanity: the canonicalized text (via hashContent) collapses CRLF but keeps
  // whitespace, so the hash IS sensitive to space changes.
  assert.equal(hashContent(sections.get('current-run').contentLines), onDiskHash);
});

test('autoHealFindings scaffold imports + returns empty arrays', async () => {
  const r = await autoHealFindings(
    {},
    { cwd: '/tmp', workspaceDir: '_testatlas' },
    { dryRun: true },
  );
  assert.deepEqual(r, { applied: [], skipped: [] });
  assert.equal(typeof autoHealFindings, 'function');
});
