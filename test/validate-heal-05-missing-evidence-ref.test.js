// test/validate-heal-05-missing-evidence-ref.test.js
//
// Quick 260506-vaq: HEAL-05 (suggestion-tier) coverage.
//
// HEAL-05 has two strategies, both gated on `--apply-suggestions`:
//
//   Strategy A — drop a dangling EVIDENCE-NNN entry from a parent artifact's
//                .evidence[] when the EVIDENCE-NNN dir is not on disk.
//   Strategy B — promote a path-form ref ("evidence/scratch/foo.png") to a
//                real EVIDENCE-NNN-<slug>/ sidecar layout, atomic-moving the
//                file and rewriting the parent .evidence[] entry.
//
// Defense-in-depth requirement: applySuggestions=false (default) MUST keep
// the existing NEVER-heal `skipped` entry — the NEVER_HEAL_REASONS map
// remains untouched.

import { strict as assert } from 'node:assert';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { validateWorkspace } from '../scripts/validate-workspace.js';
import { makeValidationFixture } from './_helpers.js';

/**
 * Set up a Strategy-A scenario: ISSUE-001-foo.evidence becomes a list of
 * three refs, two valid (EVIDENCE-001 — exists on disk) and one dangling
 * (EVIDENCE-999 — no on-disk dir).
 *
 * @param {string} wsDir
 */
async function seedStrategyA(wsDir) {
  const issuePath = path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  // Keep the existing valid EVIDENCE-001 ref + add another valid (EVIDENCE-099
  // — directory exists in this fixture even though it's "orphan-not-referenced")
  // + add a dangling EVIDENCE-999.
  issue.evidence = ['EVIDENCE-001', 'EVIDENCE-099', 'EVIDENCE-999'];
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
}

/**
 * Set up a Strategy-B happy-path scenario: drop a real binary file at
 * `evidence/scratch/screenshot.png` and reference it from the parent issue's
 * .evidence[] as the raw path string.
 *
 * @param {string} wsDir
 */
async function seedStrategyB(wsDir) {
  const scratchDir = path.join(wsDir, 'evidence', 'scratch');
  await mkdir(scratchDir, { recursive: true });
  const filePath = path.join(scratchDir, 'screenshot.png');
  // 1×1 transparent PNG header bytes — enough to be a "file with content".
  const buf = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  ]);
  await writeFile(filePath, buf);

  const issuePath = path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  issue.evidence = ['EVIDENCE-001', 'evidence/scratch/screenshot.png'];
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
}

/**
 * Set up a Strategy-B refusal scenario: parent issue references a path that
 * does NOT exist on disk. Handler must fall back to Strategy A semantics
 * (drop the entry) — no new dir created, parent's other entries preserved.
 *
 * @param {string} wsDir
 */
async function seedStrategyBNoFile(wsDir) {
  const issuePath = path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  issue.evidence = ['EVIDENCE-001', 'evidence/scratch/missing.png'];
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
}

// ─── Strategy A — dangling EVIDENCE-id ───────────────────────────────────────

test('HEAL-05 Strategy A: dangling EVIDENCE-NNN entry is dropped from parent .evidence[]', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);
  await seedStrategyA(fx.wsDir);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  assert.ok(r.healed, 'healed object present');
  const heal05 = (r.healed.applied ?? []).filter((h) => h.healId === 'HEAL-05');
  assert.ok(heal05.length >= 1, `expected at least one HEAL-05; got ${heal05.length}`);

  // Parent's evidence[] now length 2; "EVIDENCE-999" gone; the others preserved.
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.equal(after.evidence.length, 2);
  assert.ok(!after.evidence.includes('EVIDENCE-999'));
  assert.ok(after.evidence.includes('EVIDENCE-001'));
  assert.ok(after.evidence.includes('EVIDENCE-099'));
});

// ─── Strategy B — happy path: path-form ref → EVIDENCE-NNN-<slug> ────────────

test('HEAL-05 Strategy B: path-form ref to existing file is promoted to EVIDENCE-NNN with sidecar', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);
  await seedStrategyB(fx.wsDir);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  const heal05 = (r.healed?.applied ?? []).filter((h) => h.healId === 'HEAL-05');
  assert.ok(heal05.length >= 1, 'HEAL-05 entry recorded');

  // Determine the new EVIDENCE-NNN-screenshot dir. Numbering depends on which
  // ids already exist in the fixture (001, 099) — next-available is 100.
  const evidenceDir = path.join(fx.wsDir, 'evidence');
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const screenshotDir = entries.find((e) => /^EVIDENCE-\d+-screenshot$/.test(e.name));
  assert.ok(
    screenshotDir,
    `expected an EVIDENCE-NNN-screenshot dir; got ${entries.map((e) => e.name).join(', ')}`,
  );

  const newDirAbs = path.join(evidenceDir, screenshotDir.name);
  const movedFile = path.join(newDirAbs, 'screenshot.png');
  const sidecar = path.join(newDirAbs, 'evidence.json');

  // Original raw file is gone; new file present; sidecar present and valid.
  await assert.rejects(stat(path.join(fx.wsDir, 'evidence', 'scratch', 'screenshot.png')));
  await assert.doesNotReject(stat(movedFile));
  const sc = JSON.parse(await readFile(sidecar, 'utf8'));
  assert.equal(sc.id, screenshotDir.name);
  assert.equal(sc.type, 'file');
  assert.equal(sc.environment, 'auto-heal');
  assert.equal(sc.redacted, false);
  assert.equal(typeof sc.capturedOn, 'string');
  assert.equal(typeof sc.description, 'string');

  // Parent rewrite: original path-form entry replaced with the new id.
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.ok(after.evidence.includes(screenshotDir.name));
  assert.ok(!after.evidence.includes('evidence/scratch/screenshot.png'));
});

// ─── Strategy B refusal — file does NOT exist falls back to Strategy A ───────

test('HEAL-05 Strategy B refusal: missing file falls back to Strategy A (drops entry)', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);
  await seedStrategyBNoFile(fx.wsDir);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  const heal05 = (r.healed?.applied ?? []).filter((h) => h.healId === 'HEAL-05');
  assert.ok(heal05.length >= 1, 'HEAL-05 entry recorded (Strategy A fallback)');

  // No new EVIDENCE-NNN-missing dir was created.
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(path.join(fx.wsDir, 'evidence'), { withFileTypes: true });
  const newDirs = entries.filter((e) => /^EVIDENCE-\d+-missing/.test(e.name));
  assert.equal(newDirs.length, 0, 'no new EVIDENCE-NNN-missing dir should be created');

  // Parent's path-form entry is gone.
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.ok(!after.evidence.includes('evidence/scratch/missing.png'));
});

// ─── Sidecar AJV validation refusal ──────────────────────────────────────────
//
// Direct unit-level test: invoke autoHealFindings with a stubbed ajv that
// always returns invalid for the evidence schema. The handler must return
// null so the orchestrator records a `skipped` entry.

test('HEAL-05 Strategy B refusal: sidecar AJV validation failure returns null (skipped)', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);
  await seedStrategyB(fx.wsDir);

  const { autoHealFindings } = await import('../scripts/lib/validate/autoheal.js');
  const { walkWorkspace } = await import('../scripts/lib/validate/walk-workspace.js');
  const files = await walkWorkspace(fx.wsDir);
  const manifest = JSON.parse(
    await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8'),
  );

  // Stub AJV: every getSchema returns a validator that says "invalid".
  const stubAjv = {
    getSchema: () => () => false,
  };
  const ctx = { wsDir: fx.wsDir, files, manifest, ajv: stubAjv, config: null };

  // Synthesise a finding that triggers Strategy B.
  const finding = {
    severity: 'error',
    path: 'to_fix/ISSUE-001-foo.json',
    code: 'TESTATLAS_MISSING_EVIDENCE_REF',
    message:
      'Evidence reference "evidence/scratch/screenshot.png" is not in EVID-* form and could not be resolved',
    fixable: null,
  };
  const results = [{ findings: [finding] }];
  const healed = await autoHealFindings(results, ctx, {
    dryRun: false,
    apply: true,
    applySuggestions: true,
  });

  // Sidecar refusal → handler returns null → entry recorded as `skipped`
  // (via the NEVER-heal fallback for TESTATLAS_MISSING_EVIDENCE_REF).
  const heal05 = (healed.applied ?? []).filter((h) => h.healId === 'HEAL-05');
  assert.equal(heal05.length, 0, 'no HEAL-05 should be applied when AJV refuses');
  assert.ok(
    healed.skipped.some((s) => s.code === 'TESTATLAS_MISSING_EVIDENCE_REF'),
    'NEVER-heal fallback recorded the skipped entry',
  );
});

// ─── Defense-in-depth: applySuggestions=false (default) — NEVER-heal stands ──

test('HEAL-05 NOT applied when applySuggestions=false; NEVER-heal skipped entry preserved', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);
  await seedStrategyA(fx.wsDir);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    // applySuggestions intentionally omitted — defaults to false.
  });

  const heal05 = (r.healed?.applied ?? []).filter((h) => h.healId === 'HEAL-05');
  assert.equal(heal05.length, 0, 'HEAL-05 must NOT run when applySuggestions=false');

  // The NEVER-heal map should produce the canonical skipped entry.
  const skip = (r.healed?.skipped ?? []).find((s) => s.code === 'TESTATLAS_MISSING_EVIDENCE_REF');
  assert.ok(skip, 'NEVER-heal skipped entry must be present');
  assert.match(skip.reason, /--apply-suggestions/);

  // Parent file untouched: dangling EVIDENCE-999 still there.
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.ok(after.evidence.includes('EVIDENCE-999'));
});

// ─── dryRun=true: no on-disk writes ──────────────────────────────────────────

test('HEAL-05 dryRun=true: no writes, applied entries have wrote=false', async (t) => {
  const fx = await makeValidationFixture('broken-orphan-evidence');
  t.after(fx.cleanup);
  await seedStrategyA(fx.wsDir);

  const issuePath = path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const before = await stat(issuePath);
  const beforeContent = await readFile(issuePath, 'utf8');

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
    dryRun: true,
  });

  const heal05 = (r.healed?.applied ?? []).filter((h) => h.healId === 'HEAL-05');
  assert.ok(heal05.length >= 1, 'HEAL-05 should be recorded as preview');
  for (const h of heal05) {
    assert.equal(h.wrote, false, 'wrote=false in dryRun mode');
  }

  // mtime + content unchanged.
  const after = await stat(issuePath);
  assert.equal(after.mtimeMs, before.mtimeMs);
  const afterContent = await readFile(issuePath, 'utf8');
  assert.equal(afterContent, beforeContent);
});
