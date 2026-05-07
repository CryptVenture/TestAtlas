// test/scripts/_restage-helpers.js
//
// Quick 260506-mgr — shared helpers for the restageAdapters test suite.
// Seeds a fake post-swap <target>/.testatlas/ tree containing just enough
// adapter source files + capabilities JSON to drive restageAdapters in
// isolation. Each test uses its own tmpdir; helpers never touch real $HOME
// or the repo working tree.

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// 7 in-scope adapters per ISSUE-030.
export const IN_SCOPE_ADAPTERS = Object.freeze([
  'claude-code',
  'cursor',
  'opencode',
  'kilocode',
  'aider',
  'mcp',
  'generic',
]);

// 5 in-scope adapters that declare a globalOutputPattern (cursor + kilocode
// reuse the project-local pattern in global mode, so they are equivalent in
// global tests; we still cover them in local mode).
export const IN_SCOPE_ADAPTERS_GLOBAL = Object.freeze([
  'claude-code',
  'opencode',
  'aider',
  'mcp',
  'generic',
]);

/**
 * Read the live capabilities JSON from the suite repo and return it parsed.
 * Tests use this as the canonical source of truth for outputPattern /
 * globalOutputPattern resolution.
 */
export async function loadLiveCapabilities() {
  const raw = await readFile(
    path.join(REPO_ROOT, '.testatlas', 'adapters', 'adapter-capabilities.json'),
    'utf8',
  );
  return JSON.parse(raw);
}

/**
 * Write a minimal `adapter-capabilities.json` under
 * `<target>/.testatlas/adapters/` containing only the adapters the caller
 * asks for. The shape matches the live schema (relevant fields only).
 *
 * @param {string} target
 * @param {string[]} adapterNames
 */
export async function seedCapabilities(target, adapterNames) {
  const live = await loadLiveCapabilities();
  const subset = live.adapters.filter((a) => adapterNames.includes(a.name));
  const minimal = {
    $schema: '../schemas/adapter-capabilities.schema.json',
    version: live.version,
    adapters: subset,
  };
  const dst = path.join(target, '.testatlas', 'adapters', 'adapter-capabilities.json');
  await mkdir(path.dirname(dst), { recursive: true });
  await writeFile(dst, `${JSON.stringify(minimal, null, 2)}\n`, 'utf8');
}

/**
 * Seed an adapter's source subtree under
 * `<target>/.testatlas/adapters/<name>/`, mirroring the live repo's layout
 * for that adapter (per-command-file: dirname(outputPattern) subtree;
 * concatenated/mcp: bare basename file). Optionally override the file
 * content with a per-path body so tests can simulate "vN+1 has different
 * bytes" without copying the whole live tree.
 *
 * Returns the list of relative-to-`adapters/<name>/` source paths written
 * (POSIX-form) so tests can map them to outputDir paths.
 *
 * @param {string} target
 * @param {string} name
 * @param {object} cap        Adapter capability entry from capabilities.adapters.
 * @param {{contentMap?: Record<string, string>, files?: string[]}} [opts]
 *   contentMap: per-source-relative-path body override (POSIX-form keys).
 *   files: explicit list of source-relative paths to seed (for per-command
 *          adapters). Defaults to a 2-file slice of the live source tree
 *          for per-command adapters; the bare basename for file-pattern adapters.
 */
export async function seedAdapterSource(target, name, cap, opts = {}) {
  const adapterDir = path.join(target, '.testatlas', 'adapters', name);
  const localPattern = cap.outputPattern;
  const localPrefix = path.dirname(localPattern);
  const isFilePattern = localPrefix === '.' || localPrefix === '';
  const written = [];

  if (isFilePattern) {
    // bare basename: e.g. CONVENTIONS.md, mcp-server-manifest.json
    const base = path.basename(localPattern);
    const rel = base; // source-rel = bare basename
    const dst = path.join(adapterDir, rel);
    await mkdir(path.dirname(dst), { recursive: true });
    const body =
      opts.contentMap?.[rel] ?? `# ${name} v-NEW source body for ${rel}\n# ts=${Date.now()}\n`;
    await writeFile(dst, body, 'utf8');
    written.push(rel);
  } else {
    // per-command-file: subtree under <localPrefix>/
    const requested = opts.files ?? [`${localPrefix}/atlas-bootstrap${cap.fileExtension ?? '.md'}`];
    for (const rel of requested) {
      const dst = path.join(adapterDir, rel);
      await mkdir(path.dirname(dst), { recursive: true });
      const body =
        opts.contentMap?.[rel] ?? `# ${name} v-NEW source body for ${rel}\n# ts=${Date.now()}\n`;
      await writeFile(dst, body, 'utf8');
      written.push(rel);
    }
  }

  return written;
}

/**
 * Resolve the on-disk POSIX-relative outputDir path that
 * copyAdapterCommandFiles would emit for a given source-rel path under
 * <adapter>/ (matching the active outputPattern).
 *
 * For a per-command-file adapter:
 *   sourceRel  = "<localPrefix>/foo.md"
 *   outputRel  = "<activePrefix>/foo.md"
 * For a file-pattern adapter:
 *   sourceRel  = "<basename>"
 *   outputRel  = "<activePattern>"
 *
 * @param {object} cap
 * @param {string} sourceRel
 * @param {boolean} isGlobal
 * @returns {string}
 */
export function resolveOutputRel(cap, sourceRel, isGlobal) {
  const localPattern = cap.outputPattern;
  const activePattern = isGlobal ? cap.globalOutputPattern : localPattern;
  const localPrefix = path.dirname(localPattern);
  const activePrefix = path.dirname(activePattern);
  const isFilePattern = localPrefix === '.' || localPrefix === '';
  if (isFilePattern) return activePattern;
  // sourceRel begins with localPrefix; replace prefix with activePrefix.
  const tail = sourceRel.startsWith(`${localPrefix}/`)
    ? sourceRel.slice(localPrefix.length + 1)
    : sourceRel;
  return `${activePrefix}/${tail}`;
}

/**
 * Copy the live `<repo>/.testatlas/schemas/` (incl. `vocabulary.schema.json`)
 * into the target's `.testatlas/`. Required only for tests that exercise
 * `regenerateInstallManifest` (which AJV-validates the written manifest via
 * the schema-loader). Pure-restage tests skip this.
 *
 * @param {string} target
 */
export async function seedSchemas(target) {
  await cp(
    path.join(REPO_ROOT, '.testatlas', 'schemas'),
    path.join(target, '.testatlas', 'schemas'),
    { recursive: true },
  );
}

/**
 * Build a minimal `oldManifest` object for restageAdapters input.
 *
 * @param {{adapters: string[], mode?: 'global', files?: Array<{path: string, source?: string, type: string, hash?: string}>}} parts
 * @returns {object}
 */
export function buildOldManifest(parts) {
  return {
    manifestVersion: '1',
    suiteVersion: '0.0.0',
    schemaVersion: 1,
    installedAt: '2025-01-01T00:00:00.000Z',
    target: '/dev/null',
    adapters: parts.adapters,
    files: parts.files ?? [],
    ...(parts.mode ? { mode: parts.mode } : {}),
  };
}
