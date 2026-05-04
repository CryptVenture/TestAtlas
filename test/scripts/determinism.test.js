// test/scripts/determinism.test.js
//
// Plan 08-01 Task 1 — tests for scripts/lib/determinism.js (the env-var
// contract) AND for the integration of those helpers inside Phase 5 emitters
// (create-issue / create-flow / create-domain / create-evidence-record /
// update-indexes / sync-status / summarize-run / generate-report).
//
// The integration tests run each emitter twice with TESTATLAS_DETERMINISTIC=1
// + TESTATLAS_FIXED_TIMESTAMP set, then assert byte-identical artifacts on
// disk. They re-bootstrap a fresh temp workspace per run so concurrency is
// not an issue.
//
// Determinism contract under test:
//   - now() honors TESTATLAS_FIXED_TIMESTAMP (env wins over Date.now)
//   - uuid(seed) is content-hash-derived when TESTATLAS_DETERMINISTIC=1
//   - sortedReaddir always returns lexically sorted entries
//   - isDeterministic() is true iff TESTATLAS_DETERMINISTIC === '1'
//   - emitters produce byte-identical output across repeated runs

import { strict as assert } from 'node:assert';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { createDomain } from '../../scripts/create-domain.js';
import { createEvidenceRecord } from '../../scripts/create-evidence-record.js';
import { createFlow } from '../../scripts/create-flow.js';
import { createIssue } from '../../scripts/create-issue.js';
import { generateReport } from '../../scripts/generate-report.js';
import { isDeterministic, now, sortedReaddir, uuid } from '../../scripts/lib/determinism.js';
import { summarizeRun } from '../../scripts/summarize-run.js';
import { syncStatus } from '../../scripts/sync-status.js';
import { updateIndexes } from '../../scripts/update-indexes.js';
import { makeValidationFixture } from '../_helpers.js';

const FIXED_TS = '2026-05-03T00:00:00.000Z';

/** Save the relevant env vars; restore after a test. */
function snapshotEnv() {
  return {
    DET: process.env.TESTATLAS_DETERMINISTIC,
    TS: process.env.TESTATLAS_FIXED_TIMESTAMP,
    VER: process.env.TESTATLAS_SUITE_VERSION,
  };
}
function restoreEnv(snap) {
  for (const [k, v] of [
    ['TESTATLAS_DETERMINISTIC', snap.DET],
    ['TESTATLAS_FIXED_TIMESTAMP', snap.TS],
    ['TESTATLAS_SUITE_VERSION', snap.VER],
  ]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ────────────────────────────── Pure helper tests ──────────────────────────────

test('determinism: now() returns TESTATLAS_FIXED_TIMESTAMP when set', () => {
  const snap = snapshotEnv();
  try {
    process.env.TESTATLAS_FIXED_TIMESTAMP = FIXED_TS;
    assert.equal(now(), FIXED_TS);
  } finally {
    restoreEnv(snap);
  }
});

test('determinism: now() falls back to current wall-clock when env unset', () => {
  const snap = snapshotEnv();
  try {
    delete process.env.TESTATLAS_FIXED_TIMESTAMP;
    const t = now();
    assert.match(t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  } finally {
    restoreEnv(snap);
  }
});

test('determinism: uuid(seed) is content-hash-derived under TESTATLAS_DETERMINISTIC=1', () => {
  const snap = snapshotEnv();
  try {
    process.env.TESTATLAS_DETERMINISTIC = '1';
    const a = uuid('seed-string');
    const b = uuid('seed-string');
    const c = uuid('different-seed');
    assert.equal(a, b, 'same seed → same uuid');
    assert.notEqual(a, c, 'different seed → different uuid');
    assert.match(a, /^[0-9a-f]{32}$/);
  } finally {
    restoreEnv(snap);
  }
});

test('determinism: uuid() without TESTATLAS_DETERMINISTIC returns RFC4122 v4 strings (random)', () => {
  const snap = snapshotEnv();
  try {
    delete process.env.TESTATLAS_DETERMINISTIC;
    const a = uuid('seed');
    const b = uuid('seed');
    assert.notEqual(a, b, 'random uuids should differ across calls');
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  } finally {
    restoreEnv(snap);
  }
});

test('determinism: sortedReaddir() returns lexically sorted entries (string mode)', async (t) => {
  const tmp = await import('node:os').then((os) => os.tmpdir());
  const dir = path.join(tmp, `det-readdir-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  // Create files in non-sorted order.
  for (const name of ['c.txt', 'a.txt', 'b.txt', '0.txt', 'z.txt']) {
    await writeFile(path.join(dir, name), '', 'utf8');
  }
  const entries = await sortedReaddir(dir);
  assert.deepEqual(entries, ['0.txt', 'a.txt', 'b.txt', 'c.txt', 'z.txt']);
});

test('determinism: sortedReaddir() with withFileTypes returns Dirent[] sorted by name', async (t) => {
  const tmp = await import('node:os').then((os) => os.tmpdir());
  const dir = path.join(tmp, `det-readdir2-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['z.md', 'a.md', 'm.md']) {
    await writeFile(path.join(dir, name), '', 'utf8');
  }
  const entries = await sortedReaddir(dir, { withFileTypes: true });
  assert.deepEqual(
    entries.map((e) => e.name),
    ['a.md', 'm.md', 'z.md'],
  );
});

test("determinism: isDeterministic() true iff TESTATLAS_DETERMINISTIC === '1'", () => {
  const snap = snapshotEnv();
  try {
    delete process.env.TESTATLAS_DETERMINISTIC;
    assert.equal(isDeterministic(), false);
    process.env.TESTATLAS_DETERMINISTIC = '0';
    assert.equal(isDeterministic(), false);
    process.env.TESTATLAS_DETERMINISTIC = 'true';
    assert.equal(isDeterministic(), false);
    process.env.TESTATLAS_DETERMINISTIC = '1';
    assert.equal(isDeterministic(), true);
  } finally {
    restoreEnv(snap);
  }
});

// ────────────────────────────── Integration tests ──────────────────────────────
//
// Pattern: run each emitter twice against fresh fixture workspaces with the
// determinism env vars set; compare the resulting artifact bytes.

/**
 * Recursively read every file under `root` into a sorted Map of
 * {relativePath → Buffer}. Used for byte-level equality checks.
 *
 * @param {string} root
 * @returns {Promise<Map<string, Buffer>>}
 */
async function readTreeBytes(root) {
  const out = new Map();
  async function walk(dir, base) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, rel);
      } else if (e.isFile()) {
        const buf = await readFile(abs);
        out.set(rel, buf);
      }
    }
  }
  await walk(root, '');
  return out;
}

/**
 * Compare two file-bytes maps. Returns array of differences (empty if equal).
 *
 * @param {Map<string, Buffer>} a
 * @param {Map<string, Buffer>} b
 */
function diffTreeMaps(a, b) {
  const diffs = [];
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of [...keys].sort()) {
    const va = a.get(k);
    const vb = b.get(k);
    if (!va) diffs.push({ path: k, kind: 'missing-in-a' });
    else if (!vb) diffs.push({ path: k, kind: 'missing-in-b' });
    else if (Buffer.compare(va, vb) !== 0) diffs.push({ path: k, kind: 'differs' });
  }
  return diffs;
}

beforeEach((_, done) => {
  process.env.TESTATLAS_DETERMINISTIC = '1';
  process.env.TESTATLAS_FIXED_TIMESTAMP = FIXED_TS;
  done();
});

afterEach((_, done) => {
  delete process.env.TESTATLAS_DETERMINISTIC;
  delete process.env.TESTATLAS_FIXED_TIMESTAMP;
  done();
});

test('determinism: createIssue produces byte-identical output across runs (env set)', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  const argsBase = {
    title: 'Email validation accepts trailing space',
    domain: 'domain-auth',
    severity: 'high',
    confidence: 'confirmed',
    type: 'validation',
    summary: 'Email field accepts trailing whitespace.',
    expectedBehavior: 'Trailing whitespace should be rejected.',
    actualBehavior: 'Form submits.',
    reproductionSteps: ['enter "a@b.com "', 'submit'],
    evidence: ['EVIDENCE-001'],
    acceptanceCriteria: ['form rejects trailing whitespace'],
  };
  await createIssue({ ...argsBase, cwd: fxA.cwd });
  await createIssue({ ...argsBase, cwd: fxB.cwd });

  const a = await readTreeBytes(path.join(fxA.wsDir, 'to_fix'));
  const b = await readTreeBytes(path.join(fxB.wsDir, 'to_fix'));
  const diffs = diffTreeMaps(a, b);
  assert.deepEqual(
    diffs,
    [],
    `to_fix/ outputs should be byte-identical; saw ${JSON.stringify(diffs)}`,
  );
});

test('determinism: createFlow produces byte-identical output across runs', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  const argsBase = {
    name: 'Login With Credentials',
    domain: 'domain-auth',
    persona: 'returning-user',
    goal: 'Authenticate with email + password.',
  };
  await createFlow({ ...argsBase, cwd: fxA.cwd });
  await createFlow({ ...argsBase, cwd: fxB.cwd });

  const a = await readTreeBytes(path.join(fxA.wsDir, 'flows'));
  const b = await readTreeBytes(path.join(fxB.wsDir, 'flows'));
  assert.deepEqual(diffTreeMaps(a, b), []);
});

test('determinism: createDomain produces byte-identical output across runs', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  // _base-good fixture already has domain-auth. Use a fresh slug.
  const argsBase = {
    name: 'tasks',
    purpose: 'Task CRUD operations',
  };
  await createDomain({ ...argsBase, cwd: fxA.cwd });
  await createDomain({ ...argsBase, cwd: fxB.cwd });

  const a = await readTreeBytes(path.join(fxA.wsDir, 'domains', 'tasks'));
  const b = await readTreeBytes(path.join(fxB.wsDir, 'domains', 'tasks'));
  assert.deepEqual(diffTreeMaps(a, b), []);
});

test('determinism: createEvidenceRecord produces byte-identical output across runs', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  const argsBase = {
    type: 'log',
    description: 'Captured server log during login attempt',
  };
  await createEvidenceRecord({ ...argsBase, cwd: fxA.cwd });
  await createEvidenceRecord({ ...argsBase, cwd: fxB.cwd });

  // Compare every EVIDENCE-* dir.
  const a = await readTreeBytes(path.join(fxA.wsDir, 'evidence'));
  const b = await readTreeBytes(path.join(fxB.wsDir, 'evidence'));
  assert.deepEqual(diffTreeMaps(a, b), []);
});

test('determinism: updateIndexes produces byte-identical output across runs', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  await updateIndexes({ cwd: fxA.cwd });
  await updateIndexes({ cwd: fxB.cwd });

  const a = await readFile(path.join(fxA.wsDir, '09_artifact_index.md'), 'utf8');
  const b = await readFile(path.join(fxB.wsDir, '09_artifact_index.md'), 'utf8');
  assert.equal(a, b, 'artifact index must be byte-identical');

  // Manifest's lastUpdatedAt must also match (bound to fixed ts).
  const ma = JSON.parse(await readFile(path.join(fxA.wsDir, '11_workspace_manifest.json'), 'utf8'));
  const mb = JSON.parse(await readFile(path.join(fxB.wsDir, '11_workspace_manifest.json'), 'utf8'));
  assert.equal(ma.lastUpdatedAt, mb.lastUpdatedAt, 'manifest lastUpdatedAt must match');
  assert.equal(ma.lastUpdatedAt, FIXED_TS);
});

test('determinism: syncStatus produces byte-identical output across runs', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  // Force counts to change so syncStatus actually writes the manifest
  // (it skips writing when counts pre-match disk reality).
  await createDomain({ cwd: fxA.cwd, name: 'fresh', purpose: 'p' });
  await createDomain({ cwd: fxB.cwd, name: 'fresh', purpose: 'p' });

  await syncStatus({ cwd: fxA.cwd });
  await syncStatus({ cwd: fxB.cwd });

  const ma = JSON.parse(await readFile(path.join(fxA.wsDir, '11_workspace_manifest.json'), 'utf8'));
  const mb = JSON.parse(await readFile(path.join(fxB.wsDir, '11_workspace_manifest.json'), 'utf8'));
  assert.equal(ma.lastUpdatedAt, FIXED_TS, 'manifest lastUpdatedAt must equal fixed timestamp');
  assert.deepEqual(ma.counts, mb.counts);
  assert.equal(ma.lastUpdatedAt, mb.lastUpdatedAt);
});

test('determinism: summarizeRun produces byte-identical output across runs (filename + content)', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  // Ensure tests/runs dir exists (atomic-write requires the parent dir).
  await mkdir(path.join(fxA.wsDir, 'tests', 'runs'), { recursive: true });
  await mkdir(path.join(fxB.wsDir, 'tests', 'runs'), { recursive: true });

  // _base-good fixture has no runs — we verify file-name + body still
  // identical when fixed-ts is in effect.
  const ra = await summarizeRun({ cwd: fxA.cwd });
  const rb = await summarizeRun({ cwd: fxB.cwd });
  assert.equal(path.basename(ra.outputPath), path.basename(rb.outputPath));
  const ba = await readFile(ra.outputPath);
  const bb = await readFile(rb.outputPath);
  assert.equal(Buffer.compare(ba, bb), 0);
});

test('determinism: generateReport produces byte-identical output across runs', async (t) => {
  const fxA = await makeValidationFixture('_base-good');
  const fxB = await makeValidationFixture('_base-good');
  t.after(fxA.cleanup);
  t.after(fxB.cleanup);

  const ra = await generateReport({ cwd: fxA.cwd });
  const rb = await generateReport({ cwd: fxB.cwd });

  // The timestamped filename must match (since timestamp is fixed).
  assert.equal(path.basename(ra.timestampedPath), path.basename(rb.timestampedPath));

  const a1 = await readFile(ra.markdownPath);
  const b1 = await readFile(rb.markdownPath);
  assert.equal(Buffer.compare(a1, b1), 0, 'REPORT-latest.md must be byte-identical');

  const a2 = await readFile(ra.jsonPath);
  const b2 = await readFile(rb.jsonPath);
  assert.equal(Buffer.compare(a2, b2), 0, 'REPORT-latest.json must be byte-identical');
});
