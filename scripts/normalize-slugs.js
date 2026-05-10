// scripts/normalize-slugs.js
//
// Plan 05-03 (Wave 2; SCR-01). Detects mis-slugged artifact filenames per
// PRD §32 ID/slug conventions. Without --apply prints a rename plan; with
// --apply performs the renames AND updates index references in cross-cut
// indexes via markers.renderSection() so human prose outside markers is
// preserved.
//
// Scope: scans `<wsDir>/{to_fix,flows,domains,evidence,reports,tests/runs}/`
// for filenames whose slug component does not match KEBAB_RE. Each candidate
// is recomputed via `slugify()` and a rename plan entry is emitted.
//
// CLI:
//   node scripts/normalize-slugs.js [--workspace <p>] [--cwd <p>]
//                                   [--dry-run] [--apply] [--help]
//
// Default mode is read-only: prints the rename plan and exits 0. With
// --apply the script performs the renames + updates references. --dry-run
// is implied by the absence of --apply, but --dry-run can be combined with
// --apply for a "show what apply would do" flow.

import { readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { parseMarkers, renderSection } from './lib/markers.js';
import { requireCapability } from './lib/safety.js';
import { ID_PATTERNS, KEBAB_RE, slugify } from './lib/slug.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

// Subdirectories of <wsDir> that we scan. Each maps a logical artifact
// "type" to a directory and a filename-prefix regex. The regex's first
// capture group MUST isolate the slug portion (everything after the
// `<TYPE>-<id>-` prefix), and the second capture is the trailing
// `.{md,json}` (or empty for evidence dirs).
const SCAN_TARGETS = [
  // to_fix: ISSUE-<num>-<slug>.{md,json}
  { dir: 'to_fix', kind: 'file', re: /^(ISSUE-\d{3,})-(.+?)\.(md|json)$/ },
  // flows: FLOW-<domain>-<slug>.{md,json}  (the "slug" we normalize is the
  // entire suffix after `FLOW-`; PRD §32 allows any kebab-cased two-token tail)
  { dir: 'flows', kind: 'file', re: /^(FLOW)-(.+?)\.(md|json)$/ },
  // tests/runs: RUN-<...>.{md,json}
  { dir: 'tests/runs', kind: 'file', re: /^(RUN)-(.+?)\.(md|json)$/ },
  // reports: REPORT-<...>.{md,json}
  { dir: 'reports', kind: 'file', re: /^(REPORT)-(.+?)\.(md|json)$/ },
  // domains/<slug>/ — the directory itself (not a file)
  { dir: 'domains', kind: 'dir', re: /^(.+)$/ },
  // evidence/EVIDENCE-<num>(-<slug>)?/ — the directory itself
  { dir: 'evidence', kind: 'dir', re: /^(EVIDENCE-\d{3,})(?:-(.+))?$/ },
];

// Files inside <wsDir> that may contain references to artifact slugs and
// whose markers we update via renderSection. Each entry is a relative path.
const INDEX_FILES_TO_UPDATE = ['09_artifact_index.md'];
// Cross-cut indexes (under to_fix/by_*/) get scanned dynamically so we don't
// have to enumerate facets here.

/**
 * @param {string} dir
 * @returns {Promise<{name:string, isFile:boolean, isDir:boolean}[]>}
 */
async function safeReaddir(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isFile: e.isFile(), isDir: e.isDirectory() }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Build the rename plan by scanning the workspace.
 *
 * @param {string} wsDir
 * @returns {Promise<Array<{from:string, to:string, kind:string, slug:{old:string, new:string}}>>}
 */
async function buildRenamePlan(wsDir) {
  const plan = [];
  for (const target of SCAN_TARGETS) {
    const targetAbs = path.join(wsDir, target.dir);
    const entries = await safeReaddir(targetAbs);
    for (const e of entries) {
      // Match the structural shape (file vs dir).
      if (target.kind === 'file' && !e.isFile) continue;
      if (target.kind === 'dir' && !e.isDir) continue;

      const m = e.name.match(target.re);
      if (!m) continue;

      // Extract the slug portion. For ISSUE/FLOW/RUN/REPORT files the slug is
      // capture group 2 and the extension is group 3. For domain dirs it's
      // group 1 (the entire name). For EVIDENCE dirs it's group 2 (optional
      // descriptive suffix after the numeric id).
      let oldSlug;
      if (target.dir === 'domains') {
        oldSlug = m[1];
      } else if (target.dir === 'evidence') {
        oldSlug = m[2]; // may be undefined when no descriptor present
      } else {
        oldSlug = m[2];
      }

      // No slug to normalize (e.g., bare EVIDENCE-001) → skip.
      if (!oldSlug) continue;

      // Already kebab-clean → skip.
      if (KEBAB_RE.test(oldSlug)) continue;

      const newSlug = slugify(oldSlug);
      if (!newSlug || newSlug === oldSlug) continue;

      let newName;
      if (target.dir === 'domains') {
        newName = newSlug;
      } else if (target.dir === 'evidence') {
        newName = `${m[1]}-${newSlug}`;
      } else {
        // Files: <PREFIX>-<oldSlug>.<ext>
        newName = `${m[1]}-${newSlug}.${m[3]}`;
      }

      plan.push({
        from: path.join(targetAbs, e.name),
        to: path.join(targetAbs, newName),
        kind: target.kind,
        slug: { old: oldSlug, new: newSlug },
      });
    }
  }
  return plan;
}

/**
 * Update marker-section bodies in index files so old-slug references become
 * new-slug. Only content INSIDE generated markers is touched; human prose
 * outside markers is byte-preserved.
 *
 * @param {string} wsDir
 * @param {Array<{slug:{old:string, new:string}}>} plan
 * @param {{readFile?: typeof readFile, atomicWrite?: typeof atomicWrite}} ctx
 * @returns {Promise<string[]>} list of relative paths whose contents changed
 */
async function applyIndexUpdates(wsDir, plan, ctx) {
  const _readFile = ctx.readFile ?? readFile;
  const _atomicWrite = ctx.atomicWrite ?? atomicWrite;
  const changed = [];

  // Build the candidate index file list: explicit ones + any to_fix/by_*/*.md.
  const candidates = [];
  for (const rel of INDEX_FILES_TO_UPDATE) {
    candidates.push(path.join(wsDir, rel));
  }
  const byDir = path.join(wsDir, 'to_fix');
  for (const e of await safeReaddir(byDir)) {
    if (!e.isDir || !e.name.startsWith('by_')) continue;
    const facetDir = path.join(byDir, e.name);
    for (const f of await safeReaddir(facetDir)) {
      if (f.isFile && f.name.endsWith('.md')) {
        candidates.push(path.join(facetDir, f.name));
      }
    }
  }

  for (const filePath of candidates) {
    let text;
    try {
      text = await _readFile(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }

    // Rewrite ALL occurrences of old-slug → new-slug. We do this naively
    // across the whole file (NOT just inside markers) for non-marker files
    // (cross-cut indexes are mostly bullet lists with no human prose to
    // protect). For 09_artifact_index.md we walk through each marker
    // section and renderSection() its body — that preserves prose outside.
    const { sections, errors } = parseMarkers(text);

    if (errors.length === 0 && sections.size > 0) {
      // Marker-aware path: rewrite only inside marker sections.
      let next = text;
      let touched = false;
      for (const [slug] of sections) {
        const sec = sections.get(slug);
        let body = sec.contentLines.join('\n');
        let bodyChanged = false;
        for (const entry of plan) {
          const before = body;
          body = body.split(entry.slug.old).join(entry.slug.new);
          if (body !== before) bodyChanged = true;
        }
        if (bodyChanged) {
          next = renderSection(next, slug, body);
          touched = true;
        }
      }
      if (touched) {
        await _atomicWrite(filePath, next);
        changed.push(filePath);
      }
    } else {
      // No markers (or marker errors) — fall back to whole-file substitution
      // for cross-cut indexes (just bullet lists). For files with marker
      // errors we DO NOT rewrite (consistent with markers.renderSection's
      // refusal-to-write contract).
      if (errors.length > 0) continue;
      let next = text;
      for (const entry of plan) {
        next = next.split(entry.slug.old).join(entry.slug.new);
      }
      if (next !== text) {
        await _atomicWrite(filePath, next);
        changed.push(filePath);
      }
    }
  }
  return changed;
}

/**
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 *   apply?: boolean,
 * }} args
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate,
 *   atomicWrite?: typeof atomicWrite,
 *   rename?: typeof rename,
 *   readFile?: typeof readFile,
 * }} _inject @internal — test-only DI.
 * @returns {Promise<{
 *   wsDir: string,
 *   renamePlan: Array<{from:string, to:string, kind:string, slug:{old:string, new:string}}>,
 *   applied: boolean,
 *   indexUpdates: string[],
 *   dryRun: boolean,
 * }>}
 */
export async function normalizeSlugs(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _rename = _inject.rename ?? rename;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;
  const apply = args.apply ?? false;

  const renamePlan = await buildRenamePlan(wsDir);

  const indexUpdates = [];
  let applied = false;

  if (apply && !dryRun) {
    // Phase 19-02 (B1): destructive-fs gate. The apply branch performs
    // rename(...) on user-workspace artifacts under
    // _testatlas/{to_fix,flows,domains,evidence,reports,tests/runs}/.
    // Mirror the v2-migrate.js Phase 18 pattern (ISSUE-010).
    requireCapability(config, 'destructive-fs');
    // Execute renames first.
    for (const entry of renamePlan) {
      await _rename(entry.from, entry.to);
    }
    applied = renamePlan.length > 0;
    // Then update index references.
    if (renamePlan.length > 0) {
      const changed = await applyIndexUpdates(wsDir, renamePlan, {
        readFile: _inject.readFile,
        atomicWrite: _inject.atomicWrite,
      });
      indexUpdates.push(...changed);
    }
  }

  return { wsDir, renamePlan, applied, indexUpdates, dryRun };
}

// Suppress unused-var lint for ID_PATTERNS — kept available for future
// expansion (e.g., parsing legacy ID forms).
void ID_PATTERNS;

if (isMainModule(import.meta.url)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') opts.workspaceDir = argv[++i];
    else if (a === '--cwd') opts.cwd = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/normalize-slugs.js [--workspace <p>] [--cwd <p>] [--dry-run] [--apply]',
      );
      process.exit(0);
    } else {
      console.error(`normalize-slugs: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await normalizeSlugs(opts);
    if (r.renamePlan.length === 0) {
      console.log('normalize-slugs: no mis-slugged filenames detected.');
    } else {
      console.log(
        `normalize-slugs: ${r.applied ? 'renamed' : 'would rename'} ${r.renamePlan.length} entries:`,
      );
      for (const entry of r.renamePlan) {
        console.log(
          `  ${path.relative(r.wsDir, entry.from)} → ${path.relative(r.wsDir, entry.to)}`,
        );
      }
      if (r.applied) {
        console.log(`  index updates: ${r.indexUpdates.length} file(s) rewritten`);
      } else {
        console.log('  (run with --apply to perform renames and update index references)');
      }
    }
  } catch (e) {
    console.error(`normalize-slugs: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
