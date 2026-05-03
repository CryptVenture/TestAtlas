// test/sync-status.test.js
//
// Plan 05-01 Task 3 tests.

import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parseMarkers } from '../scripts/lib/markers.js';
import { syncStatus } from '../scripts/sync-status.js';
import { makeValidationFixture } from './_helpers.js';

test('syncStatus: reconciles manifest counts with on-disk reality', async (t) => {
  // Use the broken-count-mismatch fixture: manifest.counts.issues=5, disk has 1.
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const r = await syncStatus({ cwd: fx.cwd });
  assert.equal(r.counts.issues, 1, 'on-disk issue count');
  assert.ok(r.manifestChanged, 'manifest must change');

  const manifest = JSON.parse(
    await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  assert.equal(manifest.counts.issues, 1);
  assert.equal(manifest.counts.domains, 1);
  assert.equal(manifest.counts.flows, 1);
  assert.equal(manifest.counts.evidenceRecords, 1);
});

test('syncStatus: idempotent — running twice produces no second-run change', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  await syncStatus({ cwd: fx.cwd });
  const r2 = await syncStatus({ cwd: fx.cwd });
  assert.equal(r2.manifestChanged, false, 'second run is a no-op (counts already match disk)');
});

test('syncStatus: updates 03_execution_status.md "counts" generated section', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await syncStatus({ cwd: fx.cwd });
  const status = await readFile(path.join(fx.wsDir, '03_execution_status.md'), 'utf8');
  const { sections } = parseMarkers(status);
  const counts = sections.get('counts').contentLines.join('\n');
  assert.match(counts, /domains: 1/);
  assert.match(counts, /flows: 1/);
});

test('syncStatus: --dry-run writes ZERO files', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  let writes = 0;
  await syncStatus(
    { cwd: fx.cwd, dryRun: true },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0);

  // And the manifest is byte-unchanged.
  const m = JSON.parse(await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'));
  assert.equal(m.counts.issues, 5, 'original mismatch preserved under --dry-run');
});

test('syncStatus: refuses on malformed markers in 03_execution_status.md', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Corrupt the status file with an unmatched START.
  await writeFile(
    path.join(fx.wsDir, '03_execution_status.md'),
    '# bad\n<!-- TESTATLAS:GENERATED:START section="orphan" -->\noops\n',
    'utf8',
  );

  await assert.rejects(
    () => syncStatus({ cwd: fx.cwd }),
    (err) => err.code === 'TESTATLAS_MARKER_INVALID',
  );
});

test("syncStatus: assertNotUpdate('command') is the FIRST call", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await syncStatus(
    { cwd: fx.cwd, dryRun: true },
    {
      assertNotUpdate: (ctx) => {
        calls.push(ctx);
      },
    },
  );
  assert.equal(calls[0], 'command');
});
