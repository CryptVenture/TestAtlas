// test/summarize-run.test.js
//
// Plan 05-01 Task 3 tests.

import { strict as assert } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { summarizeRun } from '../scripts/summarize-run.js';
import { makeValidationFixture } from './_helpers.js';

async function seedRuns(wsDir, runs) {
  await mkdir(path.join(wsDir, 'tests/runs'), { recursive: true });
  for (const r of runs) {
    const fm = [
      '---',
      `runId: ${r.runId}`,
      `flowId: ${r.flowId}`,
      `result: ${r.result}`,
      `startedAt: ${r.startedAt}`,
      `endedAt: ${r.endedAt}`,
      `evidenceRefs: [${(r.evidenceRefs ?? []).map((e) => JSON.stringify(e)).join(', ')}]`,
      '---',
      '',
      r.body ?? '(run body)',
      '',
    ].join('\n');
    await writeFile(path.join(wsDir, 'tests/runs', `${r.runId}.md`), fm, 'utf8');
  }
}

test('summarizeRun: distills RUN-*.md files into a session summary', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await seedRuns(fx.wsDir, [
    {
      runId: 'RUN-2026-05-01-001',
      flowId: 'FLOW-auth-login',
      result: 'pass',
      startedAt: '2026-05-01T10:00:00Z',
      endedAt: '2026-05-01T10:05:00Z',
      evidenceRefs: ['EVIDENCE-001'],
    },
    {
      runId: 'RUN-2026-05-01-002',
      flowId: 'FLOW-auth-login',
      result: 'fail',
      startedAt: '2026-05-01T10:10:00Z',
      endedAt: '2026-05-01T10:12:00Z',
      evidenceRefs: ['EVIDENCE-001'],
    },
  ]);

  const r = await summarizeRun({ cwd: fx.cwd });
  assert.equal(r.total, 2);
  assert.equal(r.passed, 1);
  assert.equal(r.failed, 1);
  assert.equal(r.evidenceCount, 2);

  const summary = await readFile(r.outputPath, 'utf8');
  assert.match(summary, /Total runs: 2/);
  assert.match(summary, /Passed: 1/);
  assert.match(summary, /Failed: 1/);
  assert.match(summary, /RUN-2026-05-01-001/);
});

test('summarizeRun: --since filters older runs', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await seedRuns(fx.wsDir, [
    {
      runId: 'RUN-old',
      flowId: 'FLOW-auth-login',
      result: 'pass',
      startedAt: '2026-04-01T10:00:00Z',
      endedAt: '2026-04-01T10:05:00Z',
    },
    {
      runId: 'RUN-new',
      flowId: 'FLOW-auth-login',
      result: 'pass',
      startedAt: '2026-05-01T10:00:00Z',
      endedAt: '2026-05-01T10:05:00Z',
    },
  ]);

  const r = await summarizeRun({ cwd: fx.cwd, since: '2026-05-01T00:00:00Z' });
  assert.equal(r.total, 1);
  assert.equal(r.runs[0].runId, 'RUN-new');
});

test('summarizeRun: --dry-run writes ZERO files', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await seedRuns(fx.wsDir, [
    {
      runId: 'RUN-1',
      flowId: 'FLOW-auth-login',
      result: 'pass',
      startedAt: '2026-05-01T10:00:00Z',
      endedAt: '2026-05-01T10:05:00Z',
    },
  ]);

  let writes = 0;
  await summarizeRun(
    { cwd: fx.cwd, dryRun: true },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0);
});

test("summarizeRun: assertNotUpdate('command') is the FIRST call", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await summarizeRun(
    { cwd: fx.cwd, dryRun: true },
    {
      assertNotUpdate: (ctx) => {
        calls.push(ctx);
      },
    },
  );
  assert.equal(calls[0], 'command');
});
