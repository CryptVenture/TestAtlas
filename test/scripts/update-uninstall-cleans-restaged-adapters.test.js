// test/scripts/update-uninstall-cleans-restaged-adapters.test.js
//
// Quick 260506-mgr — ISSUE-030.
// runUpdate previously only replaced <target>/.testatlas/ via atomic swap;
// adapter command files staged outside .testatlas/ (e.g. ~/.claude/commands/,
// .cursor/rules/, ~/.config/aider/CONVENTIONS.md) were never re-emitted,
// orphaning install-time bodies and breaking drift+uninstall tracking.
// restageAdapters() now re-emits these via copyAdapterCommandFiles after
// the swap, prunes orphans, and feeds the entries into regenerateInstallManifest.
//
// This file: verifies the uninstall reach-back invariant. runUninstall walks
// `manifest.files[]` and rm's every tracked path. After restage + manifest
// regen, every restaged adapter file MUST appear in the manifest with type
// ∈ {'adapter','command'} so an uninstall can reach it. We additionally
// simulate the uninstall step (rm by manifest entries) and assert no file
// survives.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { regenerateInstallManifest, restageAdapters } from '../../scripts/lib/update-core.js';
import {
  buildOldManifest,
  IN_SCOPE_ADAPTERS,
  loadLiveCapabilities,
  resolveOutputRel,
  seedAdapterSource,
  seedCapabilities,
  seedSchemas,
} from './_restage-helpers.js';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

const QUIET = () => {};

test('every restaged adapter file is tracked in regenerated manifest with type ∈ {command,adapter}', async (t) => {
  // Cover all 7 in-scope adapters in a single run-through.
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-restage-uninst-track-'));
  t.after(() => rm(target, { recursive: true, force: true }));

  const live = await loadLiveCapabilities();
  await seedCapabilities(target, [...IN_SCOPE_ADAPTERS]);
  await seedSchemas(target);

  /** @type {Array<{name: string, written: string[], cap: object}>} */
  const seeded = [];
  for (const name of IN_SCOPE_ADAPTERS) {
    const cap = live.adapters.find((a) => a.name === name);
    const written = await seedAdapterSource(target, name, cap);
    seeded.push({ name, written, cap });
  }

  const backupDir = await mkdtemp(path.join(tmpdir(), 'restage-uninst-track-bk-'));
  t.after(() => rm(backupDir, { recursive: true, force: true }));
  const oldManifestPayload = buildOldManifest({ adapters: [...IN_SCOPE_ADAPTERS] });
  await writeFile(
    path.join(backupDir, '.install-manifest.json'),
    `${JSON.stringify(oldManifestPayload, null, 2)}\n`,
    'utf8',
  );

  const restage = await restageAdapters(target, oldManifestPayload, { logger: QUIET });
  await regenerateInstallManifest(target, backupDir, '9.9.9', restage.entries);

  const manifest = JSON.parse(
    await readFile(path.join(target, '.testatlas', '.install-manifest.json'), 'utf8'),
  );

  // Every (name × source-rel) pair must show up in manifest.files with
  // type ∈ {command,adapter}.
  for (const { name, written, cap } of seeded) {
    for (const srcRel of written) {
      const outRel = resolveOutputRel(cap, srcRel, false);
      const tracked = manifest.files.find((f) => f.path === outRel);
      assert.ok(
        tracked,
        `[uninstall-reach] manifest.files must track ${outRel} (adapter=${name}); have: ${manifest.files
          .map((f) => f.path)
          .join(', ')}`,
      );
      assert.ok(
        tracked.type === 'command' || tracked.type === 'adapter',
        `[uninstall-reach] ${outRel} must have type ∈ {command,adapter}; got ${tracked.type}`,
      );
    }
  }
});

test('simulated uninstall via manifest.files[] removes every restaged adapter file from disk', async (t) => {
  // Same shape as the test above, then we walk manifest.files[] and rm each
  // path that lives OUTSIDE .testatlas/ — the precise contract runUninstall
  // honors. After the simulated uninstall, no restaged file may remain.
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-restage-uninst-sim-'));
  t.after(() => rm(target, { recursive: true, force: true }));

  const live = await loadLiveCapabilities();
  await seedCapabilities(target, [...IN_SCOPE_ADAPTERS]);
  await seedSchemas(target);

  /** @type {Array<{name: string, written: string[], cap: object}>} */
  const seeded = [];
  for (const name of IN_SCOPE_ADAPTERS) {
    const cap = live.adapters.find((a) => a.name === name);
    const written = await seedAdapterSource(target, name, cap);
    seeded.push({ name, written, cap });
  }

  const backupDir = await mkdtemp(path.join(tmpdir(), 'restage-uninst-sim-bk-'));
  t.after(() => rm(backupDir, { recursive: true, force: true }));
  const oldManifestPayload = buildOldManifest({ adapters: [...IN_SCOPE_ADAPTERS] });
  await writeFile(
    path.join(backupDir, '.install-manifest.json'),
    `${JSON.stringify(oldManifestPayload, null, 2)}\n`,
    'utf8',
  );

  const restage = await restageAdapters(target, oldManifestPayload, { logger: QUIET });
  await regenerateInstallManifest(target, backupDir, '9.9.9', restage.entries);

  // Sanity precondition: every restaged file exists.
  const expectedOutPaths = [];
  for (const { written, cap } of seeded) {
    for (const srcRel of written) {
      const outRel = resolveOutputRel(cap, srcRel, false);
      const outAbs = path.join(target, outRel);
      assert.equal(await exists(outAbs), true, `pre-uninstall: ${outRel} must exist`);
      expectedOutPaths.push(outRel);
    }
  }

  // Simulate uninstall: rm every manifest entry where type ∈ {command,adapter}
  // AND path is OUTSIDE .testatlas/. (Inside .testatlas/ is handled by the
  // bulk rm of the suite tree, which the real runUninstall also does — but
  // the contract this test exercises is "out-of-tree adapter files are
  // reachable via the manifest".)
  const manifest = JSON.parse(
    await readFile(path.join(target, '.testatlas', '.install-manifest.json'), 'utf8'),
  );
  for (const f of manifest.files) {
    if (f.type !== 'command' && f.type !== 'adapter') continue;
    if (f.path.startsWith('.testatlas/')) continue;
    const abs = path.join(target, ...f.path.split('/'));
    await rm(abs, { force: true });
  }

  // No restaged file may survive.
  for (const outRel of expectedOutPaths) {
    assert.equal(
      await exists(path.join(target, outRel)),
      false,
      `post-uninstall: ${outRel} must NOT exist on disk (manifest reach-back failed)`,
    );
  }
});
