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
// Strict mode active as of Plan 06-05. Coverage 1.0 + zero drift required.
//   - Transitional (Plans 06-02 → 06-04, retired): only `missing` drift was
//     tolerated to cover not-yet-shipped adapters. Non-missing kinds always
//     failed.
//   - Strict (Plan 06-05 onward — this is the live mode): every shipped
//     adapter is populated; the parity gate requires `coverage === 1.0` AND
//     `drift.length === 0` against the live tree.
//
// The matrix is K commands × N adapters expected obligations, where K is
// the union of flat V1 + V2 categorized commands and N is the adapter count
// declared in adapter-capabilities.json. K is computed dynamically from the
// live source tree so adding a new V1 command, a new V2 categorized command,
// or a new adapter does not require updating this assertion. Tests 2–6 below
// operate on tmp-tree mutations and exercise drift detection independently
// of the strict happy-path assertion.

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
  // GAP-3 (quick-260506-nj2): classifyMcp reads package.json#version from
  // repoRoot to inject into the fresh-rendered manifest for byte-compare.
  // Copy the live package.json so each tmp parity run sees the canonical
  // version (1.1.5 today) — matching the on-disk manifest the test trees
  // were built from.
  await cp(path.join(repoRoot, 'package.json'), path.join(dir, 'package.json'));
  return dir;
}

test('Test 1: live tree — strict mode: coverage === 1.0 AND drift.length === 0', async () => {
  // Strict mode active as of Plan 06-05. Every shipped adapter must be
  // populated; every K commands × N adapters obligation must be satisfied;
  // drift of any kind (missing / no-marker / hash-mismatch / hand-edit)
  // fails the gate. K = flat V1 + V2 categorized command count.
  const result = await enumerate({ repoRoot });
  // expected = K × adapter count. The exact value moves whenever the source
  // tree grows; assert it's a positive multiple of the live adapter count.
  const { readFile } = await import('node:fs/promises');
  const capsRaw = await readFile(
    path.join(repoRoot, '.testatlas', 'adapters', 'adapter-capabilities.json'),
    'utf8',
  );
  const adapterCount = JSON.parse(capsRaw).adapters.length;
  assert.ok(
    result.expected > 0 && result.expected % adapterCount === 0,
    `expected obligations must be a positive multiple of ${adapterCount}; got ${result.expected}`,
  );
  assert.strictEqual(
    result.found,
    result.expected,
    `strict mode: every obligation must be satisfied; got found=${result.found} of ${result.expected}`,
  );
  assert.strictEqual(
    result.coverage,
    1.0,
    `strict mode: coverage must equal 1.0; got ${result.coverage}`,
  );
  assert.strictEqual(
    result.drift.length,
    0,
    `strict mode: drift must be empty; got ${JSON.stringify(result.drift.slice(0, 3))}`,
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
      // Phase 17 Plan 17-04: V1 commands/init.md deleted; canonical adapter
      // render is atlas-core-init.md (from V2 commands/core/init.md source).
      'atlas-core-init.md',
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
      handEdits.some((d) => d.expectedPath?.endsWith(path.join('atlas-core-init.md'))),
      `hand-edit drift must include atlas-core-init.md; got expectedPaths: ${handEdits.map((d) => d.expectedPath).join(', ')}`,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('Test 3: hash-mismatch detection — mutate source command without regen → kind === "hash-mismatch"', async () => {
  const tmp = await makeTmpRepo();
  try {
    // Phase 17 Plan 17-04: V1 commands/init.md deleted; canonical /atlas:init
    // source is now commands/core/init.md → atlas-core-init.md adapter render.
    const sourcePath = path.join(tmp, '.testatlas', 'commands', 'core', 'init.md');
    const original = await readFile(sourcePath, 'utf8');
    await writeFile(sourcePath, `${original}\n<!-- source mutation -->\n`, 'utf8');

    const result = await enumerate({ repoRoot: tmp });
    const hashMismatches = result.drift.filter((d) => d.kind === 'hash-mismatch');
    assert.ok(
      hashMismatches.length >= 1,
      `expected at least one hash-mismatch drift; got: ${JSON.stringify(result.drift.filter((d) => d.kind !== 'missing').slice(0, 3))}`,
    );
    const initMismatch = hashMismatches.find((d) =>
      d.expectedPath?.endsWith(path.join('atlas-core-init.md')),
    );
    assert.ok(
      initMismatch,
      'core/init source mutation must surface as a hash-mismatch on atlas-core-init.md',
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
