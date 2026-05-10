// test/scripts/sync-status-council-sessions.test.js
//
// Plan 22-01 Task 7 — DEC-009 regression.
//
// Pins the contract that scripts/update-indexes.js MUST recognize a
// `council-sessions` section and populate the corresponding GENERATED block
// in 09_artifact_index.md from on-disk
// _testatlas/agents/councils/sessions/COUNCIL-*/ directories.
//
// Wave 0 RED: SECTIONS array (update-indexes.js:41-51) lacks 'council-sessions'.
// Even with the GENERATED block injected into the template, the block stays
// untouched (no producer for the section). Wave 1 will add it.
//
// NOTE on filename: VALIDATION.md preserves "sync-status-*" naming convention,
// but the actual production script edited in Wave 1 is `update-indexes.js`.

import { strict as assert } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parseMarkers } from '../../scripts/lib/markers.js';
import { updateIndexes } from '../../scripts/update-indexes.js';
import { makeValidationFixture } from '../_helpers.js';

const COUNCIL_BLOCK = `\n## Council Sessions\n\n<!-- TESTATLAS:GENERATED:START section="council-sessions" -->\n(placeholder before update)\n<!-- TESTATLAS:GENERATED:END section="council-sessions" -->\n`;

async function injectCouncilBlock(wsDir) {
  const indexPath = path.join(wsDir, '09_artifact_index.md');
  const original = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, `${original}\n${COUNCIL_BLOCK}`);
}

async function seedSessions(wsDir, ids) {
  for (const sid of ids) {
    await mkdir(path.join(wsDir, 'agents', 'councils', 'sessions', sid), { recursive: true });
  }
}

function bodyOf(text, slug) {
  const { sections } = parseMarkers(text);
  const sec = sections.get(slug);
  return sec ? sec.contentLines.join('\n') : null;
}

test('Test 1: 2 sessions on disk → council-sessions block lists both paths', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await injectCouncilBlock(fx.wsDir);
  await seedSessions(fx.wsDir, ['COUNCIL-001', 'COUNCIL-002']);

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'council-sessions');
  assert.ok(body !== null, 'council-sessions section must remain present');
  assert.match(body, /COUNCIL-001/, 'council-sessions block must list COUNCIL-001');
  assert.match(body, /COUNCIL-002/, 'council-sessions block must list COUNCIL-002');
  assert.doesNotMatch(body, /placeholder before update/);
});

test('Test 2: idempotent — second run produces byte-identical output', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await injectCouncilBlock(fx.wsDir);
  await seedSessions(fx.wsDir, ['COUNCIL-001']);

  await updateIndexes({ cwd: fx.cwd });
  const after1 = await readFile(path.join(fx.wsDir, '09_artifact_index.md'));
  await updateIndexes({ cwd: fx.cwd });
  const after2 = await readFile(path.join(fx.wsDir, '09_artifact_index.md'));
  assert.equal(after1.equals(after2), true, '09_artifact_index.md must be byte-equal across runs');
  // Tighten: the council-sessions body must reference COUNCIL-001 (proving the
  // section was actually populated, not just untouched-equal-because-skipped).
  const body = bodyOf(after1.toString('utf8'), 'council-sessions');
  assert.match(body, /COUNCIL-001/);
});

test('Test 3: 0 sessions → block populated with empty/placeholder body (no COUNCIL-* lines)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await injectCouncilBlock(fx.wsDir);
  await seedSessions(fx.wsDir, []);

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'council-sessions');
  assert.ok(body !== null);
  // Must have been touched by the producer — placeholder removed.
  assert.doesNotMatch(body, /placeholder before update/);
  assert.doesNotMatch(body, /COUNCIL-/);
});

test('Test 4: sessions sorted alphabetically', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await injectCouncilBlock(fx.wsDir);
  await seedSessions(fx.wsDir, ['COUNCIL-003', 'COUNCIL-001', 'COUNCIL-002']);

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'council-sessions');
  const idx1 = body.indexOf('COUNCIL-001');
  const idx2 = body.indexOf('COUNCIL-002');
  const idx3 = body.indexOf('COUNCIL-003');
  assert.ok(idx1 >= 0 && idx2 >= 0 && idx3 >= 0, 'all three COUNCIL ids must appear');
  assert.ok(
    idx1 < idx2 && idx2 < idx3,
    `expected sorted order; got idx1=${idx1}, idx2=${idx2}, idx3=${idx3}`,
  );
});
