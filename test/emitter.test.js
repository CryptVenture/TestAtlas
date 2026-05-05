// test/emitter.test.js
//
// Plan 05-01 Task 2 unit tests for scripts/lib/emitter.js.

import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { emit } from '../scripts/lib/emitter.js';
import { makeValidationFixture } from './_helpers.js';

const ISSUE_SCHEMA = 'https://testatlas.dev/schemas/v1/issue.schema.json';

const NOW = '2026-05-03T12:00:00Z';

function validIssueRecord() {
  return {
    $schema: ISSUE_SCHEMA,
    id: 'ISSUE-009-test',
    slug: 'test',
    title: 'Test Issue',
    status: 'new',
    severity: 'medium',
    confidence: 'confirmed',
    type: 'functional',
    domain: 'domain-auth',
    flow: null,
    foundOn: NOW,
    summary: 'A test issue.',
    expectedBehavior: 'X',
    actualBehavior: 'Y',
    userImpact: 'Z',
    reproductionSteps: ['step 1'],
    frequency: 'unknown',
    evidence: ['EVIDENCE-001'],
    acceptanceCriteria: ['fix it'],
    lastUpdatedAt: NOW,
  };
}

test('emit() validates record against schema BEFORE writing — throws TESTATLAS_INVALID_RECORD on bad record', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let writeCount = 0;
  const spyAtomicWrite = async () => {
    writeCount++;
  };

  const bad = validIssueRecord();
  delete bad.evidence; // violates required

  await assert.rejects(
    () =>
      emit(
        {
          schemaId: ISSUE_SCHEMA,
          templateMdPath: '.testatlas/templates/issues/ISSUE.md',
          targetDir: 'to_fix',
          filenameMd: (r) => `${r.id}.md`,
          filenameJson: (r) => `${r.id}.json`,
          record: bad,
          cwd: fx.cwd,
          workspaceDir: fx.wsDir,
        },
        { atomicWrite: spyAtomicWrite },
      ),
    (err) => err.code === 'TESTATLAS_INVALID_RECORD' && Array.isArray(err.validationErrors),
  );

  assert.equal(writeCount, 0, 'no writes must occur on validation failure');
});

test('emit() with dryRun:true performs ZERO writes', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let writeCount = 0;
  const spyAtomicWrite = async () => {
    writeCount++;
  };

  const r = await emit(
    {
      schemaId: ISSUE_SCHEMA,
      templateMdPath: '.testatlas/templates/issues/ISSUE.md',
      targetDir: 'to_fix',
      filenameMd: (rec) => `${rec.id}.md`,
      filenameJson: (rec) => `${rec.id}.json`,
      record: validIssueRecord(),
      cwd: fx.cwd,
      workspaceDir: fx.wsDir,
      dryRun: true,
    },
    { atomicWrite: spyAtomicWrite },
  );

  assert.equal(writeCount, 0);
  assert.equal(r.validated, true);
  assert.match(r.mdPath, /ISSUE-009-test\.md$/);
});

test('emit() applies {{key}} substitutions in markdown template', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Drop in a template with a known {{title}} marker.
  // Note (Phase 10 Plan 01): the YAML-key-style line `Unknown: {{nope}}` is
  // now DROPPED by applyTemplate's drop-line-on-missing semantics (fixes
  // ISSUE-001/002/003). Prose-mode lines like `# Issue: {{title}}` still
  // retain literal placeholders for missing keys (broken signal preserved).
  const tmplRel = '.testatlas/templates/issues/__TEST_TEMPLATE.md';
  await writeFile(
    path.join(fx.cwd, tmplRel),
    '# Issue: {{title}}\n\nID: {{id}}\nUnknown prose with {{nope}} inline\nUnknown: {{nope}}\n',
    'utf8',
  );

  const captured = {};
  const spyAtomicWrite = async (p, contents) => {
    captured[p] = contents;
  };

  await emit(
    {
      schemaId: ISSUE_SCHEMA,
      templateMdPath: tmplRel,
      targetDir: 'to_fix',
      filenameMd: (r) => `${r.id}.md`,
      filenameJson: (r) => `${r.id}.json`,
      record: validIssueRecord(),
      cwd: fx.cwd,
      workspaceDir: fx.wsDir,
    },
    { atomicWrite: spyAtomicWrite },
  );

  const mdEntry = Object.entries(captured).find(([p]) => p.endsWith('.md'));
  assert.ok(mdEntry, 'markdown file should be written');
  assert.match(mdEntry[1], /# Issue: Test Issue\n/);
  assert.match(mdEntry[1], /ID: ISSUE-009-test\n/);
  // Prose-mode line: literal {{nope}} preserved (broken signal stays visible).
  assert.match(mdEntry[1], /Unknown prose with \{\{nope\}\} inline/);
  // YAML-key-style line: dropped entirely under Phase 10 Plan 01 contract.
  assert.doesNotMatch(mdEntry[1], /^Unknown: /m);
});

test('emit() atomic-writes BOTH md and json files when not dry-run', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await emit({
    schemaId: ISSUE_SCHEMA,
    templateMdPath: '.testatlas/templates/issues/ISSUE.md',
    targetDir: 'to_fix',
    filenameMd: (r) => `${r.id}.md`,
    filenameJson: (r) => `${r.id}.json`,
    record: validIssueRecord(),
    cwd: fx.cwd,
    workspaceDir: fx.wsDir,
  });

  const mdText = await readFile(path.join(fx.wsDir, 'to_fix/ISSUE-009-test.md'), 'utf8');
  const jsonText = await readFile(path.join(fx.wsDir, 'to_fix/ISSUE-009-test.json'), 'utf8');
  assert.ok(mdText.length > 0);
  const parsed = JSON.parse(jsonText);
  assert.equal(parsed.id, 'ISSUE-009-test');
});

test('emit() throws TESTATLAS_UNKNOWN_SCHEMA for an unregistered schemaId', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await assert.rejects(
    () =>
      emit({
        schemaId: 'https://testatlas.dev/schemas/v1/nonexistent.schema.json',
        templateMdPath: '.testatlas/templates/issues/ISSUE.md',
        targetDir: 'to_fix',
        filenameMd: () => 'x.md',
        filenameJson: () => 'x.json',
        record: validIssueRecord(),
        cwd: fx.cwd,
        workspaceDir: fx.wsDir,
        dryRun: true,
      }),
    (err) => err.code === 'TESTATLAS_UNKNOWN_SCHEMA',
  );
});
