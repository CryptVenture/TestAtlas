// scripts/lib/validate/check-missing-indexes.js
//
// PRD §33 condition 6: required index files present.
// Plan 05-03 (Wave 2).
//
// Findings:
//   TESTATLAS_MISSING_INDEX — severity 'error', fixable 'auto' (HEAL-02).
//
// Why fixable='auto': index files are pure derivations of on-disk artifact
// metadata (no human authorship — only generated bullet lists inside marker
// pairs). Plan 05-04's HEAL-02 regenerates them via update-indexes.js.
//
// What we check:
//   1. 09_artifact_index.md is present at the workspace root. (Also covered
//      by check-canonical-files; we surface it here too because the fixable
//      contract is different — canonical-files marks it NEVER-heal whereas
//      its content IS regeneratable. The duplicate is harmless: orchestrator
//      shows both findings, the user sees clearly what to do.)
//   2. For each domain directory `domains/<slug>/`, both
//      `domains/<slug>/index.md` and `domains/<slug>/issues/index.md` are
//      present. These are per-domain rollups derived from on-disk issues.
//
// We deliberately do NOT enforce cross-cut index file presence
// (to_fix/by_{domain,severity,status,type}/). Forward+reverse consistency of
// those is covered by check-issue-index-consistency (PRD §33 condition 5).
// Doubling-up there would conflict with fixture realities (a workspace with
// no `type=critical` issues legitimately has no by_severity/critical.md).

import path from 'node:path';

export const id = 'check-missing-indexes';
export const prdRule = 6;

/**
 * @param {{wsDir:string, files:object}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:string, findings:object[]}>}
 */
export async function check(ctx) {
  const { wsDir, files } = ctx;
  const findings = [];

  // ── 1. 09_artifact_index.md ────────────────────────────────────────────
  // The walker exposes it via files.indexes (slug='09_artifact_index') AND
  // via files.canonicalFiles. We trust canonicalFiles for presence detection.
  const artifactIndexRec = files.canonicalFiles?.get('09_artifact_index.md');
  if (!artifactIndexRec?.present) {
    findings.push({
      severity: 'error',
      path: '09_artifact_index.md',
      code: 'TESTATLAS_MISSING_INDEX',
      message: '09_artifact_index.md is missing from the workspace root',
      fixable: 'auto',
      fixDescription: 'Regenerate via update-indexes.js (HEAL-02)',
    });
  }

  // ── 2. Per-domain index files ──────────────────────────────────────────
  // The walker emits domains[] (one entry per `domains/<slug>/domain.json`)
  // and indexes[] (entries for domains/<slug>/index.md when present). For
  // each domain we expect both index.md and issues/index.md.
  const presentIndexAbs = new Set(files.indexes?.map((i) => i.path) ?? []);
  // We can't probe indexes/index.md inside `issues/` from the walker (it
  // doesn't categorize that as an index), but we CAN scan allMarkdownFiles.
  const allMd = new Set(files.allMarkdownFiles?.map((m) => m.path) ?? []);

  for (const dom of files.domains ?? []) {
    const domainIndexAbs = path.join(wsDir, 'domains', dom.slug, 'index.md');
    const issuesIndexAbs = path.join(wsDir, 'domains', dom.slug, 'issues', 'index.md');

    if (!presentIndexAbs.has(domainIndexAbs) && !allMd.has(domainIndexAbs)) {
      findings.push({
        severity: 'error',
        path: path.posix.join('domains', dom.slug, 'index.md'),
        code: 'TESTATLAS_MISSING_INDEX',
        message: `Domain index domains/${dom.slug}/index.md is missing`,
        fixable: 'auto',
        fixDescription: 'Regenerate via update-indexes.js (HEAL-02)',
      });
    }
    if (!allMd.has(issuesIndexAbs)) {
      findings.push({
        severity: 'error',
        path: path.posix.join('domains', dom.slug, 'issues', 'index.md'),
        code: 'TESTATLAS_MISSING_INDEX',
        message: `Domain issues index domains/${dom.slug}/issues/index.md is missing`,
        fixable: 'auto',
        fixDescription: 'Regenerate via update-indexes.js (HEAL-02)',
      });
    }
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
