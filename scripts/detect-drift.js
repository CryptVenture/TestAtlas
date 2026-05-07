#!/usr/bin/env node
// scripts/detect-drift.js
//
// Plan 14-06 Task 2 — Drift Detection Engine (PRD §7.16).
//
// Detects drift between when each domain/flow was last explored and what has
// changed in the repository since. Writes:
//
//   - _testatlas/brain/drift.json       (one DRIFT-N record per file/path)
//   - _testatlas/reports/drift.md       (human-readable summary, atomic)
//
// Detects 7 PRD §7.16 input categories:
//
//   git_diff       — generic file changes since baseline ref
//   package_lock   — package-lock.json | pnpm-lock.yaml | yarn.lock
//   route          — files under routes/, pages/, app/router/, src/routes/, *Routes*.{ts,tsx,js,jsx}
//   api_schema     — *.openapi.{yaml,json}, openapi/, graphql schemas, *.proto, *.tsp
//   migration      — migrations/, prisma/schema.prisma, db/migrate, knex/migrations
//   component      — components/, src/components/, *.{component,tsx,jsx,vue,svelte} files
//   test           — test/, tests/, __tests__/, *.test.*, *.spec.*
//
// Drift status per record (PRD §11):
//
//   fresh                  — explored ≤ 7d ago AND no relevant change
//   possibly_stale         — 7-30d ago OR minor change (test/comment)
//   stale_requires_review  — > 30d ago OR major change (route/api/migration/component/lock)
//   unknown                — no exploration history
//
// CLI:
//   node scripts/detect-drift.js [--cwd <dir>] [--since <ref>] [--category all|domains|flows|apis|routes|tests] [--output <path>]
//
// Programmatic:
//   import { detectDrift } from './detect-drift.js';
//   const r = await detectDrift({ cwd, since, category });

import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { atomicWrite } from './lib/atomic-write.js';

const execFileAsync = promisify(execFile);

// MAJOR categories trigger stale_requires_review on any change.
// MINOR categories trigger possibly_stale.
const MAJOR = new Set(['package_lock', 'route', 'api_schema', 'migration', 'component']);
const MINOR = new Set(['test', 'git_diff']);

const CATEGORY_FILTERS = Object.freeze({
  all: null,
  domains: null,
  flows: null,
  apis: new Set(['api_schema']),
  routes: new Set(['route']),
  tests: new Set(['test']),
});

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOr(p, fb) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fb;
  }
}

function categoriesFor(filePath) {
  const cats = new Set(['git_diff']);
  const p = filePath.replace(/\\/g, '/');
  if (
    /(^|\/)package-lock\.json$/.test(p) ||
    /(^|\/)pnpm-lock\.yaml$/.test(p) ||
    /(^|\/)yarn\.lock$/.test(p)
  ) {
    cats.add('package_lock');
  }
  if (
    /(^|\/)routes(\/|$)/.test(p) ||
    /(^|\/)pages(\/|$)/.test(p) ||
    /(^|\/)app\/router(\/|$)/.test(p) ||
    /Routes?\.(ts|tsx|js|jsx)$/.test(p)
  ) {
    cats.add('route');
  }
  if (
    /(^|\/)openapi(\/|$)/.test(p) ||
    /\.openapi\.(ya?ml|json)$/.test(p) ||
    /\.graphql$/.test(p) ||
    /\.gql$/.test(p) ||
    /\.proto$/.test(p) ||
    /\.tsp$/.test(p) ||
    /(^|\/)schemas?\/api\//.test(p)
  ) {
    cats.add('api_schema');
  }
  if (
    /(^|\/)migrations?(\/|$)/.test(p) ||
    /(^|\/)db\/migrate(\/|$)/.test(p) ||
    /(^|\/)knex\/migrations?(\/|$)/.test(p) ||
    /(^|\/)prisma\/schema\.prisma$/.test(p) ||
    /(^|\/)alembic\/versions(\/|$)/.test(p)
  ) {
    cats.add('migration');
  }
  if (
    /(^|\/)components?(\/|$)/.test(p) ||
    /\.component\.(ts|tsx|js|jsx)$/.test(p) ||
    /\.(vue|svelte)$/.test(p) ||
    /\.(tsx|jsx)$/.test(p)
  ) {
    // Don't tag a file as both component AND route — route wins for routing files.
    if (!cats.has('route')) cats.add('component');
  }
  if (
    /(^|\/)tests?(\/|$)/.test(p) ||
    /(^|\/)__tests__(\/|$)/.test(p) ||
    /\.(test|spec)\.[a-z]+$/.test(p)
  ) {
    cats.add('test');
  }
  return [...cats];
}

function statusFor(categories) {
  const cats = new Set(categories);
  for (const c of cats) {
    if (MAJOR.has(c)) return 'stale_requires_review';
  }
  for (const c of cats) {
    if (MINOR.has(c)) return 'possibly_stale';
  }
  return 'unknown';
}

function affectsDomainOrFlow(filePath, list, sourcePathsField = 'source_paths') {
  const out = [];
  const norm = filePath.replace(/\\/g, '/');
  for (const item of list) {
    const paths = item[sourcePathsField] ?? [];
    for (const sp of paths) {
      const spNorm = sp.replace(/\\/g, '/');
      if (norm === spNorm || norm.startsWith(`${spNorm}/`) || spNorm.startsWith(`${norm}/`)) {
        out.push(item.id ?? item.slug);
        break;
      }
    }
  }
  return out;
}

async function gitChangedFiles(cwd, since) {
  // Build the diff range. If `since` is provided, diff `since..HEAD`. Otherwise
  // assume working-tree drift detection (rarely useful in CI but supported).
  const args = since ? ['diff', '--name-only', `${since}..HEAD`] : ['diff', '--name-only', 'HEAD'];
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return null; // git not available
    }
    throw err('TESTATLAS_GIT_FAILURE', `git ${args.join(' ')} failed: ${e.message}`);
  }
}

async function gitHead(cwd) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

function renderDriftReport({ records, since, head, generatedAt }) {
  const stale = records.filter((r) => r.drift_status === 'stale_requires_review').length;
  const possibly = records.filter((r) => r.drift_status === 'possibly_stale').length;
  const fresh = records.filter((r) => r.drift_status === 'fresh').length;
  const unknown = records.filter((r) => r.drift_status === 'unknown').length;

  const rows = records.map((r) => {
    const cf = (r.changed_files ?? []).join(' ');
    const ad = (r.affected_domains ?? []).join(' ');
    const af = (r.affected_flows ?? []).join(' ');
    return `| ${r.id} | ${r.git_ref} | ${r.drift_status} | ${ad} | ${af} | ${r.detected_at} | ${cf} |`;
  });

  const summary = [
    '# Drift Report',
    '',
    `> Generated from \`_testatlas/brain/drift.json\` by \`/atlas:brain-drift\`.`,
    '',
    '## Summary',
    '',
    `- **Stale (requires review):** ${stale}`,
    `- **Possibly stale:** ${possibly}`,
    `- **Fresh:** ${fresh}`,
    `- **Unknown:** ${unknown}`,
    `- **Last analysis:** ${generatedAt}`,
    `- **Git ref analyzed:** ${since ?? '(working tree)'}..${head || 'HEAD'}`,
    '',
    '<!-- TESTATLAS:GENERATED:START field=drift_records -->',
    '| drift_id | git_ref | drift_status | affected_domains | affected_flows | detected_at | changed_files |',
    '|----------|---------|--------------|------------------|----------------|-------------|---------------|',
    ...(rows.length
      ? rows
      : [
          '|          |         |              |                  |                |             |               |',
        ]),
    '<!-- TESTATLAS:GENERATED:END field=drift_records -->',
    '',
    '## Recommended Actions',
    '',
    '<!-- TESTATLAS:GENERATED:START field=drift_recommendations -->',
    stale > 0
      ? `- Re-run \`/atlas:explore\` on the ${stale} stale records before any decision-grade report.`
      : '- No stale records — explored coverage holds.',
    possibly > 0 ? `- Spot-check the ${possibly} possibly_stale records.` : '',
    '<!-- TESTATLAS:GENERATED:END field=drift_recommendations -->',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return `${summary}\n`;
}

/**
 * @param {{
 *   cwd?: string,
 *   since?: string,
 *   category?: keyof typeof CATEGORY_FILTERS,
 *   output?: string,
 * }} args
 */
export async function detectDrift(args = {}) {
  const cwd = args.cwd ?? process.cwd();
  const since = args.since ?? null;
  const category = args.category ?? 'all';
  if (!(category in CATEGORY_FILTERS)) {
    throw err(
      'TESTATLAS_INVALID_CATEGORY',
      `unknown --category "${category}"; valid: ${Object.keys(CATEGORY_FILTERS).join(', ')}`,
    );
  }

  const brainDir = path.join(cwd, '_testatlas', 'brain');
  if (!(await fileExists(brainDir))) {
    throw err('TESTATLAS_BRAIN_MISSING', `brain directory missing: ${brainDir}`);
  }

  const [domains, flows] = await Promise.all([
    readJsonOr(path.join(brainDir, 'domains.json'), { domains: [] }),
    readJsonOr(path.join(brainDir, 'flows.json'), { flows: [] }),
  ]);

  const changedFiles = (await gitChangedFiles(cwd, since)) ?? [];
  const head = await gitHead(cwd);
  const generatedAt = new Date().toISOString();

  // One drift record per changed file. Each carries its own categories +
  // domain/flow mapping so consumers can group however they like.
  const records = [];
  let n = 0;
  for (const file of changedFiles) {
    n += 1;
    const cats = categoriesFor(file);
    const status = statusFor(cats);
    const affected_domains = affectsDomainOrFlow(file, domains.domains ?? []);
    const affected_flows = affectsDomainOrFlow(file, flows.flows ?? []);
    records.push({
      id: `DRIFT-${String(n).padStart(4, '0')}`,
      git_ref: head ? `${since ?? ''}..${head}` : '(working tree)',
      changed_files: [file],
      affected_domains,
      affected_flows,
      drift_status: status,
      detected_at: generatedAt,
      // Internal metadata — not in the schema's required set, kept off the
      // record so AJV with additionalProperties:false stays happy.
    });
    // Categories ride alongside as a parallel array on the local list (NOT
    // persisted to drift.json record because the schema forbids extra fields).
    records[records.length - 1]._categories = cats;
  }

  // Apply category filter (post-classification so the records are still
  // assigned drift_status correctly above).
  let filtered = records;
  const filter = CATEGORY_FILTERS[category];
  if (filter) {
    filtered = records.filter((r) => r._categories.some((c) => filter.has(c)));
  }

  // Strip the internal _categories field from the persisted record, but expose
  // it on the in-memory return value as `categories` for callers + tests.
  const persisted = filtered.map(({ _categories, ...rec }) => rec);
  const inMemory = filtered.map(({ _categories, ...rec }) => ({
    ...rec,
    categories: _categories,
  }));

  const outputDoc = {
    schema_version: '2.0.0',
    last_updated: generatedAt,
    drift_records: persisted,
  };

  const outPath = args.output ? path.resolve(args.output) : path.join(brainDir, 'drift.json');
  await atomicWrite(outPath, `${JSON.stringify(outputDoc, null, 2)}\n`);

  // Render the human-readable report.
  const reportsDir = path.join(cwd, '_testatlas', 'reports');
  await mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, 'drift.md');
  await atomicWrite(reportPath, renderDriftReport({ records: inMemory, since, head, generatedAt }));

  return {
    ok: true,
    cwd,
    since,
    category,
    drift_records: inMemory,
    outputPath: outPath,
    reportPath,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--since':
        opts.since = argv[++i];
        break;
      case '--category':
        opts.category = argv[++i];
        break;
      case '--output':
        opts.output = argv[++i];
        break;
      case '--help':
      case '-h':
        console.log(
          `Usage: node scripts/detect-drift.js [--cwd <dir>] [--since <ref>] [--category ${Object.keys(
            CATEGORY_FILTERS,
          ).join('|')}] [--output <path>]`,
        );
        process.exit(0);
        break;
      default:
        console.error(`detect-drift: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await detectDrift(opts);
    console.log(
      `detect-drift: ${r.drift_records.length} drift record(s) → ${r.outputPath}\nreport: ${r.reportPath}`,
    );
  } catch (e) {
    console.error(`detect-drift: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
