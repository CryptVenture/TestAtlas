// test/scripts/update-detects-missing-testatlas.test.js
//
// Quick 260506-jsc — `npx @webventures/testatlas update` must NOT report
// "Already up to date" when the target has no .testatlas/ install at all.
//
// User-observed scenario: a fresh tmp dir; no init had been run. `npx
// @webventures/testatlas update` exited 0 with "Already up to date" and made
// no changes — completely confusing. The expected behaviour is to surface
// "no install detected" with an actionable hint (run `init`).
//
// Contract:
//   - When <target>/.testatlas/ does NOT exist, runUpdate returns
//     status='install-missing'.
//   - Returned object includes a `previousVersion` for telemetry parity.
//   - The status is distinct from 'up-to-date' (which means a real install
//     exists and matches latest by version).

import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runUpdate } from '../../scripts/lib/update-core.js';

const QUIET = () => {};

test('runUpdate against target with NO .testatlas/ → status=install-missing (not up-to-date)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-missing-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });

  // Sanity: no .testatlas/ here.
  await assert.rejects(stat(path.join(target, '.testatlas')), /ENOENT/);

  const result = await runUpdate({
    target,
    currentVersion: '1.1.0',
    latestVersion: '1.1.0', // version-equal: would be 'up-to-date' under old logic
    logger: QUIET,
    noUpdateCheck: true,
  });

  assert.equal(
    result.status,
    'install-missing',
    `expected status=install-missing for empty target; got ${JSON.stringify(result)}`,
  );
  assert.equal(result.previousVersion, '1.1.0');
});

test('runUpdate logs an actionable message when install is missing', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-missing-msg-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });

  const messages = [];
  const result = await runUpdate({
    target,
    currentVersion: '1.1.0',
    latestVersion: '1.1.0',
    logger: (m) => messages.push(String(m)),
    noUpdateCheck: true,
  });
  assert.equal(result.status, 'install-missing');
  // Message must mention init OR install-missing OR no install detected.
  const blob = messages.join('\n').toLowerCase();
  assert.match(
    blob,
    /(init|install detected|install-missing|no \.testatlas)/,
    `expected actionable hint; saw:\n${messages.join('\n')}`,
  );
});
