// test/scripts/update-restages-adapters-global-mode.test.js
//
// Quick 260506-mgr — ISSUE-030.
// runUpdate previously only replaced <target>/.testatlas/ via atomic swap;
// adapter command files staged outside .testatlas/ (e.g. ~/.claude/commands/,
// .cursor/rules/, ~/.config/aider/CONVENTIONS.md) were never re-emitted,
// orphaning install-time bodies and breaking drift+uninstall tracking.
// restageAdapters() now re-emits these via copyAdapterCommandFiles after
// the swap, prunes orphans, and feeds the entries into regenerateInstallManifest.
//
// This file: covers global mode for the 5 adapters that declare a distinct
// globalOutputPattern (claude-code, opencode, aider, mcp, generic). When
// oldManifest.mode === 'global', restageAdapters MUST resolve outputDir via
// globalOutputPattern (target=$HOME-equivalent) — NOT the project-local
// pattern. The regenerated manifest must preserve mode:'global' end-to-end.
//
// Tests use a tmpdir as the fake $HOME — process.env is never mutated.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { regenerateInstallManifest, restageAdapters } from '../../scripts/lib/update-core.js';
import {
  buildOldManifest,
  IN_SCOPE_ADAPTERS_GLOBAL,
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

for (const adapterName of IN_SCOPE_ADAPTERS_GLOBAL) {
  test(`restageAdapters [${adapterName}] global mode: file lands at globalOutputPattern (NOT local)`, async (t) => {
    // Tmpdir acts as the fake $HOME — restageAdapters receives it as `target`.
    const tmpHome = await mkdtemp(path.join(tmpdir(), `testatlas-restage-glb-${adapterName}-`));
    t.after(() => rm(tmpHome, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    assert.ok(cap?.globalOutputPattern, `${adapterName} must declare globalOutputPattern`);
    await seedCapabilities(tmpHome, [adapterName]);
    const written = await seedAdapterSource(tmpHome, adapterName, cap);

    const old = buildOldManifest({ adapters: [adapterName], mode: 'global' });
    const result = await restageAdapters(tmpHome, old, { logger: QUIET });

    assert.equal(
      result.entries.length,
      written.length,
      `${adapterName}: expected ${written.length} restaged entries`,
    );

    for (const srcRel of written) {
      const globalRel = resolveOutputRel(cap, srcRel, true);
      const localRel = resolveOutputRel(cap, srcRel, false);

      // The file MUST be at the GLOBAL outputDir.
      assert.equal(
        await exists(path.join(tmpHome, globalRel)),
        true,
        `${adapterName}: global-mode file must exist at ${globalRel}`,
      );

      // If global ≠ local pattern, the local path MUST NOT have been written
      // (we'd be polluting the project tree from a global update).
      if (globalRel !== localRel) {
        assert.equal(
          await exists(path.join(tmpHome, localRel)),
          false,
          `${adapterName}: global-mode must NOT write to local path ${localRel}`,
        );
      }
    }
  });

  test(`restageAdapters [${adapterName}] global mode: regenerated manifest preserves mode:'global'`, async (t) => {
    const tmpHome = await mkdtemp(
      path.join(tmpdir(), `testatlas-restage-glb-mfst-${adapterName}-`),
    );
    t.after(() => rm(tmpHome, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    await seedCapabilities(tmpHome, [adapterName]);
    const written = await seedAdapterSource(tmpHome, adapterName, cap);
    await seedSchemas(tmpHome);

    const backupDir = await mkdtemp(path.join(tmpdir(), `restage-glb-bk-${adapterName}-`));
    t.after(() => rm(backupDir, { recursive: true, force: true }));
    const oldManifestPayload = buildOldManifest({ adapters: [adapterName], mode: 'global' });
    await writeFile(
      path.join(backupDir, '.install-manifest.json'),
      `${JSON.stringify(oldManifestPayload, null, 2)}\n`,
      'utf8',
    );

    const restage = await restageAdapters(tmpHome, oldManifestPayload, { logger: QUIET });
    await regenerateInstallManifest(tmpHome, backupDir, '9.9.9', restage.entries);

    const manifest = JSON.parse(
      await readFile(path.join(tmpHome, '.testatlas', '.install-manifest.json'), 'utf8'),
    );
    assert.equal(manifest.mode, 'global', `${adapterName}: manifest.mode must remain 'global'`);

    // Each restaged file must appear in manifest.files at the GLOBAL path.
    for (const srcRel of written) {
      const globalRel = resolveOutputRel(cap, srcRel, true);
      const tracked = manifest.files.find((f) => f.path === globalRel);
      assert.ok(
        tracked,
        `${adapterName}: manifest.files must track ${globalRel} (global mode); have: ${manifest.files.map((f) => f.path).join(', ')}`,
      );
      assert.ok(
        tracked.type === 'command' || tracked.type === 'adapter',
        `${adapterName}: ${globalRel} must have type ∈ {command,adapter}; got ${tracked.type}`,
      );
    }
  });
}
