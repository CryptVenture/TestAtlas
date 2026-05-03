// scripts/lib/validate/autoheal.js
//
// Plan 05-04: SCR-04 — `validate-workspace --auto-heal` body.
//
// HEAL-XX safety contract (verbatim from 05-RESEARCH.md §"Pattern 4 Auto-heal
// Safety Contract"):
//
//   HEAL-01  Restore manifest counts
//            ← TESTATLAS_COUNT_MISMATCH (fixable='auto')
//   HEAL-02  Regenerate 09_artifact_index.md
//            ← TESTATLAS_MISSING_INDEX or TESTATLAS_INDEX_MISMATCH for that path
//   HEAL-03  Regenerate cross-cut and per-domain indexes
//            ← TESTATLAS_INDEX_MISMATCH or TESTATLAS_MISSING_INDEX (cross-cut)
//   HEAL-04  Refresh stale generated-section hash (whitespace-only diffs only)
//            ← TESTATLAS_STALE_GENERATED_HASH (fixable='auto')
//
// CANONICAL NEVER-heal list (refused with `skipped` entries):
//   TESTATLAS_MISSING_CANONICAL          — manual restoration required
//   TESTATLAS_SCHEMA_VIOLATION           — could be in-progress edits
//   TESTATLAS_JSON_PARSE_ERROR           — user fixes manually
//   TESTATLAS_MODIFIED_GENERATED_CONTENT — non-whitespace edit; preserve user work
//   TESTATLAS_ORPHANED_EVIDENCE          — may be a draft; user reviews
//   TESTATLAS_MISSING_EVIDENCE_REF       — heuristic rename unsafe
//   TESTATLAS_BROKEN_LINK                — target may be intentional draft
//   TESTATLAS_DUPLICATE_ID               — cannot decide which is the original
//
// Apply gate semantics:
//   apply=false (default)             → preview only; zero writes; `applied`
//                                       still lists would-be heals so the
//                                       reporter can show what `--apply` would do.
//   apply=true && dryRun=false        → execute writes via atomicWrite/renderSection.
//   dryRun=true (any apply value)     → dry-run wins; zero writes.
//
// Every applied write goes through atomicWrite() (Pitfall 4) and through
// markers.renderSection() if the write touches a marker-bounded region
// (Pitfall 5: human prose outside markers preserved byte-for-byte).
//
// HEAL-02 / HEAL-03 are filled by Task 2; this file initially ships HEAL-01
// + HEAL-04 + the dispatch + the NEVER-heal classifier.

import path from 'node:path';
import { atomicWrite } from '../atomic-write.js';
import { hashContent } from '../content-hash.js';
import { parseMarkers } from '../markers.js';

// ─── NEVER-heal canonical list ────────────────────────────────────────────────
//
// Maps finding.code → human-readable refusal reason. Any finding whose code
// appears here is added to the `skipped` list with the reason — independent
// of whether `fixable === 'auto'` (defense in depth: even if a future check
// mistakenly classifies one of these codes as fixable, autoheal still refuses).

const NEVER_HEAL_REASONS = Object.freeze({
  TESTATLAS_MISSING_CANONICAL:
    'NEVER-heal: missing canonical files require manual restoration (re-run /atlas:init or git checkout)',
  TESTATLAS_SCHEMA_VIOLATION:
    'NEVER-heal: schema-invalid artifacts require manual fix (data loss possible if defaulted)',
  TESTATLAS_JSON_PARSE_ERROR:
    'NEVER-heal: JSON parse error; user fixes manually (autoheal cannot infer intended content)',
  TESTATLAS_UNKNOWN_SCHEMA:
    'NEVER-heal: artifact lacks a recognizable schema; user clarifies type manually',
  TESTATLAS_MODIFIED_GENERATED_CONTENT:
    'NEVER-heal: non-whitespace edit inside markers; user must review (Pitfall 2)',
  TESTATLAS_ORPHANED_EVIDENCE: 'NEVER-heal: evidence file may be a draft; user reviews',
  TESTATLAS_MISSING_EVIDENCE_REF:
    'NEVER-heal: missing evidence ref; heuristic rename unsafe (use --apply-suggestions, NOT covered by --auto-heal)',
  TESTATLAS_BROKEN_LINK: 'NEVER-heal: broken link target may be intentional draft',
  TESTATLAS_DUPLICATE_ID: 'NEVER-heal: cannot decide which artifact is the original',
  TESTATLAS_MARKER_INVALID:
    'NEVER-heal: marker-structure errors require manual fix; refusing to overwrite a corrupt marker layout',
});

// ─── HEAL-01: Restore manifest counts ────────────────────────────────────────

/**
 * Recompute manifest.counts from ctx.files and atomicWrite the manifest.
 * @param {object} ctx
 * @param {object} finding
 * @param {{apply: boolean, dryRun: boolean}} mode
 * @returns {Promise<{healId: 'HEAL-01', path: string, summary: string}>}
 */
async function applyHeal01(ctx, _finding, { apply, dryRun }) {
  const { files, manifest, wsDir } = ctx;

  const evidIds = new Set((files.evidenceFiles ?? []).map((e) => e.id).filter(Boolean));
  const actual = {
    domains: (files.domains ?? []).length,
    flows: (files.flows ?? []).length,
    issues: (files.issues ?? []).length,
    evidenceRecords: evidIds.size,
    testRuns: (files.testRuns ?? []).length,
  };

  const oldCounts = manifest?.counts ?? {};
  const diffParts = [];
  for (const k of Object.keys(actual)) {
    if (oldCounts[k] !== actual[k]) {
      diffParts.push(`${k}: ${oldCounts[k]}→${actual[k]}`);
    }
  }
  const summary =
    diffParts.length > 0 ? `counts updated: ${diffParts.join(', ')}` : 'counts already in sync';

  if (apply && !dryRun) {
    const updated = {
      ...manifest,
      counts: { ...(manifest?.counts ?? {}), ...actual },
      lastUpdatedAt: new Date().toISOString(),
    };
    const text = `${JSON.stringify(updated, null, 2)}\n`;
    await atomicWrite(path.join(wsDir, '11_workspace_manifest.json'), text);
    // Mutate the in-memory ctx.manifest so subsequent heals (HEAL-04) see the
    // refreshed counts and don't redundantly call atomicWrite for the same
    // manifest. (Re-walks for the full re-run of CHECKS happen in the
    // orchestrator, not here.)
    ctx.manifest = updated;
  }

  return {
    healId: 'HEAL-01',
    path: '11_workspace_manifest.json',
    summary,
  };
}

// ─── HEAL-04: Refresh stale generated-section hash (whitespace-only) ─────────

/**
 * Recompute hashContent(body) for the section identified by `finding.path` +
 * the section slug derivable from finding.message and write it into
 * manifest.generatedSections[file][section].
 *
 * Trigger condition (enforced by the dispatcher): finding.code ===
 * 'TESTATLAS_STALE_GENERATED_HASH' AND finding.fixable === 'auto'. The check
 * (check-stale-generated-sections) only sets fixable='auto' when the
 * whitespace-canonicalized body re-hashes to the manifest's stored hash —
 * i.e. the only changes were whitespace. We re-derive the section slug from
 * the finding message because the check stores it there: 'Section "<slug>"
 * in <file>: ...'.
 *
 * @param {object} ctx
 * @param {object} finding
 * @param {{apply: boolean, dryRun: boolean}} mode
 * @returns {Promise<{healId: 'HEAL-04', path: string, summary: string} | null>}
 */
async function applyHeal04(ctx, finding, { apply, dryRun }) {
  const { files, manifest, wsDir } = ctx;
  const filename = finding.path;
  const sectionSlug = extractSectionSlug(finding.message);
  if (!sectionSlug) {
    // Defensive: if the message format ever changes, refuse rather than guess.
    return null;
  }

  // Locate the file's content from ctx.files.allMarkdownFiles.
  const wantAbs = path.join(wsDir, filename);
  const fileRec = (files.allMarkdownFiles ?? []).find((f) => f.path === wantAbs);
  if (!fileRec) return null;

  let parsed;
  try {
    parsed = parseMarkers(fileRec.content);
  } catch {
    return null;
  }
  if (parsed.errors.length > 0) return null;
  const sec = parsed.sections.get(sectionSlug);
  if (!sec) return null;

  const newHash = hashContent(sec.contentLines);
  const summary = `hash refreshed for ${filename}/${sectionSlug}`;

  if (apply && !dryRun) {
    const updated = JSON.parse(JSON.stringify(manifest ?? {}));
    if (!updated.generatedSections) updated.generatedSections = {};
    if (!updated.generatedSections[filename]) updated.generatedSections[filename] = {};
    updated.generatedSections[filename][sectionSlug] = newHash;
    updated.lastUpdatedAt = new Date().toISOString();
    const text = `${JSON.stringify(updated, null, 2)}\n`;
    await atomicWrite(path.join(wsDir, '11_workspace_manifest.json'), text);
    ctx.manifest = updated;
  }

  return {
    healId: 'HEAL-04',
    path: '11_workspace_manifest.json',
    summary,
  };
}

/**
 * Extract section slug from a check-stale-generated-sections message.
 * Format: 'Section "<slug>" in <file>: ...'
 *
 * @param {string} msg
 * @returns {string | null}
 */
function extractSectionSlug(msg) {
  const m = String(msg ?? '').match(/Section "([^"]+)"/);
  return m ? m[1] : null;
}

// ─── HEAL-02 / HEAL-03 stubs ─────────────────────────────────────────────────
//
// Filled in Task 2. Until then they return null so the dispatcher records a
// generic skipped entry. (Tests in this task do NOT exercise HEAL-02/03.)

async function applyHeal02(_ctx, _finding, _mode) {
  return null;
}

async function applyHeal03(_ctx, _finding, _mode) {
  return null;
}

// ─── Dispatch table ───────────────────────────────────────────────────────────
//
// Maps finding.code → handler. For codes that depend on `finding.path`
// (TESTATLAS_MISSING_INDEX dispatches to HEAL-02 if path is the canonical
// 09_artifact_index.md, otherwise HEAL-03), we expose a function the
// dispatcher calls with the finding to pick the handler.

function dispatch(finding) {
  switch (finding.code) {
    case 'TESTATLAS_COUNT_MISMATCH':
      return applyHeal01;
    case 'TESTATLAS_STALE_GENERATED_HASH':
      return applyHeal04;
    case 'TESTATLAS_MISSING_INDEX':
      return finding.path === '09_artifact_index.md' ? applyHeal02 : applyHeal03;
    case 'TESTATLAS_INDEX_MISMATCH':
      return finding.path === '09_artifact_index.md' ? applyHeal02 : applyHeal03;
    default:
      return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Iterate over `results.flatMap(r => r.findings)` and dispatch each fixable
 * finding to the matching HEAL-XX handler. Findings whose code is in the
 * NEVER-heal list are recorded as `skipped` with the canonical reason.
 *
 * @param {Array<{findings: object[]}>} results
 * @param {{wsDir: string, files: object, manifest: object|null}} ctx
 * @param {{dryRun?: boolean, apply?: boolean}} [opts]
 * @returns {Promise<{
 *   applied: Array<{healId: string, path: string, summary: string}>,
 *   skipped: Array<{reason: string, path: string, code: string}>
 * }>}
 */
export async function autoHealFindings(results, ctx, opts = {}) {
  const { dryRun = false, apply = false } = opts;
  const applied = [];
  const skipped = [];

  // De-dupe HEAL-01: TESTATLAS_COUNT_MISMATCH typically yields one finding per
  // count key (e.g., 5 findings if all 5 counts differ). A single HEAL-01
  // pass refreshes ALL counts in one atomicWrite — so we apply it once and
  // record once.
  const seenCodesForSingleton = new Set();

  const allFindings = (results ?? []).flatMap((r) => r.findings ?? []);

  for (const finding of allFindings) {
    if (!finding) continue;

    if (finding.fixable === 'auto') {
      const handler = dispatch(finding);
      if (!handler) {
        skipped.push({
          reason: 'unrecognized fixable code; refusing to heal',
          path: finding.path,
          code: finding.code,
        });
        continue;
      }

      // Singleton HEAL-01: only run once even if multiple count keys mismatch.
      if (finding.code === 'TESTATLAS_COUNT_MISMATCH') {
        if (seenCodesForSingleton.has('TESTATLAS_COUNT_MISMATCH')) continue;
        seenCodesForSingleton.add('TESTATLAS_COUNT_MISMATCH');
      }

      try {
        const result = await handler(ctx, finding, { apply, dryRun });
        if (result) {
          applied.push(result);
        } else {
          skipped.push({
            reason: 'heal handler not yet implemented or refused',
            path: finding.path,
            code: finding.code,
          });
        }
      } catch (err) {
        skipped.push({
          reason: `heal handler threw: ${err.code ?? 'ERROR'} — ${err.message}`,
          path: finding.path,
          code: finding.code,
        });
      }
      continue;
    }

    // fixable !== 'auto' — check the NEVER-heal list.
    const reason = NEVER_HEAL_REASONS[finding.code];
    if (reason) {
      skipped.push({
        reason,
        path: finding.path,
        code: finding.code,
      });
    }
    // Unknown non-fixable codes: ignore silently — they may be informational
    // or warnings that don't need autoheal attention.
  }

  return { applied, skipped };
}
