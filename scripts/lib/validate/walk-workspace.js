// scripts/lib/validate/walk-workspace.js
//
// Single-pass workspace enumeration for validate-workspace orchestrator.
// Plan 05-02 (Wave 1).
//
// Performs ONE readdir({recursive:true,withFileTypes:true}) call against the
// workspace root, parses every JSON file ONCE (capturing parseError on
// malformed JSON), reads every markdown file's text ONCE. Returns a
// categorized WorkspaceFiles structure that the orchestrator passes by
// reference into every check module — no per-check re-walk.
//
// Contract (locked, per 05-RESEARCH.md §"Pattern 5: Workspace Walker"):
//
//   walkWorkspace(wsDir) → {
//     canonicalFiles: Map<filename, {present: boolean, content?: string}>,  // 14 entries
//     issues: Array<{id, slug, jsonPath, mdPath, parsed, parseError}>,
//     flows: Array<{id, slug, jsonPath, mdPath, parsed, parseError}>,
//     domains: Array<{slug, jsonPath, parsed, parseError}>,
//     evidenceFiles: Array<{id, path, type, parsed, parseError}>,
//     testRuns: Array<{id, jsonPath, mdPath, parsed, parseError}>,
//     reports: Array<{id, mdPath, jsonPath, parsed, parseError}>,
//     indexes: Array<{path, slug, content}>,
//     allMarkdownFiles: Array<{path, content}>,
//     allJsonFiles: Array<{path, parsed, parseError}>,
//   }
//
// All `path` fields are absolute. Pattern matching follows the directory
// layout established in Phase 2 init-workspace.js + the schemas in
// .testatlas/schemas/.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// The 14 canonical files as shipped by Phase 2 init-workspace.js. Aligned
// with the on-disk reality (Phase 2 templates), NOT the speculative naming
// in some plan drafts.
const CANONICAL_FILENAMES = [
  '00_overview.md',
  '01_system_map.md',
  '02_test_strategy.md',
  '03_execution_status.md',
  '04_open_questions.md',
  '05_assumptions.md',
  '06_risks_and_gaps.md',
  '07_environment_and_access.md',
  '08_glossary.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '11_workspace_manifest.json',
  '12_app_map.json',
  '13_quality_scorecard.md',
];

/**
 * Walk the workspace once and return categorized file lists.
 *
 * @param {string} wsDir Absolute path to the workspace root (`_testatlas/`).
 * @returns {Promise<object>} WorkspaceFiles per the locked contract above.
 */
export async function walkWorkspace(wsDir) {
  // ONE readdir for the entire tree. Using {recursive:true,withFileTypes:true}
  // means a single syscall sequence; categorization is in-memory after.
  const entries = await readdir(wsDir, { recursive: true, withFileTypes: true });

  // Index every file by relative + absolute paths. We need both shapes during
  // categorization (e.g., "is this an `evidence/EVID-*/...` path?").
  /** @type {Array<{absPath: string, relPath: string, name: string, dir: string}>} */
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    // ent.parentPath is Node 20.12+; fall back to ent.path on 20.11 (deprecated alias).
    const parent = ent.parentPath ?? ent.path ?? wsDir;
    const absPath = path.join(parent, ent.name);
    const relPath = path.relative(wsDir, absPath);
    const dir = path.relative(wsDir, parent);
    files.push({ absPath, relPath, name: ent.name, dir });
  }

  // Read + parse pass. Every JSON file → parse once; every markdown → read once.
  /** @type {Map<string, {parsed: object | null, parseError: Error | null, abs: string}>} */
  const jsonByAbs = new Map();
  /** @type {Map<string, {content: string, abs: string}>} */
  const mdByAbs = new Map();

  for (const f of files) {
    if (f.name.endsWith('.json')) {
      let parsed = null;
      let parseError = null;
      try {
        const text = await readFile(f.absPath, 'utf8');
        parsed = JSON.parse(text);
      } catch (err) {
        parseError = err;
      }
      jsonByAbs.set(f.absPath, { parsed, parseError, abs: f.absPath });
    } else if (f.name.endsWith('.md')) {
      try {
        const content = await readFile(f.absPath, 'utf8');
        mdByAbs.set(f.absPath, { content, abs: f.absPath });
      } catch (_err) {
        // Tolerate read failures for binary or permission-denied entries —
        // they simply don't appear in the markdown set.
      }
    }
  }

  // ─── Categorize ───────────────────────────────────────────────────────────

  // Canonical files: top-level only.
  /** @type {Map<string, {present: boolean, content?: string}>} */
  const canonicalFiles = new Map();
  for (const name of CANONICAL_FILENAMES) {
    const abs = path.join(wsDir, name);
    const md = mdByAbs.get(abs);
    const j = jsonByAbs.get(abs);
    if (md) {
      canonicalFiles.set(name, { present: true, content: md.content });
    } else if (j && !j.parseError) {
      // JSON canonical files (manifest, app-map) — present implicitly.
      canonicalFiles.set(name, { present: true });
    } else if (j?.parseError) {
      // Present-but-corrupt counts as present here; check-schemas flags the parse error.
      canonicalFiles.set(name, { present: true });
    } else {
      canonicalFiles.set(name, { present: false });
    }
  }

  // Issues: to_fix/ISSUE-<id>-<slug>.{md,json} — pair them by basename.
  /** @type {Map<string, {jsonPath?: string, mdPath?: string, parsed?: object|null, parseError?: Error|null}>} */
  const issuesByBase = new Map();
  // Flows: flows/FLOW-<...>.{md,json}
  const flowsByBase = new Map();
  // Domains: domains/<slug>/domain.json
  /** @type {Array<{slug: string, jsonPath: string, parsed: object|null, parseError: Error|null}>} */
  const domains = [];
  // Evidence: evidence/<id>/<file>.* and evidence/<id>/evidence.json
  /** @type {Array<{id: string, path: string, type: string, parsed: object|null, parseError: Error|null}>} */
  const evidenceFiles = [];
  // Test runs: tests/runs/RUN-*.{md,json}
  const testRunsByBase = new Map();
  // Reports: reports/REPORT-*.{md,json}
  const reportsByBase = new Map();
  // Indexes: any markdown under to_fix/by_*/ or domains/<slug>/index.md or 09_artifact_index.md
  /** @type {Array<{path: string, slug: string, content: string}>} */
  const indexes = [];

  for (const f of files) {
    const segs = f.relPath.split(path.sep);
    const top = segs[0];
    const isJson = f.name.endsWith('.json');
    const isMd = f.name.endsWith('.md');
    const j = jsonByAbs.get(f.absPath);
    const md = mdByAbs.get(f.absPath);

    // to_fix/ISSUE-<id>-<slug>.{md,json}
    if (top === 'to_fix' && segs.length === 2 && /^ISSUE-/.test(f.name)) {
      const base = f.name.replace(/\.(md|json)$/, '');
      const cur = issuesByBase.get(base) ?? {};
      if (isJson) {
        cur.jsonPath = f.absPath;
        cur.parsed = j?.parsed ?? null;
        cur.parseError = j?.parseError ?? null;
      } else if (isMd) {
        cur.mdPath = f.absPath;
      }
      issuesByBase.set(base, cur);
      continue;
    }

    // to_fix/by_<facet>/<key>.md → indexes
    if (top === 'to_fix' && segs.length === 3 && /^by_/.test(segs[1]) && isMd && md) {
      indexes.push({
        path: f.absPath,
        slug: f.name.replace(/\.md$/, ''),
        content: md.content,
      });
      continue;
    }

    // flows/FLOW-*.{md,json}
    if (top === 'flows' && segs.length === 2 && /^FLOW-/.test(f.name)) {
      const base = f.name.replace(/\.(md|json)$/, '');
      const cur = flowsByBase.get(base) ?? {};
      if (isJson) {
        cur.jsonPath = f.absPath;
        cur.parsed = j?.parsed ?? null;
        cur.parseError = j?.parseError ?? null;
      } else if (isMd) {
        cur.mdPath = f.absPath;
      }
      flowsByBase.set(base, cur);
      continue;
    }

    // domains/<slug>/domain.json + domains/<slug>/index.md
    if (top === 'domains' && segs.length === 3 && f.name === 'domain.json') {
      domains.push({
        slug: segs[1],
        jsonPath: f.absPath,
        parsed: j?.parsed ?? null,
        parseError: j?.parseError ?? null,
      });
      continue;
    }
    if (top === 'domains' && segs.length === 3 && f.name === 'index.md' && md) {
      indexes.push({
        path: f.absPath,
        slug: segs[1],
        content: md.content,
      });
      continue;
    }

    // evidence/<id>/<file>.*
    if (top === 'evidence' && segs.length >= 3 && /^EVID-/.test(segs[1])) {
      // Skip evidence-bucket dirs like evidence/screenshots/ (no EVID-* prefix).
      const id = segs[1];
      if (f.name === 'evidence.json') {
        evidenceFiles.push({
          id,
          path: f.absPath,
          type: 'metadata',
          parsed: j?.parsed ?? null,
          parseError: j?.parseError ?? null,
        });
      } else {
        evidenceFiles.push({
          id,
          path: f.absPath,
          type: path.extname(f.name).slice(1) || 'unknown',
          parsed: null,
          parseError: null,
        });
      }
      continue;
    }

    // tests/runs/RUN-*.{md,json}
    if (top === 'tests' && segs[1] === 'runs' && segs.length === 3 && /^RUN-/.test(f.name)) {
      const base = f.name.replace(/\.(md|json)$/, '');
      const cur = testRunsByBase.get(base) ?? {};
      if (isJson) {
        cur.jsonPath = f.absPath;
        cur.parsed = j?.parsed ?? null;
        cur.parseError = j?.parseError ?? null;
      } else if (isMd) {
        cur.mdPath = f.absPath;
      }
      testRunsByBase.set(base, cur);
      continue;
    }

    // reports/REPORT-*.{md,json}
    if (top === 'reports' && segs.length === 2 && /^REPORT-/.test(f.name)) {
      const base = f.name.replace(/\.(md|json)$/, '');
      const cur = reportsByBase.get(base) ?? {};
      if (isJson) {
        cur.jsonPath = f.absPath;
        cur.parsed = j?.parsed ?? null;
        cur.parseError = j?.parseError ?? null;
      } else if (isMd) {
        cur.mdPath = f.absPath;
      }
      reportsByBase.set(base, cur);
      continue;
    }

    // 09_artifact_index.md (top-level) is also an index.
    if (segs.length === 1 && f.name === '09_artifact_index.md' && md) {
      indexes.push({
        path: f.absPath,
        slug: '09_artifact_index',
        content: md.content,
      });
    }
  }

  // Materialize paired records.
  const issues = [];
  for (const [base, rec] of issuesByBase) {
    const m = base.match(/^ISSUE-([0-9]+)-(.+)$/);
    issues.push({
      id: m ? `ISSUE-${m[1]}` : base,
      slug: m ? m[2] : base,
      jsonPath: rec.jsonPath ?? null,
      mdPath: rec.mdPath ?? null,
      parsed: rec.parsed ?? null,
      parseError: rec.parseError ?? null,
    });
  }
  const flows = [];
  for (const [base, rec] of flowsByBase) {
    const m = base.match(/^FLOW-(.+)$/);
    flows.push({
      id: m ? `FLOW-${m[1]}` : base,
      slug: m ? m[1] : base,
      jsonPath: rec.jsonPath ?? null,
      mdPath: rec.mdPath ?? null,
      parsed: rec.parsed ?? null,
      parseError: rec.parseError ?? null,
    });
  }
  const testRuns = [];
  for (const [base, rec] of testRunsByBase) {
    testRuns.push({
      id: base,
      jsonPath: rec.jsonPath ?? null,
      mdPath: rec.mdPath ?? null,
      parsed: rec.parsed ?? null,
      parseError: rec.parseError ?? null,
    });
  }
  const reports = [];
  for (const [base, rec] of reportsByBase) {
    reports.push({
      id: base,
      jsonPath: rec.jsonPath ?? null,
      mdPath: rec.mdPath ?? null,
      parsed: rec.parsed ?? null,
      parseError: rec.parseError ?? null,
    });
  }

  const allMarkdownFiles = [];
  for (const md of mdByAbs.values()) {
    allMarkdownFiles.push({ path: md.abs, content: md.content });
  }
  const allJsonFiles = [];
  for (const j of jsonByAbs.values()) {
    allJsonFiles.push({ path: j.abs, parsed: j.parsed, parseError: j.parseError });
  }

  return {
    canonicalFiles,
    issues,
    flows,
    domains,
    evidenceFiles,
    testRuns,
    reports,
    indexes,
    allMarkdownFiles,
    allJsonFiles,
  };
}

// Re-export the canonical-filenames list so check-canonical-files.js can
// import the single source of truth instead of redefining it.
export { CANONICAL_FILENAMES };

// Sanity stat helper used by check modules. Tiny but localized here so checks
// don't need to import node:fs/promises directly for one-off stat calls.
export async function fileExists(absPath) {
  return (await stat(absPath).catch(() => null)) !== null;
}
