// scripts/explore-codebase.js
//
// App-map emitter for `/atlas:explore-codebase`. Detects external touchpoints
// the prior hand-authored `_testatlas/12_app_map.json` was missing
// (ISSUE-012, dogfood finding G-02):
//
//   1. External GitHub Actions Marketplace deps in `.github/workflows/*.yml`
//      (skip local `./...` actions and `docker://...` refs).
//   2. System binaries spawned via `child_process.spawn` / `execFile` in
//      `scripts/**.js` (skip the internal `node` binary and absolute paths
//      so we surface dependencies on PATH-resolved external tools only).
//   3. Consumer-side npm hop: `npm install` line in `install.sh` —
//      separate trust boundary from the suite tarball download.
//
// This is the script accelerator that backs the `/atlas:explore-codebase`
// command (PRD §22 — agent-driven primary path, optional Node script for
// reproducibility). It exists so the integrations slice of the app-map is
// mechanically rebuildable rather than hand-curated.
//
// Public API:
//   - `detectIntegrations({ rootDir })` → flat array of `{name, type,
//     direction?, source?, evidence?}` objects.
//   - `buildAppMap({ rootDir })` → full app-map object: reads any existing
//     `_testatlas/12_app_map.json`, preserves the non-integrations slices
//     verbatim, and merges detected integrations in (replacing legacy string
//     entries whose name matches a freshly detected one).
//
// CLI usage:
//   node scripts/explore-codebase.js [--root <dir>] [--out <path>|-]
//
// Defaults:
//   --root  process.cwd()
//   --out   <root>/_testatlas/12_app_map.json
//
// `--out -` writes JSON to stdout (used by tests + manual previews).
//
// Trust boundary note: The script reads workflow YAMLs and JS source
// without parsing them as code — pure regex extraction. No code is
// executed; no external services are contacted. Safe to run from any
// untrusted clone.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';

// `uses: <ref>` line in a GitHub workflow YAML. The capture is the bare ref
// (which may include `@<version>` for marketplace actions).
const USES_RE = /^\s*-?\s*uses:\s*(\S+)/gm;

// `spawn(...)` or `execFile(...)` first-arg string literal. We capture the
// literal value so we can filter `node` and absolute paths.
const SPAWN_RE = /(?:spawn|execFile)\s*\(\s*['"]([^'"]+)['"]/g;

// `npm install` invocation in a shell script (not as part of a comment). We
// match the full line so the line number ends up in `source`.
const NPM_INSTALL_RE = /\bnpm\s+install\b/;

/**
 * Detect external integrations in `rootDir`. Order is stable and deterministic
 * so the regenerated app-map produces minimal diffs across runs.
 *
 * @param {{ rootDir?: string }} [opts]
 * @returns {Promise<Array<{
 *   name: string,
 *   type: 'github-action' | 'system-binary' | 'network-runtime',
 *   direction?: 'build-time' | 'consumer-outbound',
 *   source?: string,
 *   evidence?: string,
 * }>>}
 */
export async function detectIntegrations({ rootDir = process.cwd() } = {}) {
  const out = [];
  out.push(...(await detectGitHubActions(rootDir)));
  out.push(...(await detectSystemBinaries(rootDir)));
  out.push(...(await detectConsumerNpmHop(rootDir)));
  return out;
}

async function detectGitHubActions(rootDir) {
  const dir = path.join(rootDir, '.github', 'workflows');
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  // Sort filenames for cross-platform deterministic output.
  const yamlFiles = entries
    .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
    .map((e) => e.name)
    .sort();

  const seen = new Set();
  const out = [];
  for (const name of yamlFiles) {
    const text = await readFile(path.join(dir, name), 'utf8');
    USES_RE.lastIndex = 0;
    for (const m of text.matchAll(USES_RE)) {
      const ref = m[1];
      // Skip local actions and docker refs — both are not Marketplace deps.
      if (ref.startsWith('./') || ref.startsWith('../') || ref.startsWith('docker://')) {
        continue;
      }
      if (seen.has(ref)) continue;
      seen.add(ref);
      out.push({ name: ref, type: 'github-action', direction: 'build-time' });
    }
  }
  return out;
}

async function detectSystemBinaries(rootDir) {
  const scriptsDir = path.join(rootDir, 'scripts');
  const seen = new Set();
  const out = [];

  /** @param {string} dir */
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    // Sort entries for deterministic order across filesystems.
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      // Only inspect production JS — exclude test fixtures + .test.js files.
      if (!ent.name.endsWith('.js')) continue;
      if (ent.name.endsWith('.test.js')) continue;

      const text = await readFile(full, 'utf8');
      SPAWN_RE.lastIndex = 0;
      for (const m of text.matchAll(SPAWN_RE)) {
        const bin = m[1];
        // Internal node subprocess (e.g. regenerate-core spawning a child
        // worker) is not an external integration.
        if (bin === 'node') continue;
        // Absolute paths or paths-with-slashes are not PATH-resolved system
        // binaries; they are explicit file references and tracked elsewhere.
        if (bin.includes('/')) continue;
        // Variables / template strings (e.g. `${cmd}`) — already excluded
        // by the regex pattern requiring a literal string.

        if (seen.has(bin)) continue;
        seen.add(bin);
        const lineNo = text.slice(0, m.index).split('\n').length;
        out.push({
          name: bin,
          type: 'system-binary',
          source: `${path.relative(rootDir, full)}:${lineNo}`,
        });
      }
    }
  }

  await walk(scriptsDir);
  return out;
}

async function detectConsumerNpmHop(rootDir) {
  const installShPath = path.join(rootDir, 'install.sh');
  let text;
  try {
    text = await readFile(installShPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip pure comment lines — `# npm install ...` is documentation, not
    // an actual hop.
    if (/^\s*#/.test(line)) continue;
    if (NPM_INSTALL_RE.test(line)) {
      return [
        {
          name: 'consumer-npm-hop',
          type: 'network-runtime',
          direction: 'consumer-outbound',
          source: `install.sh:${i + 1}`,
          evidence:
            'Consumer-side `npm install --omit=dev` fetches runtime deps from registry.npmjs.org — separate trust boundary from the suite tarball downloaded earlier in install.sh.',
        },
      ];
    }
  }
  return [];
}

/**
 * Build a full app-map object. Reads any existing `_testatlas/12_app_map.json`
 * and preserves all non-integrations slices verbatim. The integrations slice
 * is rebuilt as `[ ...preserved-legacy-strings, ...detected-objects ]` where
 * legacy entries whose name overlaps with a detected one are dropped (the
 * structured detection is the source of truth for those).
 *
 * @param {{ rootDir?: string }} [opts]
 */
export async function buildAppMap({ rootDir = process.cwd() } = {}) {
  const existingPath = path.join(rootDir, '_testatlas', '12_app_map.json');
  /** @type {any} */
  let existing;
  try {
    existing = JSON.parse(await readFile(existingPath, 'utf8'));
  } catch {
    existing = {
      $schema: 'https://testatlas.dev/schemas/v1/app-map.schema.json',
      domains: [],
      routes: [],
      components: [],
      apis: [],
      cliCommands: [],
      jobs: [],
      integrations: [],
      entities: [],
      flows: [],
      tests: [],
      relationships: [],
    };
  }

  const detected = await detectIntegrations({ rootDir });
  const detectedNames = new Set(detected.map((d) => d.name));
  const preservedExisting = (existing.integrations ?? []).filter((it) => {
    const name = typeof it === 'string' ? it : it?.name;
    return !detectedNames.has(name);
  });

  existing.integrations = [...preservedExisting, ...detected];
  return existing;
}

// CLI entry — only run when invoked directly, never on `import`.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  /** @type {string | undefined} */
  let outPath;
  let rootDir = process.cwd();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outPath = argv[++i];
    else if (argv[i] === '--root') rootDir = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/explore-codebase.js [--root <dir>] [--out <path>|-]\n',
      );
      process.exit(0);
    } else {
      process.stderr.write(`explore-codebase: unknown argument: ${argv[i]}\n`);
      process.exit(2);
    }
  }
  outPath ??= path.join(rootDir, '_testatlas', '12_app_map.json');
  const appMap = await buildAppMap({ rootDir });
  const json = `${JSON.stringify(appMap, null, 2)}\n`;
  if (outPath === '-') {
    process.stdout.write(json);
  } else {
    await atomicWrite(outPath, json);
    process.stdout.write(`wrote ${path.relative(rootDir, outPath)}\n`);
  }
}
