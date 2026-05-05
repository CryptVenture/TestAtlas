// test/commands/dogfood-loop.test.js
//
// CMD-01: structural test asserting the EXACT 31-file command roster
// (Phase 3 shipped 9; Phase 4 ships 21 NEW; quick-260505-2zr adds uninstall.md
// = 31 total). Cannot live in any single plan because the roster is only
// complete after Wave 1 + Wave 2 of Phase 4 lands. Acts as a drift detector:
// adding or removing a command without updating EXPECTED_ROSTER fails the
// test with a clear diff.
//
// Build-up history:
//   - Phase 3 (9):  init, bootstrap, validate-workspace, log-issue,
//                   explore-codebase, map-domains, plan, test-flow, report
//   - Phase 4 (+21): explore (umbrella), explore-{ui,cli,api,docs,runtime,
//                   data,integrations,accessibility,performance,security},
//                   test-{domain,regression,accessibility,performance},
//                   triage, retest, consolidate, handoff, cleanup, update
//   - quick-260505-2zr (+1): uninstall (lifecycle parity with init/update)
//
// README.md is filtered out — it is an index page, not a command file.

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const EXPECTED_ROSTER = [
  'bootstrap.md',
  'cleanup.md',
  'consolidate.md',
  'explore-accessibility.md',
  'explore-api.md',
  'explore-cli.md',
  'explore-codebase.md',
  'explore-data.md',
  'explore-docs.md',
  'explore-integrations.md',
  'explore-performance.md',
  'explore-runtime.md',
  'explore-security.md',
  'explore-ui.md',
  'explore.md',
  'handoff.md',
  'init.md',
  'log-issue.md',
  'map-domains.md',
  'plan.md',
  'report.md',
  'retest.md',
  'test-accessibility.md',
  'test-domain.md',
  'test-flow.md',
  'test-performance.md',
  'test-regression.md',
  'triage.md',
  'uninstall.md',
  'update.md',
  'validate-workspace.md',
];

test('CMD-01: dogfood loop ships exactly 31 command files', async () => {
  const files = await listCommandFiles();
  const basenames = files.map((f) => path.basename(f)).filter((name) => name !== 'README.md');
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
    await assert.doesNotReject(access(full), `${full} must be readable`);
  }
});
