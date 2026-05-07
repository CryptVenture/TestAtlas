#!/usr/bin/env node
// scripts/update-coverage.js
//
// Plan 14-03 Task 3 — Coverage ledger updater.
//
// Reads the 8 V2 map JSON files under `_testatlas/maps/` and computes
// per-category coverage into `_testatlas/brain/coverage.json` (validates
// against `coverage.schema.json`).
//
// Categories tracked: routes, components, endpoints, commands (CLI),
// jobs, integrations.
//
// CLI:
//   node scripts/update-coverage.js [--cwd <dir>] [--maps-dir <dir>]
//                                   [--brain-dir <dir>] [--output <path>]
//                                   [--category routes|components|endpoints|
//                                              commands|jobs|integrations|all]
//
// Programmatic:
//   import { updateCoverage } from './update-coverage.js';
//   const r = await updateCoverage({ cwd, brainDir, mapsDir, category });
//
// Returns: { ok, summary: { <category>: { total, covered, percent } } }

import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { atomicWrite } from './lib/atomic-write.js';
import { now } from './lib/determinism.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const COVERAGE_SCHEMA_ID = 'https://testatlas.dev/schemas/v2/coverage.schema.json';

// Map category name -> { mapFile, arrayKey, idField }
const MAP_CATEGORIES = {
  routes: { mapFile: 'routes.json', arrayKey: 'routes', idField: 'path' },
  components: { mapFile: 'components.json', arrayKey: 'components', idField: 'name' },
  endpoints: {
    mapFile: 'endpoints.json',
    arrayKey: 'endpoints',
    idField: (item) => `${item.method || 'GET'} ${item.path}`,
  },
  commands: { mapFile: 'cli_commands.json', arrayKey: 'cli_commands', idField: 'command' },
  jobs: { mapFile: 'jobs.json', arrayKey: 'jobs', idField: 'name' },
  integrations: { mapFile: 'integrations.json', arrayKey: 'integrations', idField: 'service' },
};

const ALL_CATEGORIES = Object.keys(MAP_CATEGORIES);

async function _fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOr(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function isCovered(item) {
  const tc = item.test_coverage;
  if (!tc) return false;
  if (typeof tc.percent === 'number' && tc.percent > 0) return true;
  if (Array.isArray(tc.tests) && tc.tests.length > 0) return true;
  return false;
}

function entryFromItem(category, item) {
  const meta = MAP_CATEGORIES[category];
  const id =
    typeof meta.idField === 'function' ? meta.idField(item) : String(item[meta.idField] ?? '');
  const tested = isCovered(item);
  const entry = { id, tested };
  const tc = item.test_coverage || {};
  if (Array.isArray(tc.tests) && tc.tests.length > 0) entry.test_ids = [...tc.tests];
  if (Array.isArray(item.evidence) && item.evidence.length > 0) {
    entry.evidence = [...item.evidence];
  }
  if (item.last_tested) entry.last_tested = item.last_tested;
  return entry;
}

async function readCategoryItems(mapsDir, category) {
  const meta = MAP_CATEGORIES[category];
  const file = path.join(mapsDir, meta.mapFile);
  const data = await readJsonOr(file, null);
  if (!data) return [];
  return Array.isArray(data[meta.arrayKey]) ? data[meta.arrayKey] : [];
}

function summarize(entries) {
  const total = entries.length;
  const covered = entries.filter((e) => e.tested).length;
  const percent = total === 0 ? 0 : Math.round((covered / total) * 100);
  return { total, covered, percent };
}

/**
 * @param {{cwd?: string, brainDir?: string, mapsDir?: string, category?: string}} [opts]
 */
export async function updateCoverage(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const wsDir = path.join(cwd, '_testatlas');
  const brainDir = opts.brainDir || path.join(wsDir, 'brain');
  const mapsDir = opts.mapsDir || path.join(wsDir, 'maps');
  const category = opts.category || 'all';
  if (category !== 'all' && !MAP_CATEGORIES[category]) {
    throw new Error(`update-coverage: unknown category "${category}"`);
  }

  await mkdir(brainDir, { recursive: true });
  const outFile = path.join(brainDir, 'coverage.json');

  // Load existing coverage.json (preserve untouched categories) or seed.
  let coverage = await readJsonOr(outFile, null);
  if (!coverage || coverage.schema_version !== '2.0.0') {
    coverage = {
      schema_version: '2.0.0',
      last_updated: now(),
      coverage: { routes: [], components: [], endpoints: [], commands: [] },
    };
  }
  // Ensure all required keys are present (schema requires the four).
  for (const required of ['routes', 'components', 'endpoints', 'commands']) {
    if (!Array.isArray(coverage.coverage[required])) coverage.coverage[required] = [];
  }

  const targets = category === 'all' ? ALL_CATEGORIES : [category];
  const summary = {};

  for (const cat of targets) {
    const items = await readCategoryItems(mapsDir, cat);
    const entries = items.map((it) => entryFromItem(cat, it));
    coverage.coverage[cat] = entries;
    summary[cat] = summarize(entries);
  }

  // Categories not touched in this run still need a summary for consumers.
  if (category === 'all') {
    // already covered; summary keys = ALL_CATEGORIES.
  } else {
    // For untouched categories, fill summary from existing coverage entries.
    for (const cat of ALL_CATEGORIES) {
      if (cat === category) continue;
      const existing = Array.isArray(coverage.coverage[cat]) ? coverage.coverage[cat] : [];
      summary[cat] = summarize(existing);
    }
  }

  coverage.last_updated = now();

  // Validate before writing.
  let validate;
  try {
    const ajv = await loadAllSchemas({ cwd });
    validate = ajv.getSchema(COVERAGE_SCHEMA_ID);
  } catch (_err) {
    // If schemas can't be loaded (e.g. tmp test cwd without .testatlas),
    // fall back to writing without validation. The test harness loads the
    // suite-cwd schemas explicitly to verify.
    validate = null;
  }
  if (validate && !validate(coverage)) {
    const msg = (validate.errors || [])
      .map((e) => `${e.instancePath || '/'} ${e.message}`)
      .join('; ');
    const e = new Error(`update-coverage: schema violation: ${msg}`);
    e.code = 'TESTATLAS_COVERAGE_SCHEMA_VIOLATION';
    e.errors = validate.errors;
    throw e;
  }

  const json = `${JSON.stringify(coverage, null, 2)}\n`;
  await atomicWrite(outFile, json);

  return { ok: true, outFile, summary };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') out.cwd = argv[++i];
    else if (a === '--brain-dir') out.brainDir = argv[++i];
    else if (a === '--maps-dir') out.mapsDir = argv[++i];
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--category') out.category = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const HELP = `
Usage: node scripts/update-coverage.js [options]

Computes coverage from _testatlas/maps/*.json into _testatlas/brain/coverage.json.

Options:
  --cwd <dir>           Workspace root (defaults to process.cwd()).
  --maps-dir <dir>      Override maps directory.
  --brain-dir <dir>     Override brain directory.
  --category <name>     Update one category only: routes | components |
                        endpoints | commands | jobs | integrations | all
                        (default: all).
  --output <path>       Override output path (default: <brain-dir>/coverage.json).
  -h, --help            Show this help.
`;

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  updateCoverage(args)
    .then((r) => {
      console.log(`update-coverage: wrote ${r.outFile}`);
      for (const [cat, s] of Object.entries(r.summary)) {
        console.log(`  ${cat}: ${s.covered}/${s.total} (${s.percent}%)`);
      }
    })
    .catch((err) => {
      console.error(`update-coverage: ${err.message}`);
      process.exit(1);
    });
}
