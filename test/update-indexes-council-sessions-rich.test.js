// test/update-indexes-council-sessions-rich.test.js
//
// Phase 23 / Plan 23-01 / Wave 0 (TDD red-bar) — DEC-003 regression test.
//
// Pins the contract that scripts/update-indexes.js#listCouncilSessions emits
// rich entries containing topic / mode= / participants=N / status= for each
// COUNCIL-* directory that has a session.json on disk. Wave 1 enriches the
// renderer; today the function emits path-only strings, so Tests 1, 2, 4
// fail RED on the missing mode=/participants=/status= substrings.
//
// Existing pin: test/update-indexes.test.js (must STAY GREEN — back-compat).
//
// Reference: 23-RESEARCH.md lines 271-277 + 626-679 (DEC-003 fix recipe).

import { strict as assert } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { updateIndexes } from '../scripts/update-indexes.js';
import { makeValidationFixture } from './_helpers.js';

async function writeSession(wsDir, id, payload) {
  const dir = path.join(wsDir, 'agents', 'councils', 'sessions', id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'session.json'), JSON.stringify(payload, null, 2), 'utf8');
}

async function makeEmptyDir(wsDir, id) {
  const dir = path.join(wsDir, 'agents', 'councils', 'sessions', id);
  await mkdir(dir, { recursive: true });
}

// The _base-good fixture's 09_artifact_index.md predates the council-sessions
// section; inject the marker block at end-of-file so update-indexes will fill it.
async function ensureCouncilSessionsMarker(wsDir) {
  const indexPath = path.join(wsDir, '09_artifact_index.md');
  const existing = await readFile(indexPath, 'utf8');
  if (existing.includes('section="council-sessions"')) return;
  const block = [
    '',
    '## Council Sessions',
    '',
    '<!-- TESTATLAS:GENERATED:START section="council-sessions" -->',
    '(no council-sessions yet)',
    '<!-- TESTATLAS:GENERATED:END section="council-sessions" -->',
    '',
  ].join('\n');
  await writeFile(indexPath, existing + block, 'utf8');
}

test('Test 1: rendered bullets contain topic + mode= + participants=N + status=', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeSession(fx.wsDir, 'COUNCIL-2026-05-09-T01', {
    id: 'COUNCIL-2026-05-09-T01',
    topic: 'Test topic A',
    executionMode: 'parallel-subagents',
    participants: ['p1', 'p2', 'p3'],
    status: 'completed',
  });

  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });

  const indexMd = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  assert.match(
    indexMd,
    /agents\/councils\/sessions\/COUNCIL-2026-05-09-T01\/.*mode=parallel-subagents.*participants=3.*status=completed/,
    'expected enriched mode=/participants=N/status= segments on the COUNCIL-T01 line',
  );
  assert.match(indexMd, /Test topic A/, 'expected topic to appear in rendered output');
});

test('Test 2: multi-session sorted alphabetically (3 entries, T01/T02/T03)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeSession(fx.wsDir, 'COUNCIL-2026-05-09-T03', {
    id: 'COUNCIL-2026-05-09-T03',
    topic: 'Topic Z',
    executionMode: 'sequential',
    participants: ['x'],
    status: 'pending',
  });
  await writeSession(fx.wsDir, 'COUNCIL-2026-05-09-T01', {
    id: 'COUNCIL-2026-05-09-T01',
    topic: 'Topic A',
    executionMode: 'parallel-subagents',
    participants: ['a', 'b'],
    status: 'completed',
  });
  await writeSession(fx.wsDir, 'COUNCIL-2026-05-09-T02', {
    id: 'COUNCIL-2026-05-09-T02',
    topic: 'Topic M',
    executionMode: 'lean-no-subagents',
    participants: ['m1', 'm2', 'm3', 'm4'],
    status: 'pending',
  });

  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });

  const indexMd = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const t01 = indexMd.indexOf('COUNCIL-2026-05-09-T01');
  const t02 = indexMd.indexOf('COUNCIL-2026-05-09-T02');
  const t03 = indexMd.indexOf('COUNCIL-2026-05-09-T03');
  assert.ok(t01 > -1 && t02 > -1 && t03 > -1, 'all 3 sessions present');
  assert.ok(t01 < t02 && t02 < t03, 'sessions sorted alphabetically (T01 < T02 < T03)');
  assert.match(indexMd, /participants=4/, 'T02 has participants=4');
});

test('Test 3: missing session.json — fallback path-only entry, no mode= segment', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await makeEmptyDir(fx.wsDir, 'COUNCIL-LEGACY-001');

  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });

  const indexMd = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  assert.match(indexMd, /COUNCIL-LEGACY-001/, 'legacy dir still listed');
  assert.doesNotMatch(
    indexMd,
    /COUNCIL-LEGACY-001.*mode=/,
    'no mode= segment when session.json is absent (fallback)',
  );
});

test('Test 4: missing executionMode field renders mode=unknown (Tier-5: never invent)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeSession(fx.wsDir, 'COUNCIL-2026-05-09-T04', {
    id: 'COUNCIL-2026-05-09-T04',
    topic: 'Topic without executionMode',
    // executionMode intentionally omitted
    participants: ['only-one'],
    status: 'pending',
  });

  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });

  const indexMd = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  assert.match(
    indexMd,
    /COUNCIL-2026-05-09-T04.*mode=unknown/,
    'expected mode=unknown when executionMode is absent — never invent a value',
  );
});

test('Test 5: empty sessions dir → "no council-sessions yet" placeholder (back-compat)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // No COUNCIL-* dirs created.
  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });

  const indexMd = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  assert.match(
    indexMd,
    /no council-sessions yet/,
    'placeholder preserved when no sessions on disk',
  );
});

test('Test 6: idempotency — re-running updateIndexes on same input produces byte-identical output', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeSession(fx.wsDir, 'COUNCIL-2026-05-09-T06', {
    id: 'COUNCIL-2026-05-09-T06',
    topic: 'Idempotency test topic',
    executionMode: 'parallel-subagents',
    participants: ['a', 'b'],
    status: 'completed',
  });

  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });
  const firstRead = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  await ensureCouncilSessionsMarker(fx.wsDir);
  await updateIndexes({ cwd: fx.cwd });
  const secondRead = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');

  assert.equal(secondRead, firstRead, 'second run must be byte-identical to first run');
});
