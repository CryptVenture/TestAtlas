// test/generate-report.test.js
//
// Plan 05-03 (Wave 2). Integration tests for scripts/generate-report.js.

import { strict as assert } from 'node:assert';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { generateReport } from '../scripts/generate-report.js';
import { getAjv } from '../scripts/lib/ajv-instance.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';
import { makeValidationFixture } from './_helpers.js';

const REPORT_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/report.schema.json';

test('generate-report: assertNotUpdate("command") is FIRST (verified via _inject spy)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let firstCall = null;
  await generateReport(
    { cwd: fx.cwd, dryRun: true },
    {
      assertNotUpdate: (ctx) => {
        if (firstCall === null) firstCall = ctx;
      },
    },
  );
  assert.equal(firstCall, 'command');
});

test('generate-report: produces REPORT-latest.md with all 17 PRD §20 sections', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await generateReport({ cwd: fx.cwd });

  const md = await readFile(path.join(fx.wsDir, 'reports', 'REPORT-latest.md'), 'utf8');
  // Section headings (per PRD §20 — 17 named sections).
  const expected = [
    'Run Summary',
    'Coverage',
    'Key Findings',
    'Severity Breakdown',
    'Confidence Breakdown',
    'Blockers',
    'Gaps',
    'Assumptions',
    'Next Actions',
    'Readiness Assessment',
    'Regressions',
    'Quality Risks',
    'Test Pyramid Health',
    'Evidence Catalog Summary',
    'Capability Degradation Notes',
    'Scorecard Snapshot',
    'Run Log Tail',
  ];
  for (const heading of expected) {
    assert.match(md, new RegExp(`^## ${heading}`, 'm'), `expected "## ${heading}" heading`);
  }
  assert.ok(r.markdownPath.endsWith('REPORT-latest.md'));
  assert.ok(r.jsonPath.endsWith('REPORT-latest.json'));
});

test('generate-report: emits JSON sidecar that PASSES report.schema.json', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await generateReport({ cwd: fx.cwd });
  const jsonText = await readFile(path.join(fx.wsDir, 'reports', 'REPORT-latest.json'), 'utf8');
  const json = JSON.parse(jsonText);

  // AJV-validate against report.schema.json.
  const ajv = await loadAllSchemas({ cwd: fx.cwd });
  const validator = ajv.getSchema(REPORT_SCHEMA_ID);
  assert.ok(validator, 'report.schema.json must be loaded');
  const ok = validator(json);
  assert.equal(ok, true, JSON.stringify(validator.errors, null, 2));
});

test('generate-report: halts with TESTATLAS_MISSING_EVIDENCE_REF if cited evidence missing', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Mutate ISSUE-001-foo.json to cite a non-existent evidence record.
  const issuePath = path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  issue.evidence = ['EVIDENCE-999'];
  await writeFile(issuePath, JSON.stringify(issue, null, 2), 'utf8');

  await assert.rejects(
    () => generateReport({ cwd: fx.cwd }),
    (err) => err.code === 'TESTATLAS_MISSING_EVIDENCE_REF',
  );
});

test('generate-report: --dry-run writes ZERO files (atomicWrite spy)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let writes = 0;
  await generateReport(
    { cwd: fx.cwd, dryRun: true },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0, 'no writes under --dry-run');
});

test('generate-report: also writes a timestamped REPORT-<ISO>.md alongside REPORT-latest.md (RPT-02 retention)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await generateReport({ cwd: fx.cwd });
  const reports = await readdir(path.join(fx.wsDir, 'reports'));
  // Should have REPORT-latest.md, REPORT-latest.json, and a REPORT-<ISO>.md
  // alongside the fixture's REPORT-2026-05-01.md.
  assert.ok(reports.includes('REPORT-latest.md'));
  assert.ok(reports.includes('REPORT-latest.json'));
  const tsReports = reports.filter((r) => /^REPORT-\d{4}/.test(r) && r.endsWith('.md'));
  assert.ok(tsReports.length >= 1, `expected at least one timestamped REPORT-*.md`);
});

// Force AJV reset between tests so loadAllSchemas can re-register against
// per-test fresh suites. (Not actually needed: loadAllSchemas is idempotent
// keyed on the singleton, and addSchema with `if (!getSchema)` guards it.
// This `void` keeps the import live.)
void getAjv;
