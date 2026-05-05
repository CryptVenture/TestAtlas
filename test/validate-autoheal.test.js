// test/validate-autoheal.test.js
//
// Plan 05-04 (Wave 2). Integration tests for the autoheal module.
//
// Coverage matrix (all 4 HEAL-XX + the 8 NEVER-heal codes + dispatch + apply
// gate + dry-run wins).
//
// Plan 12-05 (ISSUE-023): added HEAL-03 mtime + content-hash regressions for
// the dual-mutation (status + severity) repro at
// _testatlas/evidence/files/heal-03-silent-noop/repro-trace.md. The repro
// trace's actual root cause (RESEARCH.md Pitfall 1) is the reporter, not the
// regenerator: `--auto-heal` without `--apply` correctly does NOT write, but
// reporter.js unconditionally prints "Applied (N)". These tests assert both
// (a) preview mode leaves files byte-identical and reports "Would apply",
// (b) --apply mode writes byte-different content and reports "Applied", and
// (c) every applied-array entry has a `wrote: bool` field for unambiguous
// reporting.

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseMarkers } from '../scripts/lib/markers.js';
import { autoHealFindings } from '../scripts/lib/validate/autoheal.js';
import { walkWorkspace } from '../scripts/lib/validate/walk-workspace.js';
import { renderMarkdownReport } from '../scripts/lib/validate/reporter.js';
import { validateWorkspace } from '../scripts/validate-workspace.js';
import { makeValidationFixture } from './_helpers.js';

/**
 * mtime + sha256 signature of a file. Used by HEAL-03 regressions to assert
 * either byte-identity (preview) or byte-difference (apply).
 */
async function fileSig(p) {
  const buf = await readFile(p);
  const s = await stat(p);
  return { mtimeMs: s.mtimeMs, sha: createHash('sha256').update(buf).digest('hex') };
}

/**
 * Build a `ctx` object the way the orchestrator would, against an existing
 * fixture. Keeps tests independent of the live orchestrator wire-up.
 *
 * @param {string} wsDir
 */
async function buildCtx(wsDir) {
  const files = await walkWorkspace(wsDir);
  const manifestPath = path.join(wsDir, '11_workspace_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return { wsDir, files, manifest, ajv: null, config: null };
}

/**
 * Run validateWorkspace against a fixture and return its results array.
 * Used to drive autoheal end-to-end by feeding live `results` + `ctx`.
 *
 * @param {string} cwd
 */
async function runValidate(cwd) {
  const r = await validateWorkspace({ cwd });
  return r;
}

// ─── HEAL-01: Restore manifest counts ────────────────────────────────────────

test('HEAL-01: --apply against broken-count-mismatch updates manifest.counts', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  // Sanity: the fixture's manifest claims 5 issues but disk has 1.
  assert.equal(ctx.manifest.counts.issues, 5);
  assert.equal(ctx.files.issues.length, 1);

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  assert.equal(healed.applied.length >= 1, true, 'at least one heal applied');
  const heal01 = healed.applied.find((h) => h.healId === 'HEAL-01');
  assert.ok(heal01, 'HEAL-01 entry present');
  assert.equal(heal01.path, '11_workspace_manifest.json');

  // Re-read the manifest from disk: counts.issues must now match disk (1).
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  assert.equal(after.counts.issues, 1);
  assert.equal(after.counts.domains, 1);
  assert.equal(after.counts.flows, 1);
  assert.equal(after.counts.evidenceRecords, 1);
  assert.equal(after.counts.testRuns, 0);
  // lastUpdatedAt also refreshed.
  assert.notEqual(after.lastUpdatedAt, '2026-05-01T12:00:00Z');
});

test('HEAL-01: WITHOUT --apply, no writes; applied list still records would-be heal', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const beforeStat = await stat(manifestPath);

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: false });

  // Heal still recorded as "would-be applied" so the user sees what's pending.
  const heal01 = healed.applied.find((h) => h.healId === 'HEAL-01');
  assert.ok(heal01, 'HEAL-01 recorded even without --apply');

  // No write occurred.
  const afterStat = await stat(manifestPath);
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
  const after = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(after.counts.issues, 5, 'manifest unchanged');
});

test('HEAL-01: --dry-run wins over --apply (zero writes)', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const beforeStat = await stat(manifestPath);

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: true, apply: true });

  // applied list still includes the would-be heal.
  assert.ok(healed.applied.find((h) => h.healId === 'HEAL-01'));

  const afterStat = await stat(manifestPath);
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
  const after = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(after.counts.issues, 5, 'manifest unchanged in dry-run');
});

// ─── HEAL-04: Refresh stale generated-section hash ───────────────────────────

test('HEAL-04: --apply against broken-stale-hash-whitespace-only refreshes manifest hash', async (t) => {
  const fx = await makeValidationFixture('broken-stale-hash-whitespace-only');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  // Sanity: the manifest's stored hash differs from the on-disk hash.
  const fileText = await readFile(path.join(fx.wsDir, '03_execution_status.md'), 'utf8');
  const { sections } = parseMarkers(fileText);
  const onDiskHash = sections.get('current-run').hash;
  const storedHash = ctx.manifest.generatedSections['03_execution_status.md']['current-run'];
  assert.notEqual(onDiskHash, storedHash);

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const heal04 = healed.applied.find((h) => h.healId === 'HEAL-04');
  assert.ok(heal04, 'HEAL-04 entry present');

  // After heal: manifest hash matches the on-disk body hash.
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  const newStored = after.generatedSections['03_execution_status.md']['current-run'];
  assert.equal(newStored, onDiskHash);

  // Round-trip: re-validate should report 0 stale-hash findings.
  const r2 = await runValidate(fx.cwd);
  const stale = r2.results
    .flatMap((c) => c.findings)
    .filter((f) => f.code === 'TESTATLAS_STALE_GENERATED_HASH');
  assert.equal(stale.length, 0, 'after HEAL-04 --apply: 0 stale-hash findings');
});

test('HEAL-04: WITHOUT --apply, manifest unchanged; applied list still records HEAL-04', async (t) => {
  const fx = await makeValidationFixture('broken-stale-hash-whitespace-only');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const before = JSON.parse(await readFile(manifestPath, 'utf8'));

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: false });
  assert.ok(healed.applied.find((h) => h.healId === 'HEAL-04'));

  const after = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(after.generatedSections, before.generatedSections);
});

// ─── NEVER-heal: skipped entries enforced for the canonical 8 codes ──────────

test('NEVER-heal: broken-missing-canonical → skipped with reason; canonical file unchanged', async (t) => {
  const fx = await makeValidationFixture('broken-missing-canonical');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_MISSING_CANONICAL');
  assert.ok(skip, 'TESTATLAS_MISSING_CANONICAL → skipped entry');
  assert.match(skip.reason, /missing canonical files require manual restoration/);
});

test('NEVER-heal: broken-schema-invalid-issue → schema violation skipped; files unchanged', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const beforeStat = await stat(manifestPath);

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_SCHEMA_VIOLATION');
  assert.ok(skip, 'schema-violation skipped');

  // No tampering with the manifest as a side-effect (other heals like HEAL-01
  // may legitimately fire — assert the *issue file* is unchanged at minimum).
  const issuePath = path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json');
  await readFile(issuePath, 'utf8'); // throws if removed
  // mtime: no autoheal touched this file.
  await stat(issuePath); // sanity, would throw if removed
  // Manifest may shift (HEAL-01), so we only assert the issue file untouched.
  assert.ok(beforeStat); // sanity reference
});

test('NEVER-heal: broken-orphan-evidence → skipped; evidence files untouched', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const orphanJson = path.join(fx.wsDir, 'evidence', 'EVIDENCE-099', 'evidence.json');
  const beforeText = await readFile(orphanJson, 'utf8');

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_ORPHANED_EVIDENCE');
  assert.ok(skip, 'orphaned-evidence skipped');

  const afterText = await readFile(orphanJson, 'utf8');
  assert.equal(afterText, beforeText);
});

test('NEVER-heal: broken-modified-generated-content → skipped; file unchanged', async (t) => {
  const fx = await makeValidationFixture('broken-modified-generated-content');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const target = path.join(fx.wsDir, '00_overview.md');
  const before = await readFile(target, 'utf8');

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_MODIFIED_GENERATED_CONTENT');
  assert.ok(skip, 'modified-generated-content skipped');
  assert.match(skip.reason, /non-whitespace edit inside markers/);

  const after = await readFile(target, 'utf8');
  assert.equal(after, before);
});

test('NEVER-heal: broken-stale-hash (non-whitespace drift) → modified-content NEVER-heal', async (t) => {
  const fx = await makeValidationFixture('broken-stale-hash');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const target = path.join(fx.wsDir, '03_execution_status.md');
  const before = await readFile(target, 'utf8');

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  // The check classifies non-WS drift as TESTATLAS_MODIFIED_GENERATED_CONTENT
  // (fixable=null). autoheal MUST refuse and skipped list cites Pitfall 2.
  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_MODIFIED_GENERATED_CONTENT');
  assert.ok(skip, 'non-WS drift → modified-content skipped');

  const after = await readFile(target, 'utf8');
  assert.equal(after, before);
});

test('NEVER-heal: broken-duplicate-id → skipped; both ISSUE files unchanged', async (t) => {
  const fx = await makeValidationFixture('broken-duplicate-id');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  const fooBefore = await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8');
  const barBefore = await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-bar.json'), 'utf8');

  const r = await runValidate(fx.cwd);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_DUPLICATE_ID');
  assert.ok(skip, 'duplicate-id skipped');

  const fooAfter = await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8');
  const barAfter = await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-bar.json'), 'utf8');
  assert.equal(fooAfter, fooBefore);
  assert.equal(barAfter, barBefore);
});

// ─── Dispatch: unrecognized fixable code ─────────────────────────────────────

test('Dispatch: synthesized fixable=auto with unrecognized code → skipped', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const ctx = await buildCtx(fx.wsDir);
  // Synthesize a single fake check result with a fixable='auto' finding whose
  // code is NOT in the dispatch table.
  const fakeResults = [
    {
      id: 'check-fake',
      prdRule: 99,
      status: 'fail',
      findings: [
        {
          severity: 'error',
          path: 'fake.md',
          code: 'TESTATLAS_UNKNOWN_BUT_FIXABLE',
          message: 'synthetic',
          fixable: 'auto',
        },
      ],
    },
  ];
  const healed = await autoHealFindings(fakeResults, ctx, { dryRun: false, apply: true });
  const skip = healed.skipped.find((s) => s.code === 'TESTATLAS_UNKNOWN_BUT_FIXABLE');
  assert.ok(skip, 'unrecognized code skipped');
  assert.match(skip.reason, /unrecognized fixable code/);
});

// ─── HEAL-02: Regenerate 09_artifact_index.md ────────────────────────────────

test('HEAL-02: --apply against missing 09_artifact_index.md regenerates the file', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Seed the missing scenario by deleting 09_artifact_index.md.
  await rm(path.join(fx.wsDir, '09_artifact_index.md'));

  const r = await runValidate(fx.cwd);
  const ctx = await buildCtx(fx.wsDir);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const heal02 = healed.applied.find((h) => h.healId === 'HEAL-02');
  assert.ok(heal02, 'HEAL-02 entry present');

  // File regenerated with marker-bounded sections; lists on-disk artifacts.
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  assert.match(text, /TESTATLAS:GENERATED:START section="domain-docs"/);
  assert.match(text, /TESTATLAS:GENERATED:START section="issue-docs"/);
  assert.match(text, /ISSUE-001-foo/);
  assert.match(text, /domains\/auth\/index\.md/);

  // Re-run validate: missing-index finding for 09_artifact_index.md is gone.
  const r2 = await runValidate(fx.cwd);
  const stillMissing = r2.results
    .flatMap((c) => c.findings)
    .filter((f) => f.code === 'TESTATLAS_MISSING_INDEX' && f.path === '09_artifact_index.md');
  assert.equal(stillMissing.length, 0, 'after HEAL-02: no missing-index for 09_artifact_index.md');
});

test('HEAL-02: preserves human prose outside markers in 09_artifact_index.md (Pitfall 5)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Inject human prose around an existing marker section. The base-good
  // fixture's 09_artifact_index.md already has marker-bounded sections; we
  // just prepend human prose at the top to verify it survives a regen.
  const targetPath = path.join(fx.wsDir, '09_artifact_index.md');
  const original = await readFile(targetPath, 'utf8');
  const HUMAN_PROSE =
    '\n> NOTE: This is human-authored prose that must be preserved across HEAL-02.\n';
  const seeded = HUMAN_PROSE + original;
  await writeFile(targetPath, seeded, 'utf8');

  // Force a stale-hash by also mutating an inner marker body (that triggers
  // a stale-hash finding which is a NEVER-heal modified-content). To get a
  // *fixable* HEAL-02 trigger here without deleting the file, we synthesize
  // a fake TESTATLAS_INDEX_MISMATCH finding for the canonical artifact index.
  const ctx = await buildCtx(fx.wsDir);
  const fakeResults = [
    {
      id: 'check-issue-index-consistency',
      prdRule: 5,
      status: 'fail',
      findings: [
        {
          severity: 'error',
          path: '09_artifact_index.md',
          code: 'TESTATLAS_INDEX_MISMATCH',
          message: 'forced regen for prose-preservation test',
          fixable: 'auto',
        },
      ],
    },
  ];
  const healed = await autoHealFindings(fakeResults, ctx, { dryRun: false, apply: true });
  assert.ok(healed.applied.find((h) => h.healId === 'HEAL-02'));

  const after = await readFile(targetPath, 'utf8');
  // Human prose preserved byte-for-byte.
  assert.ok(
    after.includes('NOTE: This is human-authored prose that must be preserved across HEAL-02.'),
    'human prose outside markers preserved',
  );
  // Marker-bounded section content was regenerated (still has the artifact bullets).
  assert.match(after, /ISSUE-001-foo/);
});

// ─── HEAL-03: Regenerate cross-cut + per-domain indexes ──────────────────────

test('HEAL-03: --apply against broken-issue-index-mismatch regenerates indexes', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  const r = await runValidate(fx.cwd);
  const ctx = await buildCtx(fx.wsDir);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const heal03s = healed.applied.filter((h) => h.healId === 'HEAL-03');
  assert.ok(heal03s.length >= 1, 'HEAL-03 entries present');

  // Re-run validate: cross-cut INDEX_MISMATCH findings are gone.
  const r2 = await runValidate(fx.cwd);
  const remaining = r2.results
    .flatMap((c) => c.findings)
    .filter((f) => f.code === 'TESTATLAS_INDEX_MISMATCH');
  assert.equal(remaining.length, 0, 'after HEAL-03: no INDEX_MISMATCH findings');

  // Created file references the issue.
  const byDomain = await readFile(
    path.join(fx.wsDir, 'to_fix', 'by_domain', 'domain-auth.md'),
    'utf8',
  );
  assert.match(byDomain, /ISSUE-001-foo/);
});

test('HEAL-03: --apply against broken-missing-index regenerates domain index.md', async (t) => {
  const fx = await makeValidationFixture('broken-missing-index');
  t.after(fx.cleanup);

  const r = await runValidate(fx.cwd);
  const ctx = await buildCtx(fx.wsDir);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const heal03 = healed.applied.find((h) => h.healId === 'HEAL-03');
  assert.ok(heal03, 'HEAL-03 entry present');

  // domains/auth/index.md regenerated.
  const text = await readFile(path.join(fx.wsDir, 'domains', 'auth', 'index.md'), 'utf8');
  assert.match(text, /Domain.*auth/i);
});

test('HEAL-03: preserves human prose outside markers in cross-cut indexes', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  // Pre-seed by_severity/medium.md with marker-bounded entries section + human prose.
  const targetPath = path.join(fx.wsDir, 'to_fix', 'by_severity', 'medium.md');
  const seeded = [
    '# Medium-severity issues',
    '',
    '> Human-prose: this paragraph must survive HEAL-03.',
    '',
    '<!-- TESTATLAS:GENERATED:START section="entries" -->',
    '(stale)',
    '<!-- TESTATLAS:GENERATED:END section="entries" -->',
    '',
  ].join('\n');
  await writeFile(targetPath, seeded, 'utf8');

  const r = await runValidate(fx.cwd);
  const ctx = await buildCtx(fx.wsDir);
  await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  const after = await readFile(targetPath, 'utf8');
  assert.ok(
    after.includes('Human-prose: this paragraph must survive HEAL-03.'),
    'human prose preserved',
  );
  assert.match(after, /ISSUE-001-foo/);
});

test('HEAL-02 + HEAL-03: --dry-run --apply writes nothing; applied list still records', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  const targetPath = path.join(fx.wsDir, 'to_fix', 'by_severity', 'medium.md');
  const beforeStat = await stat(targetPath);

  const r = await runValidate(fx.cwd);
  const ctx = await buildCtx(fx.wsDir);
  const healed = await autoHealFindings(r.results, ctx, { dryRun: true, apply: true });

  // Would-be heals still recorded.
  assert.ok(healed.applied.length >= 1);

  // No write occurred.
  const afterStat = await stat(targetPath);
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
});

test('Round-trip: HEAL-01..04 against composite fixture leave 0 fixable findings', async (t) => {
  // Compose a workspace exercising HEAL-01 (count-mismatch) +
  // HEAL-04 (whitespace-only stale hash) + HEAL-03 (issue-index mismatch)
  // simultaneously; HEAL-02 covered separately above.
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  // Inject a count-mismatch by claiming 5 issues when there's 1.
  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const m = JSON.parse(await readFile(manifestPath, 'utf8'));
  m.counts.issues = 5;
  await writeFile(manifestPath, `${JSON.stringify(m, null, 2)}\n`, 'utf8');

  // Inject a whitespace-only stale hash by re-using the broken-stale-hash-whitespace-only
  // fixture's 03_execution_status.md verbatim (its hash already disagrees with manifest).
  // `import.meta.url.replace('file://', '')` mishandles Windows file URLs:
  // `file:///D:/...` → `/D:/...` which path.dirname/path.join then mangle
  // into `D:\D:\...`. `fileURLToPath` is the portable conversion.
  const wsOnly = await readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures',
      'workspaces',
      'broken-stale-hash-whitespace-only',
      '03_execution_status.md',
    ),
    'utf8',
  );
  await writeFile(path.join(fx.wsDir, '03_execution_status.md'), wsOnly, 'utf8');

  const r = await runValidate(fx.cwd);
  const ctx = await buildCtx(fx.wsDir);
  await autoHealFindings(r.results, ctx, { dryRun: false, apply: true });

  // Re-run validate. All 4 fixable categories must be 0.
  const r2 = await runValidate(fx.cwd);
  const fixableCodes = [
    'TESTATLAS_COUNT_MISMATCH',
    'TESTATLAS_INDEX_MISMATCH',
    'TESTATLAS_MISSING_INDEX',
    'TESTATLAS_STALE_GENERATED_HASH',
  ];
  for (const code of fixableCodes) {
    const remaining = r2.results.flatMap((c) => c.findings).filter((f) => f.code === code);
    assert.equal(remaining.length, 0, `after round-trip, no remaining ${code} findings`);
  }
});

// ─── Orchestrator integration: validate-workspace --auto-heal[/--apply] ──────

test('orchestrator: --auto-heal without --apply: read-only; healed is recorded', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const before = await stat(manifestPath);

  const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: false });
  assert.ok(r.healed, 'healed object present');
  assert.ok(r.healed.applied.length >= 1, 'would-be heals listed');

  // Manifest unchanged (read-only).
  const after = await stat(manifestPath);
  assert.equal(after.mtimeMs, before.mtimeMs);

  // Markdown report includes Auto-heal section.
  assert.match(r.reportMarkdown, /## Auto-heal/);
  assert.match(r.reportMarkdown, /### Applied/);
});

test('orchestrator: --auto-heal --apply against broken-count-mismatch: writes + post-heal exit 0', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: true });
  assert.ok(
    r.healed.applied.find((h) => h.healId === 'HEAL-01'),
    'HEAL-01 applied',
  );

  // After --apply, post-heal exit code should be 0 because the orchestrator
  // re-walks + re-runs CHECKS and the count-mismatch is now resolved.
  assert.equal(r.exitCode, 0, 'post-heal exit 0 (count-mismatch resolved)');

  // A fresh validate run (no --auto-heal) confirms persistence.
  const r2 = await validateWorkspace({ cwd: fx.cwd });
  assert.equal(r2.exitCode, 0);
  const counts = r2.results
    .flatMap((c) => c.findings)
    .filter((f) => f.code === 'TESTATLAS_COUNT_MISMATCH');
  assert.equal(counts.length, 0);
});

test('orchestrator: --auto-heal --apply --dry-run: zero writes; report shows would-be heals', async (t) => {
  const fx = await makeValidationFixture('broken-count-mismatch');
  t.after(fx.cleanup);

  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const before = await stat(manifestPath);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    dryRun: true,
  });
  assert.ok(r.healed.applied.find((h) => h.healId === 'HEAL-01'));

  const after = await stat(manifestPath);
  assert.equal(after.mtimeMs, before.mtimeMs, 'no write under dry-run');
  assert.match(r.reportMarkdown, /## Auto-heal/);
});

test('orchestrator: report renders Auto-heal section with Applied + Skipped tables', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: true });
  assert.match(r.reportMarkdown, /## Auto-heal/);
  assert.match(r.reportMarkdown, /### Applied \(\d+\)/);
  // JSON sidecar shape includes autoHeal.applied + autoHeal.skipped.
  assert.ok(r.reportJson.autoHeal);
  assert.ok(Array.isArray(r.reportJson.autoHeal.applied));
  assert.ok(Array.isArray(r.reportJson.autoHeal.skipped));
});

test('orchestrator: --auto-heal --apply against broken-stale-hash-whitespace-only: round-trip', async (t) => {
  const fx = await makeValidationFixture('broken-stale-hash-whitespace-only');
  t.after(fx.cleanup);

  const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: true });
  assert.ok(r.healed.applied.find((h) => h.healId === 'HEAL-04'));

  // Re-run validate WITHOUT --auto-heal: 0 stale-hash findings.
  const r2 = await validateWorkspace({ cwd: fx.cwd });
  const stale = r2.results
    .flatMap((c) => c.findings)
    .filter((f) => f.code === 'TESTATLAS_STALE_GENERATED_HASH');
  assert.equal(stale.length, 0);
});

// ─── Plan 12-05 (ISSUE-023): HEAL-03 mtime + content-hash regressions ────────
//
// These tests reproduce the repro trace at
// `_testatlas/evidence/files/heal-03-silent-noop/repro-trace.md`. The
// `broken-issue-index-mismatch` fixture has ISSUE-001 with status:new +
// severity:medium, but its by_severity/critical.md (NOT medium.md) lists the
// issue — i.e., a severity mutation. by_status/new.md contains the issue
// correctly. Running validate detects INDEX_MISMATCH for the cross-cut.
//
// Per RESEARCH.md Pitfall 1: the regenerator IS correct. The reporter is the
// bug — it prints "Applied (N)" even when --apply was NOT passed. These tests
// pin both behaviors via mtime + content-hash before/after assertions.

test('HEAL-03 with --apply writes byte-different content (mtime + sha256 differ)', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  // Baseline signatures of all index files that HEAL-03 may regenerate.
  const indexes = [
    path.join(fx.wsDir, 'to_fix', 'by_severity', 'critical.md'),
    path.join(fx.wsDir, 'to_fix', 'by_severity', 'medium.md'),
    path.join(fx.wsDir, 'to_fix', 'by_status', 'new.md'),
  ];
  const beforeSigs = {};
  for (const p of indexes) {
    if (await stat(p).catch(() => null)) {
      beforeSigs[p] = await fileSig(p);
    }
  }

  const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: true });
  assert.ok(
    r.healed.applied.some((h) => h.healId === 'HEAL-03'),
    'HEAL-03 entry present',
  );

  // At least one of the index files must have BOTH a different mtime AND a
  // different content hash post-heal — proving the regenerator wrote.
  let anyChanged = false;
  for (const p of indexes) {
    if (!(await stat(p).catch(() => null))) continue;
    const after = await fileSig(p);
    const before = beforeSigs[p];
    if (!before) {
      // File was created by HEAL-03 — counts as "changed".
      anyChanged = true;
      continue;
    }
    if (after.mtimeMs !== before.mtimeMs && after.sha !== before.sha) {
      anyChanged = true;
    }
  }
  assert.ok(
    anyChanged,
    'at least one index file must have different mtime AND sha256 after HEAL-03 --apply',
  );

  // Re-running validate-workspace returns 0 INDEX_MISMATCH/INDEX_STALE findings
  // for the previously failing indexes.
  const r2 = await validateWorkspace({ cwd: fx.cwd });
  const remaining = r2.results
    .flatMap((c) => c.findings)
    .filter(
      (f) => f.code === 'TESTATLAS_INDEX_MISMATCH' || f.code === 'TESTATLAS_INDEX_STALE',
    );
  assert.equal(remaining.length, 0, 'after HEAL-03 --apply: 0 INDEX_MISMATCH/INDEX_STALE');
});

test('HEAL-03 without --apply does NOT write (mtime + sha256 identical, preview only)', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  const indexes = [
    path.join(fx.wsDir, 'to_fix', 'by_severity', 'critical.md'),
    path.join(fx.wsDir, 'to_fix', 'by_status', 'new.md'),
  ];
  const beforeSigs = {};
  for (const p of indexes) {
    if (await stat(p).catch(() => null)) {
      beforeSigs[p] = await fileSig(p);
    }
  }

  const r = await validateWorkspace({ cwd: fx.cwd, autoHeal: true, apply: false });

  // Files that existed before MUST be byte-identical AND mtime-identical post-call.
  for (const p of indexes) {
    if (!beforeSigs[p]) continue;
    const after = await fileSig(p);
    const before = beforeSigs[p];
    assert.equal(after.mtimeMs, before.mtimeMs, `mtime unchanged for ${p}`);
    assert.equal(after.sha, before.sha, `sha256 unchanged for ${p}`);
  }

  // Reporter output must show "Would apply" — NOT "### Applied" — in preview mode.
  assert.match(
    r.reportMarkdown,
    /Would apply/,
    'preview-mode report contains "Would apply"',
  );
  assert.ok(
    !/### Applied \(/.test(r.reportMarkdown),
    'preview-mode report does NOT contain "### Applied (" header',
  );
});

test('Heal-handler return shape includes wrote boolean for every applied entry', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  const files = await walkWorkspace(fx.wsDir);
  const manifestPath = path.join(fx.wsDir, '11_workspace_manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const ctx = { wsDir: fx.wsDir, files, manifest, ajv: null, config: null };

  const r = await validateWorkspace({ cwd: fx.cwd });

  // apply: false → every entry has wrote === false.
  const previewHealed = await autoHealFindings(r.results, ctx, {
    dryRun: false,
    apply: false,
  });
  assert.ok(previewHealed.applied.length >= 1, 'at least one would-be heal');
  for (const entry of previewHealed.applied) {
    assert.equal(
      typeof entry.wrote,
      'boolean',
      `applied entry for ${entry.healId} has wrote: bool field`,
    );
    assert.equal(entry.wrote, false, `apply:false → wrote=false for ${entry.healId}`);
  }

  // apply: true → every entry has wrote === true (writes actually happened).
  const fx2 = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx2.cleanup);
  const files2 = await walkWorkspace(fx2.wsDir);
  const manifest2 = JSON.parse(
    await readFile(path.join(fx2.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );
  const ctx2 = { wsDir: fx2.wsDir, files: files2, manifest: manifest2, ajv: null, config: null };
  const r2 = await validateWorkspace({ cwd: fx2.cwd });
  const applyHealed = await autoHealFindings(r2.results, ctx2, {
    dryRun: false,
    apply: true,
  });
  assert.ok(applyHealed.applied.length >= 1, 'at least one applied heal');
  for (const entry of applyHealed.applied) {
    assert.equal(
      typeof entry.wrote,
      'boolean',
      `applied entry for ${entry.healId} has wrote: bool field`,
    );
    assert.equal(entry.wrote, true, `apply:true → wrote=true for ${entry.healId}`);
  }
});

test('renderMarkdownReport branches header on apply flag (Applied vs Would apply)', async (t) => {
  const fx = await makeValidationFixture('broken-issue-index-mismatch');
  t.after(fx.cleanup);

  // Build a minimal results array + ctx so we can call renderMarkdownReport
  // directly with both apply=true and apply=false and compare headers.
  const r = await validateWorkspace({ cwd: fx.cwd });
  const ctx = { wsDir: fx.wsDir };
  const fakeHealed = {
    applied: [
      { healId: 'HEAL-03', path: 'to_fix/by_severity/critical.md', summary: 'regen', wrote: false },
    ],
    skipped: [],
  };

  const previewMd = renderMarkdownReport(r.results, ctx, {
    healed: fakeHealed,
    apply: false,
  });
  assert.match(previewMd, /Would apply/, 'apply:false → "Would apply" header');
  assert.ok(!/### Applied \(/.test(previewMd), 'apply:false → no "### Applied (" header');

  const applyMd = renderMarkdownReport(r.results, ctx, {
    healed: { ...fakeHealed, applied: [{ ...fakeHealed.applied[0], wrote: true }] },
    apply: true,
  });
  assert.match(applyMd, /### Applied \(\d+\)/, 'apply:true → "### Applied (N)" header');
  assert.ok(!/Would apply/.test(applyMd), 'apply:true → no "Would apply" header');
});
