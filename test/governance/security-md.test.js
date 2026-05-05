// Phase 10 Plan 05 / ISSUE-008 G-05 carve-out: pin SECURITY.md Supported Versions table accuracy. 1.x must reflect GA status (shipped 2026-05-04).
//
// Four assertions guard the SECURITY.md "Supported Versions" table against
// drift back to the pre-GA wording:
//
//   1. SECURITY.md MUST NOT contain the literal substring `Pre-release / not yet GA`.
//   2. The line containing `1.x` MUST contain either `Supported` or `GA`
//      (case-sensitive) — i.e. the row must positively assert a supported
//      status, not just lack the stale phrase.
//   3. The 1.x row MUST cross-reference `CHANGELOG.md` so the GA claim is
//      verifiable from a single click.
//   4. CHANGELOG.md MUST contain the literal `[1.0.0] - 2026-05-04` entry the
//      SECURITY.md row points at — without this anchor the cross-reference
//      from #3 would be dangling.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SECURITY_PATH = path.join(REPO_ROOT, 'SECURITY.md');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');

test('SECURITY.md does not contain stale `Pre-release / not yet GA` claim', async () => {
  const text = await readFile(SECURITY_PATH, 'utf8');
  assert.ok(
    !text.includes('Pre-release / not yet GA'),
    'SECURITY.md still carries the pre-GA wording. Update the 1.x Supported Versions row to reflect that v1.0.0 shipped on 2026-05-04 (see CHANGELOG.md).',
  );
});

test('SECURITY.md 1.x row positively asserts Supported or GA status', async () => {
  const text = await readFile(SECURITY_PATH, 'utf8');
  const row = text.split('\n').find((line) => line.includes('1.x'));
  assert.ok(
    row,
    'SECURITY.md no longer contains a `1.x` row in the Supported Versions table.',
  );
  // Reject the negated form "not yet GA" so a substring match on `GA` cannot
  // accidentally satisfy the positive assertion.
  assert.ok(
    !row.includes('not yet GA') && !row.includes('Pre-release'),
    `SECURITY.md 1.x row still negates GA status: ${row.trim()}`,
  );
  // Require an unambiguous positive marker.
  assert.ok(
    row.includes('Supported') || row.includes('GA shipped'),
    `SECURITY.md 1.x row must contain "Supported" or "GA shipped" but found: ${row.trim()}`,
  );
});

test('SECURITY.md 1.x row cross-references CHANGELOG.md', async () => {
  const text = await readFile(SECURITY_PATH, 'utf8');
  const row = text.split('\n').find((line) => line.includes('1.x'));
  assert.ok(row, 'SECURITY.md 1.x row missing.');
  assert.ok(
    row.includes('CHANGELOG.md'),
    `SECURITY.md 1.x row must reference CHANGELOG.md so the GA claim is verifiable. Got: ${row.trim()}`,
  );
});

test('CHANGELOG.md contains the [1.0.0] - 2026-05-04 anchor referenced by SECURITY.md', async () => {
  const text = await readFile(CHANGELOG_PATH, 'utf8');
  assert.ok(
    text.includes('[1.0.0] - 2026-05-04'),
    'CHANGELOG.md must contain the literal `[1.0.0] - 2026-05-04` entry that SECURITY.md cross-references.',
  );
});
