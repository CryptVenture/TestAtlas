// test/brain/changelog-issue-status-parity.test.js
//
// Quick 260510-rfp / OPEN-007 — issue-status closure parity test.
//
// Pins the lifecycle contract that every ISSUE-NNN cited as fixed in
// CHANGELOG.md (across [Unreleased] + every versioned [x.y.z] block)
// has `status: closed` (or `status: wont_fix`) in its on-disk sidecar
// at `_testatlas/to_fix/ISSUE-NNN-*.json`.
//
// Captured by COUNCIL-2026-05-10-001 / OPEN-007 after the brain
// registry showed 8 ISSUE-038..045 rows in `status: new` for issues
// whose code was closed by Phase 23 (commits 70e73331..838bae58).
// The Phase-23 verifier passed 30/30 must-haves but did NOT include
// this lifecycle check; result was a doc-vs-truth lie that surfaced
// only at the next council session.
//
// The test tolerates the gitignored `_testatlas/` workspace: on a
// fresh checkout where `_testatlas/to_fix/` doesn't exist, the test
// SKIPS gracefully (no false negatives in CI). When the workspace IS
// present, every ISSUE-NNN that has a sidecar AND is cited in
// CHANGELOG must show closed/wont_fix status.

import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const TO_FIX = path.join(ROOT, '_testatlas', 'to_fix');

test('Test 1: every ISSUE-NNN cited in CHANGELOG has on-disk status=closed (or wont_fix), or sidecar absent', async (t) => {
  if (!existsSync(TO_FIX)) {
    t.skip(
      '_testatlas/to_fix/ absent (fresh-checkout / CI without workspace) — lifecycle check N/A',
    );
    return;
  }

  const changelog = await readFile(CHANGELOG, 'utf8');
  const cited = new Set([...changelog.matchAll(/ISSUE-(\d{3,4})\b/g)].map((m) => m[1]));
  if (cited.size === 0) {
    t.skip('no ISSUE-NNN citations in CHANGELOG.md — lifecycle check N/A');
    return;
  }

  const sidecars = (await readdir(TO_FIX)).filter(
    (f) => /^ISSUE-\d{3,4}-.+\.json$/.test(f) && !f.endsWith('.bak'),
  );
  const sidecarById = new Map();
  for (const f of sidecars) {
    const m = f.match(/^ISSUE-(\d{3,4})-/);
    if (m) sidecarById.set(m[1], path.join(TO_FIX, f));
  }

  const gaps = [];
  for (const id of cited) {
    const sidecar = sidecarById.get(id);
    if (!sidecar) continue; // cited but no sidecar = older issue, scope-of-test is on-disk parity only
    const obj = JSON.parse(await readFile(sidecar, 'utf8'));
    if (obj.status !== 'closed' && obj.status !== 'wont_fix') {
      gaps.push(`ISSUE-${id} cited in CHANGELOG but sidecar status="${obj.status}"`);
    }
  }

  assert.deepEqual(
    gaps,
    [],
    `Lifecycle gap — issues cited as fixed in CHANGELOG must show status:closed or status:wont_fix on disk:\n${gaps.join('\n')}`,
  );
});

test('Test 2: brain/issues.json registry agrees with sidecar disk truth (closed-state parity)', async (t) => {
  const issuesPath = path.join(ROOT, '_testatlas', 'brain', 'issues.json');
  if (!existsSync(issuesPath)) {
    t.skip('_testatlas/brain/issues.json absent — V1-only or fresh-checkout');
    return;
  }
  if (!existsSync(TO_FIX)) {
    t.skip('_testatlas/to_fix/ absent — lifecycle check N/A');
    return;
  }

  const registry = JSON.parse(await readFile(issuesPath, 'utf8'));
  const rows = Array.isArray(registry.issues) ? registry.issues : [];
  if (rows.length === 0) {
    t.skip('brain/issues.json registry empty — nothing to compare');
    return;
  }

  const sidecars = (await readdir(TO_FIX)).filter((f) => /^ISSUE-\d{3,4}-.+\.json$/.test(f));
  const sidecarStatusById = new Map();
  for (const f of sidecars) {
    const obj = JSON.parse(await readFile(path.join(TO_FIX, f), 'utf8'));
    if (obj.id) sidecarStatusById.set(obj.id, obj.status);
  }

  const drifted = [];
  for (const row of rows) {
    const onDisk = sidecarStatusById.get(row.id);
    if (onDisk && onDisk !== row.status) {
      drifted.push(`${row.id}: brain=${row.status} disk=${onDisk}`);
    }
  }

  assert.deepEqual(
    drifted,
    [],
    `Brain registry status disagrees with on-disk sidecar status — re-derive via "node scripts/index-artifacts.js":\n${drifted.join('\n')}`,
  );
});
