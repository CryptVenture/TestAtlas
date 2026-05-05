// test/scripts/sync-status-overview.test.js
//
// Quick 260505-wjp Task 3 (G5): RED→GREEN tests for the sync-status.js
// extension that ALSO refreshes 00_overview.md's 3 generated sections
// (current-status, latest-report-pointer, last-updated) on top of
// 03_execution_status.md "counts".

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parseMarkers } from '../../scripts/lib/markers.js';
import { syncStatus } from '../../scripts/sync-status.js';
import { makeValidationFixture } from '../_helpers.js';

async function seedOverviewWithMarkers(wsDir) {
  // Replace the stubbed 00_overview.md with a proper marker-bearing template.
  const overview = [
    '# 00 Overview',
    '',
    '## Current Testing Status',
    '',
    '<!-- TESTATLAS:GENERATED:START section="current-status" -->',
    '- Status: initialized',
    '- Domains mapped: 0',
    '- Flows mapped: 0',
    '- Flows tested: 0',
    '- Issues filed: 0',
    '- Last command: (none)',
    '<!-- TESTATLAS:GENERATED:END section="current-status" -->',
    '',
    '## Latest Report Pointer',
    '',
    '<!-- TESTATLAS:GENERATED:START section="latest-report-pointer" -->',
    '- Latest report: (none)',
    '- Generated at: (none)',
    '<!-- TESTATLAS:GENERATED:END section="latest-report-pointer" -->',
    '',
    '## Last Updated Timestamp',
    '',
    '<!-- TESTATLAS:GENERATED:START section="last-updated" -->',
    '0000-00-00T00:00:00Z',
    '<!-- TESTATLAS:GENERATED:END section="last-updated" -->',
    '',
  ].join('\n');
  await writeFile(path.join(wsDir, '00_overview.md'), overview);
}

test('syncStatus: refreshes 00_overview.md current-status with last command pulled from 10_command_log.md', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await seedOverviewWithMarkers(fx.wsDir);
  // Seed a row in 10_command_log.md
  await writeFile(
    path.join(fx.wsDir, '10_command_log.md'),
    [
      '# 10 Command Log',
      '',
      '| Timestamp | Command | Status | Execution Mode | Evidence Ref |',
      '| --------- | ------- | ------ | -------------- | ------------ |',
      '| 2026-05-05T20:00:00.000Z | init | ok | - | - |',
      '| 2026-05-05T20:01:00.000Z | plan | ok | - | - |',
      '',
    ].join('\n'),
  );

  const r = await syncStatus({ cwd: fx.cwd });
  assert.equal(r.overviewUpdated, true);

  const overview = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  const { sections } = parseMarkers(overview);
  const cs = sections.get('current-status').contentLines.join('\n');
  assert.match(cs, /Last command: plan/, 'current-status reflects last 10_command_log row');
  assert.match(cs, /Domains mapped: 1/);
  assert.match(cs, /Flows mapped: 1/);
});

test('syncStatus: 00_overview.md latest-report-pointer reads from reports/REPORT-latest.md / .json', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await seedOverviewWithMarkers(fx.wsDir);

  // No REPORT-latest yet → "(none)"
  await syncStatus({ cwd: fx.cwd });
  let overview = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  assert.match(overview, /Latest report: \(none\)/);

  // Add one, re-run
  await mkdir(path.join(fx.wsDir, 'reports'), { recursive: true });
  await writeFile(path.join(fx.wsDir, 'reports', 'REPORT-latest.md'), '# Latest\n');
  await writeFile(
    path.join(fx.wsDir, 'reports', 'REPORT-latest.json'),
    JSON.stringify({ generatedAt: '2026-05-05T21:00:00.000Z' }),
  );
  await syncStatus({ cwd: fx.cwd });
  overview = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  assert.match(overview, /Latest report: reports\/REPORT-latest\.md/);
  assert.match(overview, /Generated at: 2026-05-05T21:00:00\.000Z/);
});

test('syncStatus: idempotent — second overview pass produces no second-run change', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await seedOverviewWithMarkers(fx.wsDir);

  await syncStatus({ cwd: fx.cwd });
  const after1 = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  const r2 = await syncStatus({ cwd: fx.cwd });
  const after2 = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  assert.equal(after1, after2, 'overview bytes stable after first run');
  // overviewUpdated may still be `true` on rerun if last-updated changes the timestamp;
  // but the bytes-equal assertion proves the body-driven sections are stable.
  assert.ok(typeof r2.overviewUpdated === 'boolean');
});
