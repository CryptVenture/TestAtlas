// scripts/explore-tests.js
//
// Tests-slice emitter for `/atlas:explore-tests`. Sibling of `explore-codebase.js`.
// Detects test runners + inventories test files mechanically so the
// `tests[]` slice of `_testatlas/12_app_map.json` is reproducibly rebuildable
// rather than hand-curated.
//
// This script implements the deterministic slice of the explore-tests workflow:
// runner detection + test inventory + categorization. The agent-driven workflow
// in `.testatlas/commands/explore/explore-tests.md` covers coverage parsing,
// flake detection, gap analysis, and council-readable signal aggregation —
// all of which require running the suite (sandbox-safe, capability-gated).
//
// The `--refresh` flag was the original use case cited by
// `council/council-release-readiness.md` round-6 (rebuttal/evidence-request
// step): re-run the inventory before voting so coverage signals are fresh.
//
// Public API:
//   - `detectRunners({ rootDir })` → array of `{name, configFile, configKey?, version?}`
//   - `inventoryTests({ rootDir })` → array of `{path, category, runner?}`
//   - `buildTestsSlice({ rootDir })` → `{runners, inventory, summary, refreshedAt}`
//
// CLI usage:
//   node scripts/explore-tests.js [--root <dir>] [--out <path>|-] [--refresh]
//
// Defaults:
//   --root  process.cwd()
//   --out   <root>/_testatlas/12_app_map.json   (when invoked without --out)
//
// `--out -` writes JSON to stdout (used by tests + manual previews).
// `--refresh` is accepted for caller-API stability with prior council references;
// behavior is identical to the default (always rebuilds from disk).
//
// Trust boundary note: pure read-only file inspection. No code is executed; no
// external services contacted. Safe to run from any clone.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';

const TEST_FILE_RE =
  /\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$|_test\.go$|_spec\.rb$|^test_.*\.py$|.*_test\.py$|^Test[A-Z].*\.java$|Test\.java$/;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  '.testatlas',
  '_testatlas',
]);

/** Categorize a test path by directory token. */
function categorize(relPath) {
  const lower = relPath.toLowerCase();
  if (/(^|\/)(e2e|end-to-end)(\/|$)/.test(lower)) return 'e2e';
  if (/(^|\/)contract(s)?(\/|$)/.test(lower)) return 'contract';
  if (/(^|\/)(performance|perf|bench(mark)?s?)(\/|$)/.test(lower)) return 'performance';
  if (/(^|\/)integration(\/|$)/.test(lower)) return 'integration';
  if (/(^|\/)smoke(\/|$)/.test(lower)) return 'smoke';
  return 'unit';
}

/** Map a test path to the most likely runner. Mechanical heuristic only. */
function inferRunner(relPath) {
  if (/_test\.go$/.test(relPath)) return 'go-test';
  if (/_spec\.rb$/.test(relPath)) return 'rspec';
  if (/(^|\/)(test_.*|.*_test)\.py$/.test(relPath)) return 'pytest';
  if (/Test[A-Z].*\.java$|Test\.java$/.test(relPath)) return 'junit';
  if (/\.spec\.(js|jsx|ts|tsx|mjs|cjs)$/.test(relPath)) return 'mocha-or-jasmine';
  if (/\.test\.(js|jsx|ts|tsx|mjs|cjs)$/.test(relPath)) return 'jest-or-vitest-or-node-test';
  return undefined;
}

/**
 * Detect configured test runners by reading manifest files. Pure parse — no
 * code execution. Order is alphabetical by runner name for stable output.
 *
 * @param {{ rootDir?: string }} [opts]
 * @returns {Promise<Array<{
 *   name: string,
 *   configFile: string,
 *   configKey?: string,
 *   version?: string,
 * }>>}
 */
export async function detectRunners({ rootDir = process.cwd() } = {}) {
  const out = [];
  await detectFromPackageJson(rootDir, out);
  await detectFromPyprojectToml(rootDir, out);
  await detectFromCargoToml(rootDir, out);
  await detectFromGemfile(rootDir, out);
  await detectFromGoMod(rootDir, out);
  // Stable sort by name then configFile for deterministic output.
  out.sort((a, b) => a.name.localeCompare(b.name) || a.configFile.localeCompare(b.configFile));
  return out;
}

async function detectFromPackageJson(rootDir, out) {
  const p = path.join(rootDir, 'package.json');
  let text;
  try {
    text = await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return;
  }
  const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
  const scripts = pkg.scripts ?? {};
  const known = [
    ['jest', /^jest$/],
    ['vitest', /^vitest$/],
    ['mocha', /^mocha$/],
    ['jasmine', /^jasmine(-core)?$/],
    ['playwright', /^@playwright\/test$/],
    ['cypress', /^cypress$/],
  ];
  for (const [runnerName, depRe] of known) {
    for (const [depName, version] of Object.entries(deps)) {
      if (depRe.test(depName)) {
        out.push({
          name: runnerName,
          configFile: 'package.json',
          configKey: `dependencies["${depName}"]`,
          version: typeof version === 'string' ? version : undefined,
        });
      }
    }
  }
  // node:test detection: `node --test` invocation in any test script.
  const usesNodeTest = Object.values(scripts).some(
    (s) => typeof s === 'string' && /\bnode\s+(?:--test\b|.*--test\b)/.test(s),
  );
  if (usesNodeTest) {
    out.push({
      name: 'node-test',
      configFile: 'package.json',
      configKey: 'scripts (node --test)',
    });
  }
}

async function detectFromPyprojectToml(rootDir, out) {
  const p = path.join(rootDir, 'pyproject.toml');
  let text;
  try {
    text = await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  if (/\[tool\.pytest\.ini_options\]/.test(text) || /pytest\b/.test(text)) {
    out.push({ name: 'pytest', configFile: 'pyproject.toml' });
  }
}

async function detectFromCargoToml(rootDir, out) {
  const p = path.join(rootDir, 'Cargo.toml');
  let text;
  try {
    text = await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  if (/\[dev-dependencies\]|\[\[test\]\]/.test(text)) {
    out.push({ name: 'cargo-test', configFile: 'Cargo.toml' });
  }
}

async function detectFromGemfile(rootDir, out) {
  const p = path.join(rootDir, 'Gemfile');
  let text;
  try {
    text = await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  if (/^\s*gem\s+["']rspec/m.test(text)) {
    out.push({ name: 'rspec', configFile: 'Gemfile' });
  }
}

async function detectFromGoMod(rootDir, out) {
  const p = path.join(rootDir, 'go.mod');
  try {
    await readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  // `go test` is built-in for any go module — no separate dep declaration.
  out.push({ name: 'go-test', configFile: 'go.mod' });
}

/**
 * Walk `rootDir` and inventory every test file. Skips `node_modules`, build
 * outputs, the suite + workspace dirs, and dotfile dirs. Output is sorted by
 * relative path for stable diffs.
 *
 * @param {{ rootDir?: string }} [opts]
 * @returns {Promise<Array<{ path: string, category: string, runner?: string }>>}
 */
export async function inventoryTests({ rootDir = process.cwd() } = {}) {
  const out = [];
  await walk(rootDir, '', out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

async function walk(rootDir, relDir, out) {
  const absDir = relDir ? path.join(rootDir, relDir) : rootDir;
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') return;
    throw err;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    const name = ent.name;
    if (name.startsWith('.') && name !== '.') continue;
    if (SKIP_DIRS.has(name)) continue;
    const childRel = relDir ? path.posix.join(relDir, name) : name;
    if (ent.isDirectory()) {
      await walk(rootDir, childRel, out);
      continue;
    }
    if (!ent.isFile()) continue;
    if (!TEST_FILE_RE.test(name)) continue;
    out.push({
      path: childRel,
      category: categorize(childRel),
      runner: inferRunner(childRel),
    });
  }
}

function summarize(inventory) {
  const byCategory = {};
  const byRunner = {};
  for (const t of inventory) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    if (t.runner) byRunner[t.runner] = (byRunner[t.runner] ?? 0) + 1;
  }
  return { total: inventory.length, byCategory, byRunner };
}

/**
 * Build the `tests[]` slice + summary for `_testatlas/12_app_map.json`. Reads
 * any existing app-map and preserves all non-tests slices verbatim.
 *
 * @param {{ rootDir?: string }} [opts]
 */
export async function buildTestsSlice({ rootDir = process.cwd() } = {}) {
  const runners = await detectRunners({ rootDir });
  const inventory = await inventoryTests({ rootDir });
  const summary = summarize(inventory);
  return {
    runners,
    inventory,
    summary,
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Merge the tests slice into `_testatlas/12_app_map.json`. The `tests[]` array
 * is replaced with one entry per inventoried file; `runners` + `summary` are
 * stored under `tests[].metadata` of the first synthetic header entry, mirroring
 * the explore-codebase pattern.
 *
 * @param {{ rootDir?: string }} [opts]
 */
export async function buildAppMap({ rootDir = process.cwd() } = {}) {
  const existingPath = path.join(rootDir, '_testatlas', '12_app_map.json');
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
  const slice = await buildTestsSlice({ rootDir });
  // Preserve existing string entries that no longer correspond to detected
  // tests; fresh detected entries take precedence.
  const detectedPaths = new Set(slice.inventory.map((t) => t.path));
  const preservedExisting = (existing.tests ?? []).filter((it) => {
    const p = typeof it === 'string' ? it : it?.path;
    return p != null && !detectedPaths.has(p);
  });
  existing.tests = [...preservedExisting, ...slice.inventory];
  existing.testsSummary = slice.summary;
  existing.testsRunners = slice.runners;
  existing.testsRefreshedAt = slice.refreshedAt;
  return existing;
}

// CLI entry — only run when invoked directly, never on `import`.
const invokedDirectly = isMainModule(import.meta.url);
if (invokedDirectly) {
  let outPath;
  let rootDir = process.cwd();
  let refreshOnly = false;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outPath = argv[++i];
    else if (argv[i] === '--root') rootDir = path.resolve(argv[++i]);
    else if (argv[i] === '--refresh') refreshOnly = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/explore-tests.js [--root <dir>] [--out <path>|-] [--refresh]\n',
      );
      process.exit(0);
    } else {
      process.stderr.write(`explore-tests: unknown argument: ${argv[i]}\n`);
      process.exit(2);
    }
  }
  if (refreshOnly && !outPath) {
    // --refresh without explicit --out emits the slice only (not the full
    // app-map) so council-release-readiness rebuttal flow gets a small,
    // focused JSON for inspection.
    const slice = await buildTestsSlice({ rootDir });
    process.stdout.write(`${JSON.stringify(slice, null, 2)}\n`);
    process.exit(0);
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
