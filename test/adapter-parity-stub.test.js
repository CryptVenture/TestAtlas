// test/adapter-parity-stub.test.js
//
// VAL-05 adapter-parity gate — Phase 5 → Phase 6 transition.
//
// Phase 5 (the original stub at this path): scripts/check-adapter-parity.js did
// NOT yet exist. The Phase 5 stub auto-detected this and passed-trivially so
// CI stayed green while Phase 5 closed.
//
// Phase 6 Plan 06-02 (this rewrite): scripts/check-adapter-parity.js ships in
// the same atomic merge that flips this test from passes-trivially to runs-
// the-real-gate. The filename is retained for VAL-05 stub continuity — every
// downstream reference to `test/adapter-parity-stub.test.js` keeps working;
// the body just wires up the real assertions.
//
// Per .planning/phases/06-adapter-layer/06-RESEARCH.md §Pitfall 4: this whole
// transition (script + test rewrite + CI activation) MUST land as a single
// PR. Partial commits would turn the Phase 5 stub's auto-detect into an
// immediate CI red across every in-flight Phase 6 PR.
//
// The 6 detection cases exercised below correspond 1:1 to the drift taxonomy
// locked in 06-02-PLAN.md <interfaces>:
//   - missing       — expected file does not exist on disk
//   - no-marker     — file exists but no adapter-marker envelope found
//   - hash-mismatch — marker exists but marker.hash !== hashContent(currentSourceText)
//   - hand-edit     — marker hash matches source but the body bytes differ
//                     from a fresh in-memory render
//
// Transitional vs strict mode (66-02-PLAN.md success criteria):
//   - Transitional (Plans 06-02 → 06-04): only `missing` drift is tolerated
//     (covers the not-yet-shipped adapters). Any other drift kind fails.
//   - Strict (Plan 06-05): every adapter is shipped; missing drift becomes a
//     failure too.
//
// The matrix is 30 commands × 7 adapters = 210 expected obligations. At this
// wave only claude-code is populated (30 found); the other 6 adapters (generic,
// opencode, kilocode, cursor, aider, mcp) report `missing` for every command
// (180 missing). Coverage = 30/210 ≈ 0.143.

import { strict as assert } from 'node:assert';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { enumerate } from '../scripts/lib/adapters/parity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Create a tmp dir containing a copy of the live repo's `.testatlas/` tree so
 * each test can mutate it without affecting the working repo.
 */
async function makeTmpRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), 'parity-'));
  await cp(path.join(repoRoot, '.testatlas'), path.join(dir, '.testatlas'), {
    recursive: true,
  });
  return dir;
}

test('Test 1: live tree — only `missing` drift in transitional mode; coverage matches shipped adapters', async () => {
  const result = await enumerate({ repoRoot });
  // 30 source commands × 7 declared adapters = 210 expected obligations.
  assert.equal(result.expected, 210, 'expected obligations = 30 commands × 7 adapters');
  // Drift count is exactly expected − found.
  assert.equal(result.drift.length, result.expected - result.found, 'drift = expected − found');
  // In transitional mode (Plans 06-02 → 06-04) every drift entry must be
  // `missing` — non-missing kinds (no-marker / hash-mismatch / hand-edit) are
  // never tolerated. As more adapters ship across Wave 2, `found` rises in
  // multiples of 30; the per-kind invariant below holds throughout.
  const nonMissing = result.drift.filter((d) => d.kind !== 'missing');
  assert.equal(
    nonMissing.length,
    0,
    `every drift entry must be 'missing' in transitional mode; got non-missing: ${JSON.stringify(nonMissing.slice(0, 3))}`,
  );
  // `found` must be a non-negative multiple of 30 (each shipped adapter
  // contributes 30 satisfied obligations).
  assert.equal(result.found % 30, 0, `found must be a multiple of 30; got ${result.found}`);
  assert.ok(
    result.found >= 30,
    `claude-code at minimum must be shipped; got found=${result.found}`,
  );
  // Coverage = found / expected with reasonable precision.
  assert.ok(
    Math.abs(result.coverage - result.found / result.expected) < 1e-9,
    `coverage must equal found/expected; got ${result.coverage}`,
  );
});

test('Test 2: hand-edit detection — append bytes inside envelope → kind === "hand-edit"', async () => {
  const tmp = await makeTmpRepo();
  try {
    const target = path.join(
      tmp,
      '.testatlas',
      'adapters',
      'claude-code',
      '.claude',
      'commands',
      'atlas-init.md',
    );
    const text = await readFile(target, 'utf8');
    // Insert "MUTATED" before the END marker so the marker line itself stays
    // intact (only the body bytes inside the envelope drift).
    const mutated = text.replace(
      '<!-- TESTATLAS:GENERATED:END section="adapter-body" -->',
      'MUTATED\n<!-- TESTATLAS:GENERATED:END section="adapter-body" -->',
    );
    assert.notEqual(mutated, text, 'precondition: mutation must change file content');
    await writeFile(target, mutated, 'utf8');

    const result = await enumerate({ repoRoot: tmp });
    const handEdits = result.drift.filter((d) => d.kind === 'hand-edit');
    assert.ok(
      handEdits.length >= 1,
      `expected at least one hand-edit drift entry; got: ${JSON.stringify(result.drift.filter((d) => d.kind !== 'missing'))}`,
    );
    assert.ok(
      handEdits.some((d) => d.expectedPath?.endsWith(path.join('atlas-init.md'))),
      `hand-edit drift must include atlas-init.md; got expectedPaths: ${handEdits.map((d) => d.expectedPath).join(', ')}`,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('Test 3: hash-mismatch detection — mutate source command without regen → kind === "hash-mismatch"', async () => {
  const tmp = await makeTmpRepo();
  try {
    const sourcePath = path.join(tmp, '.testatlas', 'commands', 'init.md');
    const original = await readFile(sourcePath, 'utf8');
    await writeFile(sourcePath, `${original}\n<!-- source mutation -->\n`, 'utf8');

    const result = await enumerate({ repoRoot: tmp });
    const hashMismatches = result.drift.filter((d) => d.kind === 'hash-mismatch');
    assert.ok(
      hashMismatches.length >= 1,
      `expected at least one hash-mismatch drift; got: ${JSON.stringify(result.drift.filter((d) => d.kind !== 'missing').slice(0, 3))}`,
    );
    const initMismatch = hashMismatches.find((d) =>
      d.expectedPath?.endsWith(path.join('atlas-init.md')),
    );
    assert.ok(
      initMismatch,
      'init source mutation must surface as a hash-mismatch on atlas-init.md',
    );
    assert.ok(
      initMismatch.expectedHash && initMismatch.actualHash,
      'hash-mismatch drift entries must report expected + actual hashes',
    );
    assert.notEqual(
      initMismatch.expectedHash,
      initMismatch.actualHash,
      'expected and actual hashes must differ',
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('Test 4: missing-file detection — delete a derived file → kind === "missing"', async () => {
  const tmp = await makeTmpRepo();
  try {
    const target = path.join(
      tmp,
      '.testatlas',
      'adapters',
      'claude-code',
      '.claude',
      'commands',
      'atlas-explore.md',
    );
    await unlink(target);

    const result = await enumerate({ repoRoot: tmp });
    const exploreMissing = result.drift.find(
      (d) => d.kind === 'missing' && d.expectedPath?.endsWith(path.join('atlas-explore.md')),
    );
    assert.ok(
      exploreMissing,
      `deleted atlas-explore.md must surface as missing drift; got: ${result.drift
        .filter((d) => d.expectedPath?.endsWith('atlas-explore.md'))
        .map((d) => d.kind)
        .join(', ')}`,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('Test 5: no-marker detection — replace body with bare prose → kind === "no-marker"', async () => {
  const tmp = await makeTmpRepo();
  try {
    const target = path.join(
      tmp,
      '.testatlas',
      'adapters',
      'claude-code',
      '.claude',
      'commands',
      'atlas-plan.md',
    );
    await writeFile(target, '# Bare prose, no marker envelope.\n', 'utf8');

    const result = await enumerate({ repoRoot: tmp });
    const planNoMarker = result.drift.find(
      (d) => d.kind === 'no-marker' && d.expectedPath?.endsWith(path.join('atlas-plan.md')),
    );
    assert.ok(
      planNoMarker,
      `bare-prose atlas-plan.md must surface as no-marker; got: ${result.drift
        .filter((d) => d.expectedPath?.endsWith('atlas-plan.md'))
        .map((d) => d.kind)
        .join(', ')}`,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('Test 6: README files in adapter trees do NOT contribute to drift', async () => {
  // README.md exists at .testatlas/adapters/claude-code/README.md (hand-authored)
  // but does NOT match any outputPattern, so it must never appear in drift.
  const result = await enumerate({ repoRoot });
  const readmeDrift = result.drift.filter((d) => d.expectedPath?.endsWith(`${path.sep}README.md`));
  assert.equal(
    readmeDrift.length,
    0,
    `README files must not register as drift; got: ${JSON.stringify(readmeDrift)}`,
  );
});
