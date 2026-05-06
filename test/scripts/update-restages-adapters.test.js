// test/scripts/update-restages-adapters.test.js
//
// Quick 260506-mgr — ISSUE-030.
// runUpdate previously only replaced <target>/.testatlas/ via atomic swap;
// adapter command files staged outside .testatlas/ (e.g. ~/.claude/commands/,
// .cursor/rules/, ~/.config/aider/CONVENTIONS.md) were never re-emitted,
// orphaning install-time bodies and breaking drift+uninstall tracking.
// restageAdapters() now re-emits these via copyAdapterCommandFiles after
// the swap, prunes orphans, and feeds the entries into regenerateInstallManifest.
//
// This file: parametrized over [claude-code, cursor, opencode, kilocode,
// aider, mcp, generic], covering the 5 must-haves per adapter:
//   (a) re-emit (vN+1 source ≠ vN install-time body → file is overwritten)
//   (b) hand-edit overwrite (user-mutated outputDir file is overwritten)
//   (c) orphan-prune (file present in old manifest but absent from new stage is rm'd)
//   (d) new file (file added in vN+1 lands at outputDir)
//   (e) manifest entry (regenerated manifest tracks restaged file with type)

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

async function freshTarget(prefix) {
  return mkdtemp(path.join(tmpdir(), `testatlas-restage-${prefix}-`));
}

const QUIET = () => {};

for (const adapterName of IN_SCOPE_ADAPTERS) {
  test(`restageAdapters [${adapterName}] (a) re-emits new source over old install-time body`, async (t) => {
    const target = await freshTarget(`re-emit-${adapterName}`);
    t.after(() => rm(target, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    assert.ok(cap, `live capabilities must define ${adapterName}`);
    await seedCapabilities(target, [adapterName]);

    // Seed v-NEW source bodies under <target>/.testatlas/adapters/<name>/...
    const written = await seedAdapterSource(target, adapterName, cap, {
      contentMap: {},
    });

    // Pre-place an OLD install-time body at the resolved outputDir to prove
    // restageAdapters overwrites it. Use deliberately different content.
    for (const srcRel of written) {
      const outRel = resolveOutputRel(cap, srcRel, false);
      const outAbs = path.join(target, outRel);
      await mkdir(path.dirname(outAbs), { recursive: true });
      await writeFile(outAbs, '<<OLD INSTALL-TIME BODY>>\n', 'utf8');
    }

    const old = buildOldManifest({ adapters: [adapterName] });
    const result = await restageAdapters(target, old, { logger: QUIET });

    assert.equal(
      result.entries.length,
      written.length,
      `restage must emit ${written.length} entries for ${adapterName}; got ${result.entries.length}`,
    );

    // Each restaged file's content must equal the v-NEW source body, NOT the
    // sentinel we pre-placed.
    for (const srcRel of written) {
      const outRel = resolveOutputRel(cap, srcRel, false);
      const outAbs = path.join(target, outRel);
      const onDisk = await readFile(outAbs, 'utf8');
      assert.notEqual(
        onDisk,
        '<<OLD INSTALL-TIME BODY>>\n',
        `${adapterName}: ${outRel} must NOT still hold the OLD body`,
      );
      const sourceAbs = path.join(target, '.testatlas', 'adapters', adapterName, srcRel);
      const sourceBody = await readFile(sourceAbs, 'utf8');
      assert.equal(
        onDisk,
        sourceBody,
        `${adapterName}: ${outRel} must match the new source body byte-for-byte`,
      );
    }
  });

  test(`restageAdapters [${adapterName}] (b) overwrites a user hand-edit`, async (t) => {
    const target = await freshTarget(`hand-edit-${adapterName}`);
    t.after(() => rm(target, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    await seedCapabilities(target, [adapterName]);
    const written = await seedAdapterSource(target, adapterName, cap);

    // Simulate the OLD install having seeded the file (we just write it
    // ourselves), then the user hand-edited it.
    const srcRel = written[0];
    const outRel = resolveOutputRel(cap, srcRel, false);
    const outAbs = path.join(target, outRel);
    await mkdir(path.dirname(outAbs), { recursive: true });
    await writeFile(outAbs, '# user hand edits — keep these!\n', 'utf8');

    const old = buildOldManifest({ adapters: [adapterName] });
    await restageAdapters(target, old, { logger: QUIET });

    const onDisk = await readFile(outAbs, 'utf8');
    assert.ok(
      !/user hand edits/.test(onDisk),
      `${adapterName}: hand-edit must be overwritten on update; got body: ${onDisk}`,
    );
  });

  test(`restageAdapters [${adapterName}] (c) prunes orphan from old manifest`, async (t) => {
    const target = await freshTarget(`orphan-${adapterName}`);
    t.after(() => rm(target, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    await seedCapabilities(target, [adapterName]);
    const written = await seedAdapterSource(target, adapterName, cap);

    // Pick an orphan path: a sibling file that the new stage does NOT emit.
    // Place it under the same active prefix so it's a "real" stale file.
    const localPattern = cap.outputPattern;
    const localPrefix = path.dirname(localPattern);
    const isFilePattern = localPrefix === '.' || localPrefix === '';

    const orphanRel = isFilePattern
      ? `${path.dirname(localPattern) === '.' ? '' : `${path.dirname(localPattern)}/`}STALE-${adapterName}.md`
      : `${localPrefix}/atlas-REMOVED${cap.fileExtension ?? '.md'}`;
    const orphanAbs = path.join(target, orphanRel);
    await mkdir(path.dirname(orphanAbs), { recursive: true });
    await writeFile(orphanAbs, '# stale orphan\n', 'utf8');

    const old = buildOldManifest({
      adapters: [adapterName],
      files: [
        {
          path: orphanRel,
          source: `adapters/${adapterName}/${orphanRel}`,
          type: 'command',
          hash: 'ignored-by-restage',
        },
      ],
    });

    const result = await restageAdapters(target, old, { logger: QUIET });

    // Orphan must be pruned from disk and reported.
    assert.equal(
      await exists(orphanAbs),
      false,
      `${adapterName}: orphan ${orphanRel} must be rm'd from disk`,
    );
    assert.ok(
      result.pruned.includes(orphanRel),
      `${adapterName}: pruned[] must include ${orphanRel}; got ${JSON.stringify(result.pruned)}`,
    );

    // Sanity: the new stage's first file is still there.
    const okRel = resolveOutputRel(cap, written[0], false);
    assert.equal(
      await exists(path.join(target, okRel)),
      true,
      `${adapterName}: new stage's ${okRel} must still be on disk`,
    );
  });

  test(`restageAdapters [${adapterName}] (d) lands a brand-new vN+1 file at outputDir`, async (t) => {
    const target = await freshTarget(`newfile-${adapterName}`);
    t.after(() => rm(target, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    await seedCapabilities(target, [adapterName]);

    // Per-command adapters: seed an additional file beyond the default.
    // File-pattern adapters (aider, mcp): the bare basename IS the only file
    // — "new file" semantics for them just means it didn't exist before, so
    // we assert it lands.
    const localPrefix = path.dirname(cap.outputPattern);
    const isFilePattern = localPrefix === '.' || localPrefix === '';
    const files = isFilePattern
      ? undefined
      : [
          `${localPrefix}/atlas-bootstrap${cap.fileExtension ?? '.md'}`,
          `${localPrefix}/atlas-NEWLY-ADDED${cap.fileExtension ?? '.md'}`,
        ];
    const written = await seedAdapterSource(target, adapterName, cap, { files });

    const old = buildOldManifest({ adapters: [adapterName] });
    const result = await restageAdapters(target, old, { logger: QUIET });

    // Every seeded source file must land at its resolved outputDir.
    for (const srcRel of written) {
      const outRel = resolveOutputRel(cap, srcRel, false);
      assert.equal(
        await exists(path.join(target, outRel)),
        true,
        `${adapterName}: ${outRel} must exist after restage`,
      );
    }

    if (!isFilePattern) {
      const newRel = resolveOutputRel(
        cap,
        `${localPrefix}/atlas-NEWLY-ADDED${cap.fileExtension ?? '.md'}`,
        false,
      );
      assert.ok(
        result.entries.some(
          (e) => path.relative(target, e.absPath).split(path.sep).join('/') === newRel,
        ),
        `${adapterName}: new file must appear in restage entries`,
      );
    }
  });

  test(`restageAdapters [${adapterName}] (e) every restaged file is tracked in the regenerated manifest`, async (t) => {
    const target = await freshTarget(`mfst-${adapterName}`);
    t.after(() => rm(target, { recursive: true, force: true }));

    const live = await loadLiveCapabilities();
    const cap = live.adapters.find((a) => a.name === adapterName);
    await seedCapabilities(target, [adapterName]);
    const written = await seedAdapterSource(target, adapterName, cap);

    // Schemas + a backup-manifest file are needed for regenerateInstallManifest
    // (it writes the manifest via writeManifest → AJV-validates against the
    // schema closure).
    await seedSchemas(target);
    const backupDir = await mkdtemp(path.join(tmpdir(), `restage-mfst-${adapterName}-bk-`));
    t.after(() => rm(backupDir, { recursive: true, force: true }));
    const oldManifestPayload = buildOldManifest({ adapters: [adapterName] });
    await writeFile(
      path.join(backupDir, '.install-manifest.json'),
      `${JSON.stringify(oldManifestPayload, null, 2)}\n`,
      'utf8',
    );

    const restage = await restageAdapters(target, oldManifestPayload, { logger: QUIET });
    await regenerateInstallManifest(target, backupDir, '9.9.9', restage.entries);

    const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    for (const srcRel of written) {
      const outRel = resolveOutputRel(cap, srcRel, false);
      const tracked = manifest.files.find((f) => f.path === outRel);
      assert.ok(
        tracked,
        `${adapterName}: manifest.files must track ${outRel}; have: ${manifest.files.map((f) => f.path).join(', ')}`,
      );
      assert.ok(
        tracked.type === 'command' || tracked.type === 'adapter',
        `${adapterName}: manifest entry for ${outRel} must have type ∈ {command,adapter}; got ${tracked.type}`,
      );
    }
  });
}
