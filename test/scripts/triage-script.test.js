// test/scripts/triage-script.test.js
//
// Quick 260506-esm: pin behavior of `scripts/triage.js` accelerator.
//
// triage.js mirrors create-issue.js / generate-report.js shape: it loads every
// `_testatlas/to_fix/ISSUE-*.json`, applies 3 duplicate heuristics, verifies
// evidence-on-disk (downgrades confidence to needs-validation if missing),
// transitions status:new → status:triaged, accepts repeatable
// `--severity-override <issue-id>=<new-severity>` flags, AJV-validates every
// mutated record BEFORE write, and writes triage-report-<ts>.md, blockers.md,
// groups.md alongside refreshed cross-cut indexes.
//
// Tests spawn the CLI as a subprocess against a test/fixtures/workspaces/
// scenario tree to keep the production CLI path under test (matching the
// pattern used by test/scripts/create-issue.test.js).

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { makeValidationFixture, REPO_ROOT } from '../_helpers.js';

const TRIAGE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'triage.js');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Synthesize an issue JSON record passing issue.schema.json. Uses ISSUE-001-foo
 * fixture as a baseline and overrides per-call.
 */
function makeIssue(overrides = {}) {
  const id = overrides.id ?? 'ISSUE-002-bar';
  const slug = overrides.slug ?? id.replace(/^ISSUE-\d{3,}-/, '');
  return {
    $schema: 'https://testatlas.dev/schemas/v1/issue.schema.json',
    id,
    slug,
    title: overrides.title ?? `Title for ${id}`,
    status: overrides.status ?? 'new',
    severity: overrides.severity ?? 'medium',
    confidence: overrides.confidence ?? 'confirmed',
    type: overrides.type ?? 'functional',
    domain: overrides.domain ?? 'domain-auth',
    flow: overrides.flow ?? null,
    environment: 'local',
    persona: '',
    foundOn: '2026-05-01T12:00:00Z',
    foundBy: 'agent',
    summary: overrides.summary ?? `Summary for ${id}`,
    expectedBehavior: 'expected',
    actualBehavior: 'actual',
    userImpact: 'impact',
    reproductionSteps: overrides.reproductionSteps ?? ['step 1', 'step 2'],
    frequency: 'always',
    evidence: overrides.evidence ?? ['EVIDENCE-001'],
    acceptanceCriteria: ['resolved'],
    lastUpdatedAt: '2026-05-01T12:00:00Z',
    history: overrides.history ?? [],
  };
}

/**
 * Add a synthesized issue to a workspace fixture (writes the JSON sidecar).
 */
async function addIssue(wsDir, issue) {
  const dir = path.join(wsDir, 'to_fix');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${issue.id}.json`),
    `${JSON.stringify(issue, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Spawn triage.js with the given argv against the fixture cwd.
 */
function runTriage(cwd, argv = []) {
  const result = spawnSync('node', [TRIAGE_SCRIPT, ...argv], {
    cwd,
    encoding: 'utf8',
  });
  return result;
}

// ─── tests ──────────────────────────────────────────────────────────────────

test('triage.js: --help advertises CLI shape', () => {
  const res = spawnSync('node', [TRIAGE_SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0, `exit non-zero: ${res.stderr}`);
  assert.match(res.stdout, /triage\.js/);
  assert.match(res.stdout, /--workspace/);
  assert.match(res.stdout, /--cwd/);
  assert.match(res.stdout, /--dry-run/);
  assert.match(res.stdout, /--severity-override/);
});

test('triage.js: transitions status:new → status:triaged for every untriaged issue', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  // Add a status:new issue beyond the baseline ISSUE-001-foo (already status:new).
  await addIssue(fx.wsDir, makeIssue({ id: 'ISSUE-002-baz', status: 'new' }));

  const res = runTriage(fx.cwd, []);
  assert.equal(res.status, 0, `triage exit non-zero: ${res.stderr}`);

  const j1 = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  const j2 = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-002-baz.json'), 'utf8'),
  );
  assert.equal(j1.status, 'triaged');
  assert.equal(j2.status, 'triaged');
  // history append-only: entry exists with action='triaged'
  assert.ok(Array.isArray(j1.history) && j1.history.some((h) => h.action === 'triaged'));
  assert.ok(Array.isArray(j2.history) && j2.history.some((h) => h.action === 'triaged'));
});

test('triage.js: --dry-run leaves issues untouched', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await addIssue(fx.wsDir, makeIssue({ id: 'ISSUE-002-baz', status: 'new' }));

  const before = await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-002-baz.json'), 'utf8');
  const res = runTriage(fx.cwd, ['--dry-run']);
  assert.equal(res.status, 0, `triage exit non-zero: ${res.stderr}`);
  const after = await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-002-baz.json'), 'utf8');
  assert.equal(before, after, 'dry-run mutated the issue file');
});

test('triage.js: idempotent — re-running on an all-triaged corpus is a no-op', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  // First pass — transitions to triaged.
  let res = runTriage(fx.cwd, []);
  assert.equal(res.status, 0, `first pass exit non-zero: ${res.stderr}`);

  const issuePath = path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const afterFirst = JSON.parse(await readFile(issuePath, 'utf8'));
  const histLenAfterFirst = (afterFirst.history ?? []).length;

  // Second pass should NOT add another history entry, since nothing changed.
  res = runTriage(fx.cwd, []);
  assert.equal(res.status, 0, `second pass exit non-zero: ${res.stderr}`);
  const afterSecond = JSON.parse(await readFile(issuePath, 'utf8'));
  assert.equal(
    (afterSecond.history ?? []).length,
    histLenAfterFirst,
    'idempotency: history length should not grow on a no-op pass',
  );
});

test('triage.js: --severity-override applies an explicit severity change', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const res = runTriage(fx.cwd, ['--severity-override', 'ISSUE-001-foo=low']);
  assert.equal(res.status, 0, `triage exit non-zero: ${res.stderr}`);
  const j = JSON.parse(await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'));
  assert.equal(j.severity, 'low');
  // History should include severityChange { from: 'medium', to: 'low' }.
  const sev = (j.history ?? []).find((h) => h.severityChange);
  assert.ok(sev, 'no severityChange entry');
  assert.equal(sev.severityChange.from, 'medium');
  assert.equal(sev.severityChange.to, 'low');
});

test('triage.js: rejects --severity-override with invalid severity value', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const res = runTriage(fx.cwd, ['--severity-override', 'ISSUE-001-foo=bogus']);
  assert.notEqual(res.status, 0, 'expected non-zero exit on invalid severity');
  assert.match(res.stderr, /severity/i);
});

test('triage.js: downgrades confidence to needs-validation when evidence missing', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Issue cites EVIDENCE-999 which does not exist on disk.
  await addIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-002-bad-evidence',
      status: 'new',
      confidence: 'confirmed',
      evidence: ['EVIDENCE-999'],
    }),
  );

  const res = runTriage(fx.cwd, []);
  // Brief permits non-zero exit on missing-evidence-detected; we only
  // require that the script flags it via downgrade and surfaces in stderr.
  const j = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-002-bad-evidence.json'), 'utf8'),
  );
  assert.equal(j.confidence, 'needs-validation');
  assert.match(res.stderr + res.stdout, /EVIDENCE-999|missing[- ]evidence/i);
});

test('triage.js: writes triage-report-<ts>.md, blockers.md, groups.md', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await addIssue(
    fx.wsDir,
    makeIssue({
      id: 'ISSUE-002-blocker',
      status: 'new',
      severity: 'critical',
      confidence: 'confirmed',
    }),
  );

  const res = runTriage(fx.cwd, []);
  assert.equal(res.status, 0, `triage exit non-zero: ${res.stderr}`);

  const toFixEntries = await readdir(path.join(fx.wsDir, 'to_fix'));
  const triageReports = toFixEntries.filter((n) => /^triage-report-.+\.md$/.test(n));
  assert.equal(triageReports.length, 1, 'expected exactly one triage-report-<ts>.md');

  const blockers = await readFile(path.join(fx.wsDir, 'to_fix', 'blockers.md'), 'utf8');
  assert.match(blockers, /ISSUE-002-blocker/);

  const groups = await readFile(path.join(fx.wsDir, 'to_fix', 'groups.md'), 'utf8');
  assert.ok(groups.length > 0);
});
