// test/reference/council-protocol-prompt-evidence-verification.test.js
//
// Quick 260510-rfp / OPEN-006 — pre-spawn prompt-evidence verification test.
//
// Pins the contract that .testatlas/reference/council-protocol.md §7.5
// (Orchestrator Responsibilities) contains a "Pre-spawn prompt-evidence
// verification" requirement covering issue IDs, counts, version
// references, and script paths.
//
// Captured by COUNCIL-2026-05-10-001 / OPEN-006 after 3 prompt-side
// errors leaked into a release-readiness session: (1) validate-workspace
// "exit 0 confirmed" (was actually exit 1; the "0" was a piped-tail
// measurement artifact); (2) ISSUE-038..045 severity miscount (cited
// 5×high/3×medium; on-disk 3×high/4×medium/1×low); (3) ISSUE-082
// reference that pointed at a stale tracker entry, not an on-disk issue.
// All 3 surfaced only because personas re-verified independently; the
// fix is to make the orchestrator re-verify BEFORE spawn.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROTOCOL = path.join(ROOT, '.testatlas/reference/council-protocol.md');

test('Test 1: §7.5 references pre-spawn prompt-evidence verification', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.match(
    text,
    /Pre-spawn prompt-evidence verification/i,
    'expected §7.5 to declare "Pre-spawn prompt-evidence verification"',
  );
});

test('Test 2: requirement specifies issue-ID stat-and-grep', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /issue ID.*resolve/i.test(text) ||
      /ISSUE-NNN.*resolve/.test(text) ||
      /every issue ID cited/i.test(text),
    'expected explicit requirement that every cited issue ID resolves to a real file',
  );
});

test('Test 3: requirement specifies count re-computation', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /count.*re-computed|count.*MUST be re-computed|recompute.*count/i.test(text),
    'expected requirement to re-compute counts from disk via the corresponding script',
  );
});

test('Test 4: requirement specifies version reference verification', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /version reference.*MUST match|version.*MUST match.*package\.json|version.*MUST match/i.test(
      text,
    ),
    'expected version-reference verification against package.json or CHANGELOG',
  );
});

test('Test 5: requirement specifies script-path existence check', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /script path cited.*MUST exist|every script path/i.test(text),
    'expected script-path existence verification',
  );
});

test('Test 6: requirement names BEFORE-spawn (not after) as the binding moment', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /BEFORE.*spawn/.test(text) || /before spawning/i.test(text) || /MUST.*before spawn/i.test(text),
    'expected explicit "BEFORE spawn" binding (correct prompt before personas read it as authoritative)',
  );
});

test('Test 7: cross-references COUNCIL-2026-05-10-001 / OPEN-006 origin', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.match(
    text,
    /COUNCIL-2026-05-10-001.*OPEN-006|OPEN-006.*COUNCIL-2026-05-10-001/,
    'expected citation of COUNCIL-2026-05-10-001 / OPEN-006 as origin',
  );
});
