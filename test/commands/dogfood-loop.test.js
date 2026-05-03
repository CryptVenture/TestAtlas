// test/commands/dogfood-loop.test.js
//
// CMD-01: final structural test for Phase 3. Asserts the EXACT 9-file
// dogfood-loop roster locked in CONTEXT.md (no missing files, no extras).
// This test cannot live in Plan 03-01 because the roster is only complete
// after Plans 03-02 + 03-03 ship the actual command files. The test acts
// as a drift detector: if a future commit adds (or removes) a command file
// without updating EXPECTED_ROSTER, the test fails with a clear diff.
//
// README.md is filtered out — it is an index page, not a command file.

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const EXPECTED_ROSTER = [
  'init.md',
  'bootstrap.md',
  'validate-workspace.md',
  'log-issue.md',
  'explore-codebase.md',
  'map-domains.md',
  'plan.md',
  'test-flow.md',
  'report.md',
];

test('CMD-01: dogfood loop ships exactly 9 command files', async () => {
  const files = await listCommandFiles();
  const basenames = files
    .map((f) => path.basename(f))
    .filter((name) => name !== 'README.md');
  assert.equal(
    basenames.length,
    EXPECTED_ROSTER.length,
    `Expected ${EXPECTED_ROSTER.length} command files, got ${basenames.length}: ${basenames.join(', ')}`,
  );
});

test('CMD-01: dogfood loop file roster matches CONTEXT.md exactly', async () => {
  const files = await listCommandFiles();
  const basenames = files
    .map((f) => path.basename(f))
    .filter((name) => name !== 'README.md')
    .sort();
  const expected = EXPECTED_ROSTER.slice().sort();
  const missing = expected.filter((n) => !basenames.includes(n));
  const extra = basenames.filter((n) => !expected.includes(n));
  assert.deepEqual(
    basenames,
    expected,
    `Roster drift detected. Missing: ${missing.join(', ') || '(none)'}; Extra: ${extra.join(', ') || '(none)'}`,
  );
});

test('CMD-01: every expected command file is readable', async () => {
  for (const name of EXPECTED_ROSTER) {
    const full = path.join('.testatlas', 'commands', name);
    await assert.doesNotReject(
      access(full),
      `${full} must be readable`,
    );
  }
});
