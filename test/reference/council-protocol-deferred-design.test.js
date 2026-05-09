// test/reference/council-protocol-deferred-design.test.js
//
// Phase 23 / Plan 23-01 / Wave 0 (TDD red-bar) — OPEN-001 ADR capture test.
//
// Pins the contract that .testatlas/reference/council-protocol.md contains
// a "Deferred design — vote-status producer" ADR section capturing the
// proposed `update-claim-status-from-votes` producer that would flip
// claim status:pending → status:accepted based on vote tallies. The OR-
// gate broadening landed in DEC-004 (Phase 22) makes this producer
// unnecessary in the short term, so OPEN-001 records the deferral as an
// ADR rather than implementing it.
//
// Today the section does not exist. All 6 tests fail RED. Wave 2 appends
// the section; this test flips fully GREEN.
//
// Reference: 23-RESEARCH.md lines 367-415 (OPEN-001 ADR fix recipe).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROTOCOL = path.join(ROOT, '.testatlas/reference/council-protocol.md');

test('Test 1: ADR section header "Deferred design — vote-status producer" present', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.match(text, /Deferred design — vote-status producer/);
});

test('Test 2: ADR contains OPEN-001 cross-reference', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.match(text, /OPEN-001/);
});

test('Test 3: ADR contains Phase 23 cross-reference', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.match(text, /Phase 23/);
});

test('Test 4: ADR references DEC-004 problem statement (the OR-gate that motivates deferral)', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.match(text, /DEC-004/);
});

test('Test 5: ADR proposed-design content references claim-status-flip pattern', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /update-claim-status-from-votes/.test(text) ||
      /pending\s*[→-]>\s*accepted/.test(text) ||
      /status:pending/.test(text),
    'expected proposed-design content (update-claim-status-from-votes OR pending→accepted OR status:pending)',
  );
});

test('Test 6: ADR explicitly defers implementation', async () => {
  const text = await readFile(PROTOCOL, 'utf8');
  assert.ok(
    /Implementation deferred/i.test(text) ||
      /out of Phase 23 scope/i.test(text) ||
      /deferred to a future phase/i.test(text),
    'expected explicit deferral language ("Implementation deferred" / "out of Phase 23 scope" / "deferred to a future phase")',
  );
});
