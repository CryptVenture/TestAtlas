// test/validate-heal-06-additional-property.test.js
//
// Quick 260506-vaq: HEAL-06 (suggestion-tier) coverage.
//
// HEAL-06 is intentionally narrow: it strips ONLY top-level
// `additionalProperties` violations from a JSON artifact. ANY other AJV
// violation kind (enum/type/required/pattern) makes the handler refuse
// (returns null → orchestrator records a `skipped` entry).
//
// Defense-in-depth: applySuggestions=false (default) MUST keep the existing
// NEVER-heal `skipped` entry — NEVER_HEAL_REASONS map untouched.

import { strict as assert } from 'node:assert';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { validateWorkspace } from '../scripts/validate-workspace.js';
import { makeValidationFixture } from './_helpers.js';

/**
 * Add `count` extra top-level properties to ISSUE-001-foo.json.
 *
 * @param {string} wsDir
 * @param {Record<string, unknown>} extras  Map of propName → value.
 */
async function seedAdditionalProps(wsDir, extras) {
  const issuePath = path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  Object.assign(issue, extras);
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
}

/**
 * Set ISSUE-001-foo.severity to an invalid enum value (e.g. "elevated").
 * AJV will surface this as a non-additionalProperties violation, so HEAL-06
 * must refuse.
 *
 * @param {string} wsDir
 */
async function seedEnumViolation(wsDir) {
  const issuePath = path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  issue.severity = 'elevated'; // not in vocabulary.severity enum
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
}

/**
 * Remove a required field from ISSUE-001-foo.json so AJV reports a
 * "required" violation.
 *
 * @param {string} wsDir
 */
async function seedRequiredMissing(wsDir) {
  const issuePath = path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json');
  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  delete issue.summary;
  await writeFile(issuePath, `${JSON.stringify(issue, null, 2)}\n`);
}

// ─── Single additionalProperty violation ─────────────────────────────────────

test('HEAL-06: single additionalProperty violation is stripped', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);
  // Reset ISSUE-002-bar to be valid so the only violation comes from our
  // injected bogus prop on ISSUE-001-foo.
  // (broken-schema-invalid-issue ships ISSUE-002-bar missing `evidence`,
  // which is a `required` violation — independent of our test scenario.)
  await seedAdditionalProps(fx.wsDir, { bogusProp: 'x' });

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  const heal06 = (r.healed?.applied ?? []).filter((h) => h.healId === 'HEAL-06');
  assert.ok(
    heal06.some((h) => h.path.endsWith('ISSUE-001-foo.json')),
    `expected HEAL-06 for ISSUE-001-foo.json; got: ${JSON.stringify(heal06)}`,
  );

  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.equal(Object.hasOwn(after, 'bogusProp'), false, 'bogusProp must be stripped');
  // Original valid props preserved.
  assert.equal(after.id, 'ISSUE-001-foo');
});

// ─── Multiple additionalProperties violations on the same file ───────────────

test('HEAL-06: multiple additionalProperties violations are all stripped', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);
  await seedAdditionalProps(fx.wsDir, { extraOne: 'a', extraTwo: 42 });

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  const heal06 = (r.healed?.applied ?? []).filter(
    (h) => h.healId === 'HEAL-06' && h.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.equal(heal06.length, 1, 'one HEAL-06 entry covering both props');
  // The summary should mention both stripped properties.
  assert.match(heal06[0].summary, /extraOne/);
  assert.match(heal06[0].summary, /extraTwo/);

  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.equal(Object.hasOwn(after, 'extraOne'), false);
  assert.equal(Object.hasOwn(after, 'extraTwo'), false);
});

// ─── Refusal: enum violation ─────────────────────────────────────────────────

test('HEAL-06 refusal: enum violation returns null; NEVER-heal skipped entry intact', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);
  await seedEnumViolation(fx.wsDir);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  const heal06 = (r.healed?.applied ?? []).filter(
    (h) => h.healId === 'HEAL-06' && h.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.equal(heal06.length, 0, 'enum violations must NOT be auto-stripped');

  // Schema violation finding still surfaces; NEVER-heal skipped entry intact.
  const skip = (r.healed?.skipped ?? []).find(
    (s) => s.code === 'TESTATLAS_SCHEMA_VIOLATION' && s.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.ok(skip, 'NEVER-heal skipped entry preserved for enum violation');
});

// ─── Refusal: required-missing ───────────────────────────────────────────────

test('HEAL-06 refusal: required-missing violation returns null', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);
  await seedRequiredMissing(fx.wsDir);

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    applySuggestions: true,
  });

  const heal06 = (r.healed?.applied ?? []).filter(
    (h) => h.healId === 'HEAL-06' && h.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.equal(heal06.length, 0, 'required-missing must NOT be auto-stripped');

  const skip = (r.healed?.skipped ?? []).find(
    (s) => s.code === 'TESTATLAS_SCHEMA_VIOLATION' && s.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.ok(skip, 'NEVER-heal skipped entry preserved for required-missing');
});

// ─── Defense-in-depth: applySuggestions=false ────────────────────────────────

test('HEAL-06 NOT applied when applySuggestions=false; NEVER-heal skipped entry preserved', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);
  await seedAdditionalProps(fx.wsDir, { bogusProp: 'x' });

  const r = await validateWorkspace({
    cwd: fx.cwd,
    autoHeal: true,
    apply: true,
    // applySuggestions intentionally omitted — defaults to false.
  });

  const heal06 = (r.healed?.applied ?? []).filter((h) => h.healId === 'HEAL-06');
  assert.equal(heal06.length, 0, 'HEAL-06 must NOT run without applySuggestions');

  const skip = (r.healed?.skipped ?? []).find(
    (s) => s.code === 'TESTATLAS_SCHEMA_VIOLATION' && s.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.ok(skip, 'NEVER-heal skipped entry must be present');

  // File untouched.
  const after = JSON.parse(
    await readFile(path.join(fx.wsDir, 'to_fix', 'ISSUE-001-foo.json'), 'utf8'),
  );
  assert.equal(after.bogusProp, 'x');
});

// ─── dryRun=true: no writes ──────────────────────────────────────────────────

test('HEAL-06 dryRun=true: no on-disk writes', async (t) => {
  const fx = await makeValidationFixture('broken-schema-invalid-issue');
  t.after(fx.cleanup);
  await seedAdditionalProps(fx.wsDir, { bogusProp: 'x' });

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

  const heal06 = (r.healed?.applied ?? []).filter(
    (h) => h.healId === 'HEAL-06' && h.path.endsWith('ISSUE-001-foo.json'),
  );
  assert.ok(heal06.length >= 1, 'HEAL-06 recorded as preview');
  for (const h of heal06) {
    assert.equal(h.wrote, false, 'wrote=false in dryRun mode');
  }

  const after = await stat(issuePath);
  assert.equal(after.mtimeMs, before.mtimeMs);
  const afterContent = await readFile(issuePath, 'utf8');
  assert.equal(afterContent, beforeContent);
});
