// test/requirements-val05-closure.test.js
//
// Phase 6 closure (Plan 06-05): asserts the bookkeeping flip on
// `.planning/REQUIREMENTS.md` after the adapter layer ships.
//
// Three guarantees enforced by this test (each maps to a verbatim deviation
// from Plan 06-05's <interfaces> block):
//
//   1. The VAL-05 partial-acceptance suffix
//      `(stub Complete; Phase 6 fills runtime)` no longer appears anywhere
//      in REQUIREMENTS.md — neither on the inline checkbox line nor in the
//      traceability-table status column.
//   2. Each of ADP-01..ADP-10 appears as `- [x] **ADP-NN**:` (i.e. the
//      requirement-list checkboxes are flipped).
//   3. The traceability table contains `| ADP-NN | Phase 6 | Complete |`
//      for each of ADP-01..ADP-10 — no `Pending` rows for these IDs.
//
// These strings are grep targets for downstream phases; byte-exactness
// matters. If any future edit accidentally re-introduces the partial
// suffix or flips a row back to Pending, this test catches it.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const REQUIREMENTS_PATH = path.join(repoRoot, '.planning', 'REQUIREMENTS.md');

const ADP_IDS = [
  'ADP-01',
  'ADP-02',
  'ADP-03',
  'ADP-04',
  'ADP-05',
  'ADP-06',
  'ADP-07',
  'ADP-08',
  'ADP-09',
  'ADP-10',
];

test('Test 1: VAL-05 partial-acceptance suffix is fully removed from REQUIREMENTS.md', async () => {
  const text = await readFile(REQUIREMENTS_PATH, 'utf8');
  const FORBIDDEN = '(stub Complete; Phase 6 fills runtime)';
  assert.ok(
    !text.includes(FORBIDDEN),
    `REQUIREMENTS.md must not contain '${FORBIDDEN}' — found at least one occurrence`,
  );
});

test('Test 2: each ADP-01..ADP-10 requirement-list checkbox is flipped to [x]', async () => {
  const text = await readFile(REQUIREMENTS_PATH, 'utf8');
  for (const id of ADP_IDS) {
    const expected = `- [x] **${id}**:`;
    assert.ok(
      text.includes(expected),
      `REQUIREMENTS.md must contain checked checkbox for ${id} ('${expected}')`,
    );
    const unchecked = `- [ ] **${id}**:`;
    assert.ok(
      !text.includes(unchecked),
      `REQUIREMENTS.md must NOT contain unchecked checkbox for ${id} ('${unchecked}')`,
    );
  }
});

test('Test 3: traceability table marks each ADP-01..ADP-10 as Phase 6 | Complete', async () => {
  const text = await readFile(REQUIREMENTS_PATH, 'utf8');
  for (const id of ADP_IDS) {
    const completeRow = `| ${id} | Phase 6 | Complete |`;
    assert.ok(
      text.includes(completeRow),
      `traceability table must contain '${completeRow}' for ${id}`,
    );
    const pendingRow = `| ${id} | Phase 6 | Pending |`;
    assert.ok(
      !text.includes(pendingRow),
      `traceability table must NOT contain '${pendingRow}' for ${id}`,
    );
  }
});
