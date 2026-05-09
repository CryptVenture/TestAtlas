// test/commands/lifecycle-flag-wiring.test.js
//
// Phase 23 / Plan 23-01 / Wave 0 (TDD red-bar) — DEC-006 regression test.
//
// Pins the contract that two source command bodies invoke the 3 Phase-22
// lifecycle flags on their `update-brain-after-command.js` line:
//   - .testatlas/commands/explore-codebase.md
//   - .testatlas/commands/core/brain-sync.md
//
// Required flags (added by Wave 2):
//   --reconcile-counts --populate-from-app-map --detect-drift
//
// The flag handlers ALREADY EXIST in scripts/update-brain-after-command.js
// (verified at lines 108-126 + 171-179 — Phase-22 wiring). The drift is
// purely in the consuming command bodies. Wave 2 appends the flags.
//
// Self-dogfood invariant (PHASE17-INV-B): invocation lines must use the
// `.testatlas/scripts/` prefix, never the source-form `scripts/`.
//
// Reference: 23-RESEARCH.md lines 316-328 + 681-689 (DEC-006 fix recipe).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPLORE_CODEBASE = path.join(ROOT, '.testatlas/commands/explore-codebase.md');
const BRAIN_SYNC = path.join(ROOT, '.testatlas/commands/core/brain-sync.md');
const UPDATE_BRAIN_SCRIPT = path.join(ROOT, 'scripts/update-brain-after-command.js');

function findInvocationLine(body) {
  return body
    .split('\n')
    .find((l) => l.includes('update-brain-after-command.js') && l.includes('--reindex'));
}

// ── explore-codebase.md ──────────────────────────────────────────────────────

test('explore-codebase.md: invocation line contains --reconcile-counts', async () => {
  const body = await readFile(EXPLORE_CODEBASE, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected an update-brain-after-command.js + --reindex invocation line');
  assert.match(line, /--reconcile-counts/, 'missing --reconcile-counts on invocation line');
});

test('explore-codebase.md: invocation line contains --populate-from-app-map', async () => {
  const body = await readFile(EXPLORE_CODEBASE, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected invocation line');
  assert.match(line, /--populate-from-app-map/, 'missing --populate-from-app-map');
});

test('explore-codebase.md: invocation line contains --detect-drift', async () => {
  const body = await readFile(EXPLORE_CODEBASE, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected invocation line');
  assert.match(line, /--detect-drift/, 'missing --detect-drift');
});

test('explore-codebase.md: --reindex flag preserved on invocation line (back-compat)', async () => {
  const body = await readFile(EXPLORE_CODEBASE, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected invocation line');
  assert.match(line, /--reindex/, '--reindex must remain on the invocation line');
});

test('explore-codebase.md: invocation uses .testatlas/scripts/ prefix (PHASE17-INV-B)', async () => {
  const body = await readFile(EXPLORE_CODEBASE, 'utf8');
  const line = body
    .split('\n')
    .find((l) => l.includes('node ') && l.includes('update-brain-after-command.js'));
  assert.ok(line, 'expected a `node ... update-brain-after-command.js` invocation line');
  assert.match(line, /node \.testatlas\/scripts\/update-brain-after-command\.js/);
  assert.doesNotMatch(line, /node scripts\/update-brain-after-command\.js/);
});

// ── core/brain-sync.md ───────────────────────────────────────────────────────

test('brain-sync.md: invocation line contains --reconcile-counts', async () => {
  const body = await readFile(BRAIN_SYNC, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected an update-brain-after-command.js + --reindex invocation line');
  assert.match(line, /--reconcile-counts/, 'missing --reconcile-counts on invocation line');
});

test('brain-sync.md: invocation line contains --populate-from-app-map', async () => {
  const body = await readFile(BRAIN_SYNC, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected invocation line');
  assert.match(line, /--populate-from-app-map/, 'missing --populate-from-app-map');
});

test('brain-sync.md: invocation line contains --detect-drift', async () => {
  const body = await readFile(BRAIN_SYNC, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected invocation line');
  assert.match(line, /--detect-drift/, 'missing --detect-drift');
});

test('brain-sync.md: --reindex flag preserved on invocation line (back-compat)', async () => {
  const body = await readFile(BRAIN_SYNC, 'utf8');
  const line = findInvocationLine(body);
  assert.ok(line, 'expected invocation line');
  assert.match(line, /--reindex/, '--reindex must remain on the invocation line');
});

test('brain-sync.md: invocation uses .testatlas/scripts/ prefix (PHASE17-INV-B)', async () => {
  const body = await readFile(BRAIN_SYNC, 'utf8');
  const line = body
    .split('\n')
    .find((l) => l.includes('node ') && l.includes('update-brain-after-command.js'));
  assert.ok(line, 'expected a `node ... update-brain-after-command.js` invocation line');
  assert.match(line, /node \.testatlas\/scripts\/update-brain-after-command\.js/);
  assert.doesNotMatch(line, /node scripts\/update-brain-after-command\.js/);
});

// ── back-compat: producer script handlers exist ──────────────────────────────

test('update-brain-after-command.js: flag handlers for --reconcile-counts exist (Phase-22 baseline)', async () => {
  const src = await readFile(UPDATE_BRAIN_SCRIPT, 'utf8');
  assert.match(src, /reconcileCounts/, 'producer script must already parse --reconcile-counts');
});

test('update-brain-after-command.js: flag handlers for --populate-from-app-map exist (Phase-22 baseline)', async () => {
  const src = await readFile(UPDATE_BRAIN_SCRIPT, 'utf8');
  assert.match(
    src,
    /populateFromAppMap/,
    'producer script must already parse --populate-from-app-map',
  );
});

test('update-brain-after-command.js: flag handlers for --detect-drift exist (Phase-22 baseline)', async () => {
  const src = await readFile(UPDATE_BRAIN_SCRIPT, 'utf8');
  assert.match(src, /detectDrift/, 'producer script must already parse --detect-drift');
});
