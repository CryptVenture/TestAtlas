// scripts/lib/copy-v2-artifacts.js
//
// Shared helper for populating V2 workspace artifacts from the suite source
// tree (.testatlas/) into the runtime workspace (_testatlas/).
//
// Used by:
//   - init-workspace.js (fresh init)
//   - v2-migrate.js (V1→V2 migration and V2 repair)
//
// DRY — single source of truth for what V2 artifacts must exist in the
// workspace and where they come from in the suite tree.

import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Copy a directory tree from suite source to workspace if the source exists.
 * Idempotent: skips files that already exist in the workspace.
 *
 * @param {string} sourceDir — absolute path in suite tree (e.g. .testatlas/agents/personas/system/)
 * @param {string} targetDir — absolute path in workspace (e.g. _testatlas/agents/personas/system/)
 * @param {string[]} [created] — mutable array to push created relative paths into
 * @param {string} [relPrefix] — prefix for created[] entries (e.g. "agents/personas/system/")
 */
async function copyDirIfPresent(sourceDir, targetDir, created = [], relPrefix = '') {
  const sourceExists = await stat(sourceDir).catch(() => null);
  if (!sourceExists) return;

  await mkdir(targetDir, { recursive: true });

  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const dstPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirIfPresent(srcPath, dstPath, created, path.join(relPrefix, entry.name));
    } else if (entry.isFile()) {
      const dstExists = await stat(dstPath).catch(() => null);
      if (!dstExists) {
        await cp(srcPath, dstPath);
        created.push(path.join(relPrefix, entry.name).split(path.sep).join('/'));
      }
    }
  }
}

/**
 * Populate the V2 workspace with artifacts copied from the suite source tree.
 *
 * @param {{
 *   cwd: string,
 *   wsDir: string,
 *   nowIso: string,
 *   created: string[],
 * }} ctx
 * @returns {Promise<void>}
 */
export async function copyV2Artifacts({ cwd, wsDir, nowIso, created }) {
  const suiteDir = path.join(cwd, '.testatlas');

  // ── 1. System personas ───────────────────────────────────────────────────
  await copyDirIfPresent(
    path.join(suiteDir, 'agents', 'personas', 'system'),
    path.join(wsDir, 'agents', 'personas', 'system'),
    created,
    'agents/personas/system',
  );

  // ── 2. Council templates ─────────────────────────────────────────────────
  await copyDirIfPresent(
    path.join(suiteDir, 'agents', 'councils', 'council_templates'),
    path.join(wsDir, 'agents', 'councils', 'council_templates'),
    created,
    'agents/councils/council_templates',
  );

  // ── 3. Brain schemas ─────────────────────────────────────────────────────
  const schemasSource = path.join(suiteDir, 'schemas');
  const schemasTarget = path.join(wsDir, 'brain', 'schema');
  const schemasSourceStat = await stat(schemasSource).catch(() => null);
  if (schemasSourceStat) {
    await mkdir(schemasTarget, { recursive: true });
    let schemaFiles;
    try {
      schemaFiles = await readdir(schemasSource);
    } catch {
      schemaFiles = [];
    }
    for (const file of schemaFiles.filter((f) => f.endsWith('.schema.json'))) {
      const srcPath = path.join(schemasSource, file);
      const dstPath = path.join(schemasTarget, file);
      const dstExists = await stat(dstPath).catch(() => null);
      if (!dstExists) {
        await cp(srcPath, dstPath);
        created.push(`brain/schema/${file}`);
      }
    }
  }

  // ── 4. Agents registry.md (human-readable index) ────────────────────────
  const registryMdSource = path.join(suiteDir, 'agents', 'registry.md');
  const registryMdTarget = path.join(wsDir, 'agents', 'registry.md');
  const registryMdExists = await stat(registryMdSource).catch(() => null);
  if (registryMdExists) {
    const dstExists = await stat(registryMdTarget).catch(() => null);
    if (!dstExists) {
      await cp(registryMdSource, registryMdTarget);
      created.push('agents/registry.md');
    }
  }

  // ── 5. Update agents/registry.json with persona + council IDs ───────────
  const registryPath = path.join(wsDir, 'agents', 'registry.json');
  let registry = {
    schema_version: '2.0.0',
    last_updated: nowIso,
    personas: [],
    councils: [],
    generated_count: 0,
    session_count: 0,
  };

  const registryExists = await stat(registryPath).catch(() => null);
  if (registryExists) {
    try {
      const existing = JSON.parse(await readFile(registryPath, 'utf8'));
      registry = { ...registry, ...existing };
    } catch {
      // corrupt — overwrite below
    }
  }

  // Discover personas from the copied files
  const personasDir = path.join(wsDir, 'agents', 'personas', 'system');
  const personasStat = await stat(personasDir).catch(() => null);
  if (personasStat) {
    try {
      const personaFiles = await readdir(personasDir);
      const personaIds = personaFiles
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
      // Merge: keep existing + add missing, no duplicates
      const existingIds = new Set(registry.personas.map((p) => (typeof p === 'string' ? p : p.id)));
      for (const id of personaIds) {
        if (!existingIds.has(id)) {
          registry.personas.push(id);
          existingIds.add(id);
        }
      }
    } catch {
      // noop
    }
  }

  // Discover council templates from the copied files
  const councilsDir = path.join(wsDir, 'agents', 'councils', 'council_templates');
  const councilsStat = await stat(councilsDir).catch(() => null);
  if (councilsStat) {
    try {
      const councilFiles = await readdir(councilsDir);
      const councilIds = councilFiles
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
      const existingIds = new Set(registry.councils.map((c) => (typeof c === 'string' ? c : c.id)));
      for (const id of councilIds) {
        if (!existingIds.has(id)) {
          registry.councils.push(id);
          existingIds.add(id);
        }
      }
    } catch {
      // noop
    }
  }

  registry.last_updated = nowIso;
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(
    registryPath,
    `${JSON.stringify(registry, null, 2)}
`,
    'utf8',
  );
  if (!registryExists) {
    created.push('agents/registry.json');
  }
}
