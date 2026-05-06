// test/scripts/generate-report-views.test.js
//
// Quick 260506-dyb Gap 5 — generate-report.js must emit four per-area
// views alongside REPORT-latest.md (per /atlas:report command spec line ~86):
//   - regressions.md     — issues with type:regression grouped by domain
//   - readiness.md       — single-line verdict + drivers
//   - coverage.md        — domain × flow × scenario × state matrix
//   - quality_risks.md   — risks + open issues at confidence:needs-validation
//
// Atomic regeneration each report run; no incremental append history.

import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { generateReport } from '../../scripts/generate-report.js';
import { makeValidationFixture } from '../_helpers.js';

test('Gap 5: generate-report emits regressions/readiness/coverage/quality_risks views', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Mutate ISSUE-001-foo.json to be type:regression so the regressions view
  // has content to assert against.
  const issuePath = path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  issue.type = 'regression';
  issue.confidence = 'needs-validation';
  await writeFile(issuePath, JSON.stringify(issue, null, 2), 'utf8');

  await generateReport({ cwd: fx.cwd });

  const reportsDir = path.join(fx.wsDir, 'reports');
  for (const name of ['regressions.md', 'readiness.md', 'coverage.md', 'quality_risks.md']) {
    const p = path.join(reportsDir, name);
    const txt = await readFile(p, 'utf8');
    assert.ok(txt.length > 0, `${name} should have content`);
  }

  // regressions.md: must reference the regression issue.
  const regressionsTxt = await readFile(path.join(reportsDir, 'regressions.md'), 'utf8');
  assert.match(regressionsTxt, /ISSUE-001-foo/, 'regressions.md must list ISSUE-001-foo');

  // readiness.md: single verdict line.
  const readinessTxt = await readFile(path.join(reportsDir, 'readiness.md'), 'utf8');
  assert.match(readinessTxt, /(READY|CONDITIONAL|NOT READY)/, 'readiness.md must carry verdict');

  // coverage.md: domain header.
  const coverageTxt = await readFile(path.join(reportsDir, 'coverage.md'), 'utf8');
  assert.match(coverageTxt, /## Coverage/i, 'coverage.md must have a Coverage section');

  // quality_risks.md: must reference the needs-validation issue.
  const qualityRisksTxt = await readFile(path.join(reportsDir, 'quality_risks.md'), 'utf8');
  assert.match(
    qualityRisksTxt,
    /ISSUE-001-foo/,
    'quality_risks.md must list needs-validation issues',
  );
});
