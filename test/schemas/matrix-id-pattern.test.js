// test/schemas/matrix-id-pattern.test.js
//
// Plan 18-06 (ISSUE-013) — Regression guard for hand-edit drift on the
// scenario matrix. Loads the canonical TEST-* pattern from
// `.testatlas/schemas/vocabulary.schema.json` (single source-of-truth) and
// asserts that every TEST-id surfaced in the suite repo's matrix surface
// matches the regex.
//
// Matrix surface scanned (whichever exist):
//   - `_testatlas/tests/matrix.json`          (preferred, generator-emitted)
//   - `_testatlas/tests/matrix.md`            (markdown-table form, hand-curated)
//   - `_testatlas/tests/scenarios/TEST-*.json` (per-scenario sidecars)
//
// Why all three? `generate-scenarios.js` emits per-scenario sidecars but no
// monolithic matrix.json today; the human-curated matrix.md is the index.
// The lint should catch drift on any of them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = path.resolve(__dirname, '..', '..');
const VOCAB_PATH = path.join(SUITE_ROOT, '.testatlas', 'schemas', 'vocabulary.schema.json');
const TESTS_DIR = path.join(SUITE_ROOT, '_testatlas', 'tests');

// RED-marker: when present in the scanned-ID set, this list seeds a deliberate
// non-conforming entry to force the test red. Plan 18-06 Task 2 (GREEN) clears
// this back to []. Keep the constant exported-shape stable so future drift
// experiments (e.g., adversarial CI) can re-arm without re-deriving the wiring.
const PLANTED_OFFENDERS = ['TEST-TAS-001'];

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

/**
 * Locate the TEST-* ID pattern in vocabulary.schema.json. The canonical key
 * is `testId`, but locate by `^TEST-` prefix to survive a key rename.
 */
async function loadTestIdPattern() {
  const vocab = await readJson(VOCAB_PATH);
  const defs = vocab.$defs ?? {};
  for (const def of Object.values(defs)) {
    if (typeof def?.pattern === 'string' && def.pattern.startsWith('^TEST-')) {
      return new RegExp(def.pattern);
    }
  }
  throw new Error('Could not locate ^TEST-* pattern in vocabulary.schema.json $defs');
}

/**
 * Collect TEST-* IDs from the matrix surface. Returns a flat array of
 * `{ id, source }` so the failure message can point users at the offending file.
 */
async function collectMatrixTestIds() {
  const collected = [];

  // 1) matrix.json (preferred form when present)
  const matrixJsonPath = path.join(TESTS_DIR, 'matrix.json');
  if (await fileExists(matrixJsonPath)) {
    const matrix = await readJson(matrixJsonPath);
    const scenarios = Array.isArray(matrix) ? matrix : (matrix.scenarios ?? matrix.tests ?? []);
    for (const s of scenarios) {
      if (typeof s?.id === 'string') {
        collected.push({ id: s.id, source: 'matrix.json' });
      }
    }
  }

  // 2) matrix.md (markdown-table form). Scan TABLE ROWS only — the ID lives in
  // the first column of `| TEST-foo-bar | ... |` rows. This skips narrative
  // prose (e.g. `TEST-validate-*` glob patterns inside backticks at line 123)
  // which are not concrete IDs and would create false positives.
  const matrixMdPath = path.join(TESTS_DIR, 'matrix.md');
  if (await fileExists(matrixMdPath)) {
    const md = await readFile(matrixMdPath, 'utf8');
    const rowRe = /^\s*\|\s*(TEST-[A-Za-z0-9-]+?)\s*\|/gm;
    for (const m of md.matchAll(rowRe)) {
      collected.push({ id: m[1], source: 'matrix.md' });
    }
  }

  // 3) scenarios/TEST-*.json — per-scenario sidecars (generator-emitted form).
  const scenariosDir = path.join(TESTS_DIR, 'scenarios');
  if (await fileExists(scenariosDir)) {
    const entries = await readdir(scenariosDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.json') || !e.name.startsWith('TEST-')) continue;
      const j = await readJson(path.join(scenariosDir, e.name));
      if (typeof j?.id === 'string') {
        collected.push({ id: j.id, source: `scenarios/${e.name}` });
      }
    }
  }

  return collected;
}

test('matrix surface: every TEST-* id matches the vocabulary regex', async () => {
  const idRe = await loadTestIdPattern();
  const collected = await collectMatrixTestIds();

  // Sanity: matrix surface must not be empty (else the lint provides no signal).
  assert.ok(collected.length > 0, 'matrix surface yielded zero TEST-* IDs — lint cannot run');

  // Merge in any planted offenders (RED-arm). Empty in steady-state.
  const planted = PLANTED_OFFENDERS.map((id) => ({ id, source: 'planted-red-marker' }));
  const all = [...collected, ...planted];

  const offenders = all.filter(({ id }) => !idRe.test(id));
  if (offenders.length > 0) {
    const lines = offenders.map(({ id, source }) => `  - ${id}  (from ${source})`);
    assert.fail(
      `matrix surface contains TEST-* IDs that violate vocabulary regex ${idRe}:\n${lines.join('\n')}`,
    );
  }
});

test('vocabulary regex correctly rejects the canonical bad-shape examples', async () => {
  const idRe = await loadTestIdPattern();
  // Negative examples — these MUST be rejected. Documents the exact failure
  // modes from the dogfood ISSUE-013 fixture so the regex contract is
  // self-documenting in this test file.
  const bad = [
    'TEST-TAS-001', // uppercase mid-segment
    'TEST-tas', // single segment after TEST- (regex requires double-segment)
    'TEST-Foo-bar', // mixed case
    'test-foo-bar', // lowercase TEST prefix
    'TEST--double-hyphen', // empty segment
  ];
  for (const id of bad) {
    assert.equal(idRe.test(id), false, `regex must reject ${id}`);
  }
  // Positive examples — these MUST match.
  const good = [
    'TEST-install-curl-pipe-smoke',
    'TEST-tas-001', // lowercased form of the offender
    'TEST-foo-bar',
  ];
  for (const id of good) {
    assert.equal(idRe.test(id), true, `regex must accept ${id}`);
  }
});
