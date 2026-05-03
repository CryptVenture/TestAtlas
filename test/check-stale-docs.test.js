// test/check-stale-docs.test.js
//
// Plan 05-03 (Wave 2). Unit tests for scripts/check-stale-docs.js.

import { strict as assert } from 'node:assert';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { checkStaleDocs } from '../scripts/check-stale-docs.js';
import { makeValidationFixture } from './_helpers.js';

const ONE_DAY_S = 24 * 60 * 60;
const NOW_S = Math.floor(Date.now() / 1000);

async function setMtime(file, daysOld) {
  const sec = NOW_S - daysOld * ONE_DAY_S;
  await utimes(file, sec, sec);
}

test('check-stale-docs: assertNotUpdate("command") is FIRST', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let firstCall = null;
  await checkStaleDocs(
    { cwd: fx.cwd, thresholdDays: 30 },
    {
      assertNotUpdate: (ctx) => {
        if (firstCall === null) firstCall = ctx;
      },
    },
  );
  assert.equal(firstCall, 'command');
});

test('check-stale-docs: flags markdown files older than --threshold-days', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Make 00_overview.md 200 days old.
  await setMtime(path.join(fx.wsDir, '00_overview.md'), 200);
  // Keep 01_system_map.md fresh.
  await setMtime(path.join(fx.wsDir, '01_system_map.md'), 0);

  const r = await checkStaleDocs({ cwd: fx.cwd, thresholdDays: 90 });
  const stale = r.staleList.find((s) => /00_overview\.md$/.test(s.path));
  assert.ok(stale, 'expected 00_overview.md flagged');
  assert.ok(stale.daysOld >= 199, `daysOld=${stale.daysOld}`);
  const fresh = r.staleList.find((s) => /01_system_map\.md$/.test(s.path));
  assert.equal(fresh, undefined, 'fresh file must not be flagged');
});

test('check-stale-docs: does NOT flag files under archivalDirs (default ["history"])', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Drop a 1000-day-old file under history/.
  const histDir = path.join(fx.wsDir, 'history');
  await mkdir(histDir, { recursive: true });
  const oldHistory = path.join(histDir, 'old-run.md');
  await writeFile(oldHistory, '# log\n', 'utf8');
  await setMtime(oldHistory, 1000);

  const r = await checkStaleDocs({ cwd: fx.cwd, thresholdDays: 90 });
  const flagged = r.staleList.find((s) => /history\/old-run\.md$/.test(s.path));
  assert.equal(flagged, undefined, 'history/ files must never be flagged');
});

test('check-stale-docs: honors per-file `archival: true` frontmatter (Pitfall 10 opt-out)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Drop a stale file with archival:true frontmatter.
  const archived = path.join(fx.wsDir, 'archived-decision.md');
  await writeFile(
    archived,
    '---\narchival: true\n---\n\n# Old decision (intentionally archived)\n',
    'utf8',
  );
  await setMtime(archived, 999);

  const r = await checkStaleDocs({ cwd: fx.cwd, thresholdDays: 30 });
  const flagged = r.staleList.find((s) => /archived-decision\.md$/.test(s.path));
  assert.equal(flagged, undefined, 'archival:true file must not be flagged');
});

test('check-stale-docs: --threshold-days=999 flags zero files (none old enough)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Even with 200-day-old files, threshold of 999 means none are flagged.
  await setMtime(path.join(fx.wsDir, '00_overview.md'), 200);

  const r = await checkStaleDocs({ cwd: fx.cwd, thresholdDays: 999 });
  assert.equal(r.staleList.length, 0);
});

test('check-stale-docs: --dry-run writes ZERO files (when --report=<path> would otherwise write)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await setMtime(path.join(fx.wsDir, '00_overview.md'), 200);

  let writes = 0;
  await checkStaleDocs(
    { cwd: fx.cwd, thresholdDays: 90, report: 'stale-report.md', dryRun: true },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0);
});

test('check-stale-docs: produces markdown summary table', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await setMtime(path.join(fx.wsDir, '00_overview.md'), 200);

  const r = await checkStaleDocs({ cwd: fx.cwd, thresholdDays: 90 });
  assert.match(r.report, /Stale Docs/i);
  assert.match(r.report, /00_overview\.md/);
});
