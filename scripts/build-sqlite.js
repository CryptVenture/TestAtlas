#!/usr/bin/env node
// scripts/build-sqlite.js
//
// Plan 14-08 Task 2 — Optional SQLite Brain Builder (PRD §7.20).
//
// Reads the brain JSON tree at `_testatlas/brain/` and projects it into a
// derived SQLite database at `_testatlas/brain/testatlas.sqlite`. The
// database is OPTIONAL and CACHEABLE — JSON remains the canonical source of
// truth. Re-running with `--rebuild` drops and recreates the database.
//
// Schema (15 tables — PRD §7.20):
//   domains, flows, issues, evidence, personas, council_sessions,
//   transcript_messages, claims, decisions, risks, assumptions, routes,
//   components, endpoints, events
//
// Every table mirrors a single brain JSON index; no data is invented. If a
// brain JSON is missing the corresponding table is created empty.
//
// Optional dependency: `better-sqlite3`. The script gracefully degrades when
// the dep is absent — emits a clear capability-degradation message and
// exits 0 (success, no-op) instead of crashing. This keeps `pnpm test` and
// `npm install` lightweight for the 95%+ of users who do not need SQLite.
//
// CLI:
//   node scripts/build-sqlite.js [--cwd <dir>] [--output <path>] [--rebuild]
//
// Programmatic:
//   import { buildSqlite } from './build-sqlite.js';
//   const r = await buildSqlite({ cwd, output, rebuild });
//
// Returns:
//   { ok: true,  db: <path>, tables_built: 15, rows_total: <n> }
//   { ok: false, reason: 'OPTIONAL_DEPENDENCY_MISSING', missing: 'better-sqlite3' }

import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isMainModule } from './lib/is-main.js';

const TABLES = Object.freeze([
  'domains',
  'flows',
  'issues',
  'evidence',
  'personas',
  'council_sessions',
  'transcript_messages',
  'claims',
  'decisions',
  'risks',
  'assumptions',
  'routes',
  'components',
  'endpoints',
  'events',
]);

const TABLE_SOURCES = Object.freeze({
  domains: { file: 'domains.json', key: 'domains' },
  flows: { file: 'flows.json', key: 'flows' },
  issues: { file: 'issues.json', key: 'issues' },
  evidence: { file: 'evidence.json', key: 'evidence' },
  personas: { file: 'personas.json', key: 'personas' },
  council_sessions: { file: 'agent_sessions.json', key: 'sessions' },
  claims: { file: 'claims.jsonl', jsonl: true },
  decisions: { file: 'decisions.json', key: 'decisions' },
  risks: { file: 'risks.json', key: 'risks' },
  assumptions: { file: 'assumptions.json', key: 'assumptions' },
  routes: { file: 'routes.json', key: 'routes' },
  components: { file: 'components.json', key: 'components' },
  endpoints: { file: 'api-endpoints.json', key: 'endpoints' },
  events: { file: 'events.jsonl', jsonl: true },
  transcript_messages: { file: 'transcripts.jsonl', jsonl: true },
});

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function readJsonOr(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' || e instanceof SyntaxError) return fallback;
    throw e;
  }
}

async function readJsonlOr(filePath, fallback) {
  try {
    const text = await readFile(filePath, 'utf8');
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Skip malformed lines — JSONL append errors should not block the
        // rest of the projection.
      }
    }
    return out;
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

/**
 * Try to load `better-sqlite3`. Returns `null` if unavailable. Designed so
 * the script can degrade gracefully on workspaces that have not installed
 * the optional dep.
 *
 * @returns {Promise<null | typeof import('better-sqlite3')>}
 */
async function loadSqlite() {
  let Sqlite;
  try {
    const mod = await import('better-sqlite3');
    Sqlite = mod.default || mod;
  } catch {
    return null;
  }
  // better-sqlite3 is a native module — `import()` succeeds whenever the JS
  // wrapper resolves, but instantiation can still fail later when the
  // platform-specific binding (.node) wasn't built / wasn't shipped /
  // doesn't match the current Node ABI. The build-sqlite contract treats
  // that case identically to "module absent": the consumer asked for an
  // OPTIONAL projector, so we degrade gracefully rather than crashing.
  // Probe by trying to instantiate an in-memory DB; if that throws, surface
  // a missing-dependency result.
  try {
    const probe = new Sqlite(':memory:');
    probe.close();
    return Sqlite;
  } catch {
    return null;
  }
}

function createSchema(db) {
  // Each table is a thin mirror of the brain JSON: id (TEXT PRIMARY KEY) +
  // a JSON blob carrying the full record. Specialized columns (severity,
  // status, etc.) are NOT extracted — callers query the JSON via SQLite's
  // built-in `json_extract`. This keeps the schema tiny (one table shape
  // for all 15 tables) and impervious to brain schema evolution.
  for (const t of TABLES) {
    db.prepare(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, body TEXT NOT NULL)`).run();
  }
}

function rowsForTable(records) {
  // Records may be objects with `id` or raw strings; coerce to id+body pairs.
  const rows = [];
  let unknownIdx = 0;
  for (const rec of records) {
    if (rec == null) continue;
    let id;
    if (typeof rec === 'object' && typeof rec.id === 'string') id = rec.id;
    else id = `_anon-${unknownIdx++}`;
    rows.push({ id, body: JSON.stringify(rec) });
  }
  return rows;
}

/**
 * Build (or rebuild) the SQLite brain at `output`.
 *
 * @param {object} opts
 * @param {string} [opts.cwd]
 * @param {string} [opts.output]
 * @param {boolean} [opts.rebuild] - drop and recreate the file before writing.
 * @returns {Promise<object>}
 */
export async function buildSqlite({ cwd = process.cwd(), output, rebuild = false } = {}) {
  const Sqlite = await loadSqlite();
  if (!Sqlite) {
    const reason =
      "Optional dependency 'better-sqlite3' is not installed. " +
      'SQLite brain projection is OPTIONAL — JSON remains canonical. ' +
      'To enable: `pnpm add -D better-sqlite3` (or `npm i -D better-sqlite3`).';
    console.warn(`build-sqlite: ${reason}`);
    return {
      ok: false,
      reason: 'OPTIONAL_DEPENDENCY_MISSING',
      missing: 'better-sqlite3',
      note: reason,
    };
  }

  const brainDir = path.join(cwd, '_testatlas', 'brain');
  const dest = output || path.join(brainDir, 'testatlas.sqlite');
  await mkdir(path.dirname(dest), { recursive: true });

  if (rebuild) {
    // Capability tag: assertCapability(_, 'destructive-fs'). The caller
    // explicitly opted into --rebuild which is the consent gate for
    // dropping the prior .sqlite file. We tolerate ENOENT so a fresh
    // workspace (no prior file) is a successful no-op. SQLite is OPTIONAL
    // / cacheable per PRD §7.20 — JSON remains canonical, so unlinking
    // the derived file is safe.
    await unlink(dest).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }

  const db = new Sqlite(dest);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    createSchema(db);

    let rowsTotal = 0;
    for (const table of TABLES) {
      const src = TABLE_SOURCES[table];
      let records = [];
      if (src) {
        const filePath = path.join(brainDir, src.file);
        if (src.jsonl) {
          records = await readJsonlOr(filePath, []);
        } else {
          const doc = await readJsonOr(filePath, null);
          records = doc && Array.isArray(doc[src.key]) ? doc[src.key] : [];
        }
      }
      const rows = rowsForTable(records);

      // Idempotent: clear table before insert (re-runs without --rebuild
      // still produce a fresh projection).
      db.prepare(`DELETE FROM ${table}`).run();
      const stmt = db.prepare(`INSERT INTO ${table} (id, body) VALUES (?, ?)`);
      const insertMany = db.transaction((items) => {
        for (const r of items) stmt.run(r.id, r.body);
      });
      insertMany(rows);
      rowsTotal += rows.length;
    }

    return {
      ok: true,
      db: dest,
      tables_built: TABLES.length,
      rows_total: rowsTotal,
    };
  } finally {
    db.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = { cwd: process.cwd(), rebuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') opts.cwd = argv[++i];
    else if (a === '--output') opts.output = argv[++i];
    else if (a === '--rebuild') opts.rebuild = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: build-sqlite.js [--cwd <dir>] [--output <path>] [--rebuild]');
      return 0;
    } else if (a.startsWith('--')) {
      throw err('BAD_FLAG', `unknown flag: ${a}`);
    }
  }
  const r = await buildSqlite(opts);
  if (r.ok) {
    console.log(`Wrote ${r.db} (${r.tables_built} tables, ${r.rows_total} rows)`);
    return 0;
  }
  // Optional-dep absent is a SUCCESS (graceful degrade) — exit 0 with a
  // non-zero `reason` field on the structured return for programmatic
  // callers, and a plain warning for humans.
  return 0;
}

const isCLI = isMainModule(import.meta.url);
if (isCLI) {
  main().catch((e) => {
    console.error(`build-sqlite: ${e.code || 'ERROR'}: ${e.message}`);
    process.exit(1);
  });
}
