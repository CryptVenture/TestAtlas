// test/scripts/generate-report-run-dedup.test.js
//
// Quick 260506-dyb Gap 1 — readTestRuns() must group by RUN-<ts> stem so a
// single run with both .md frontmatter and .json sidecar is counted ONCE,
// not twice. JSON sidecar wins; .md frontmatter is supplementary only.

import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { generateReport } from '../../scripts/generate-report.js';
import { makeValidationFixture } from '../_helpers.js';

test('Gap 1: generate-report dedupes run by stem (md+json pair = 1, json-only = 1, total = 2)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const runsDir = path.join(fx.wsDir, 'tests', 'runs');
  await mkdir(runsDir, { recursive: true });

  // Run A — md+json pair (single run, must collapse to ONE entry).
  const runAJson = {
    $schema: 'https://testatlas.dev/schemas/v1/test-run.schema.json',
    id: 'RUN-20260101T000000Z',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z',
    environment: 'local',
    commandsExecuted: ['/atlas:test-flow'],
    scenariosRun: [],
    passed: 0,
    failed: 0,
    blocked: 0,
    evidence: [],
    issuesCreated: [],
    flowConfidenceUpdates: [],
  };
  await writeFile(
    path.join(runsDir, 'RUN-20260101T000000Z.json'),
    JSON.stringify(runAJson, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(runsDir, 'RUN-20260101T000000Z.md'),
    '---\nid: RUN-20260101T000000Z\nenvironment: local\n---\n\n# Run A\n',
    'utf8',
  );

  // Run B — json-only (still ONE entry).
  const runBJson = {
    ...runAJson,
    id: 'RUN-20260202T000000Z',
    startedAt: '2026-02-02T00:00:00.000Z',
    endedAt: '2026-02-02T00:01:00.000Z',
  };
  await writeFile(
    path.join(runsDir, 'RUN-20260202T000000Z.json'),
    JSON.stringify(runBJson, null, 2),
    'utf8',
  );

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });

  // 2 distinct runs, NOT 3 (which would be the bug: A.md + A.json + B.json).
  assert.equal(
    r.jsonReport.testsExecuted,
    2,
    `expected testsExecuted=2 (one per stem), got ${r.jsonReport.testsExecuted}`,
  );
  assert.match(r.jsonReport.runSummary, /2 run\(s\)/);
});
