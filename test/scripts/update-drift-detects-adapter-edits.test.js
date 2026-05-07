// test/scripts/update-drift-detects-adapter-edits.test.js
//
// Quick 260506-mgr — ISSUE-030.
// runUpdate previously only replaced <target>/.testatlas/ via atomic swap;
// adapter command files staged outside .testatlas/ (e.g. ~/.claude/commands/,
// .cursor/rules/, ~/.config/aider/CONVENTIONS.md) were never re-emitted,
// orphaning install-time bodies and breaking drift+uninstall tracking.
// restageAdapters() now re-emits these via copyAdapterCommandFiles after
// the swap, prunes orphans, and feeds the entries into regenerateInstallManifest.
//
// This file: verifies the drift-detection chain stays intact end-to-end.
// After restage + regenerateInstallManifest, the manifest tracks each
// restaged adapter file with its hash. A subsequent hand-edit to one of
// those files MUST cause detectInstallDrift to surface kind:'drift' with
// the edited path in `drifted[]`.
//
// Without restageAdapters + the manifest extension, the manifest would
// not track those out-of-tree paths at all, so drift detection would be
// permanently blind to user edits of installed slash-command files.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { detectInstallDrift } from '../../scripts/lib/manifest.js';
import { regenerateInstallManifest, restageAdapters } from '../../scripts/lib/update-core.js';
import {
  buildOldManifest,
  loadLiveCapabilities,
  resolveOutputRel,
  seedAdapterSource,
  seedCapabilities,
  seedSchemas,
} from './_restage-helpers.js';

const QUIET = () => {};

test('detectInstallDrift fires after a hand-edit to a restaged adapter file (claude-code)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-restage-drift-cc-'));
  t.after(() => rm(target, { recursive: true, force: true }));

  const live = await loadLiveCapabilities();
  const cap = live.adapters.find((a) => a.name === 'claude-code');
  await seedCapabilities(target, ['claude-code']);
  const written = await seedAdapterSource(target, 'claude-code', cap, {
    files: ['.claude/commands/atlas-bootstrap.md', '.claude/commands/atlas-core-init.md'],
  });
  await seedSchemas(target);

  const backupDir = await mkdtemp(path.join(tmpdir(), 'restage-drift-cc-bk-'));
  t.after(() => rm(backupDir, { recursive: true, force: true }));
  const oldManifestPayload = buildOldManifest({ adapters: ['claude-code'] });
  await writeFile(
    path.join(backupDir, '.install-manifest.json'),
    `${JSON.stringify(oldManifestPayload, null, 2)}\n`,
    'utf8',
  );

  const restage = await restageAdapters(target, oldManifestPayload, { logger: QUIET });
  await regenerateInstallManifest(target, backupDir, '9.9.9', restage.entries);

  // Sanity: manifest exists and tracks the restaged file.
  const editedSrcRel = written[0]; // .claude/commands/atlas-bootstrap.md
  const editedOutRel = resolveOutputRel(cap, editedSrcRel, false);
  const manifest = JSON.parse(
    await readFile(path.join(target, '.testatlas', '.install-manifest.json'), 'utf8'),
  );
  assert.ok(
    manifest.files.find((f) => f.path === editedOutRel),
    `pre-edit: manifest must track ${editedOutRel}`,
  );

  // No drift before the edit.
  const baseline = await detectInstallDrift(target, { cwd: target });
  assert.equal(
    baseline.kind,
    'in-sync',
    `pre-edit drift kind must be 'in-sync'; got ${baseline.kind} (${baseline.reason ?? ''})`,
  );

  // Hand-edit the restaged file.
  const editedAbs = path.join(target, editedOutRel);
  const original = await readFile(editedAbs, 'utf8');
  await writeFile(editedAbs, `${original}\n# USER HAND EDIT — ISSUE-030 drift smoke\n`, 'utf8');

  // Drift must now fire and call out the edited path.
  const drift = await detectInstallDrift(target, { cwd: target });
  assert.equal(drift.kind, 'drift', `post-edit drift kind must be 'drift'; got ${drift.kind}`);
  assert.ok(Array.isArray(drift.drifted) && drift.drifted.length >= 1);
  assert.ok(
    drift.drifted.some((d) => d.path === editedOutRel),
    `drifted[] must include ${editedOutRel}; got ${JSON.stringify(drift.drifted)}`,
  );
});

test('detectInstallDrift fires on a hand-edit to a restaged aider CONVENTIONS.md', async (t) => {
  // File-pattern adapter — stresses the basename-resolution branch.
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-restage-drift-aider-'));
  t.after(() => rm(target, { recursive: true, force: true }));

  const live = await loadLiveCapabilities();
  const cap = live.adapters.find((a) => a.name === 'aider');
  await seedCapabilities(target, ['aider']);
  const written = await seedAdapterSource(target, 'aider', cap);
  await seedSchemas(target);

  const backupDir = await mkdtemp(path.join(tmpdir(), 'restage-drift-aider-bk-'));
  t.after(() => rm(backupDir, { recursive: true, force: true }));
  const oldManifestPayload = buildOldManifest({ adapters: ['aider'] });
  await writeFile(
    path.join(backupDir, '.install-manifest.json'),
    `${JSON.stringify(oldManifestPayload, null, 2)}\n`,
    'utf8',
  );

  const restage = await restageAdapters(target, oldManifestPayload, { logger: QUIET });
  await regenerateInstallManifest(target, backupDir, '9.9.9', restage.entries);

  const outRel = resolveOutputRel(cap, written[0], false); // 'CONVENTIONS.md'
  const editedAbs = path.join(target, outRel);
  const original = await readFile(editedAbs, 'utf8');
  await writeFile(editedAbs, `${original}\n# DRIFT — aider hand edit\n`, 'utf8');

  const drift = await detectInstallDrift(target, { cwd: target });
  assert.equal(drift.kind, 'drift', `aider drift kind must be 'drift'; got ${drift.kind}`);
  assert.ok(
    drift.drifted.some((d) => d.path === outRel),
    `aider drifted[] must include ${outRel}; got ${JSON.stringify(drift.drifted)}`,
  );
});
