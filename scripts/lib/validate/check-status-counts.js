// scripts/lib/validate/check-status-counts.js
//
// PRD §33 condition 10: manifest.counts agrees with on-disk reality.
// Plan 05-03 (Wave 2).
//
// Findings:
//   TESTATLAS_COUNT_MISMATCH — severity 'error', fixable='auto' (HEAL-01).
//
// Why fixable='auto': counts are pure derivations of file-system state. The
// manifest.counts object is a cache; HEAL-01 (sync-status.js) recomputes it
// from disk. No human authorship is at stake.
//
// Counted keys (matches workspace-manifest.schema.json /properties/counts):
//   domains          — number of unique domain directories (one per
//                      domains/<slug>/domain.json)
//   flows            — number of unique FLOW-* records (paired .md+.json
//                      collapse to one)
//   issues           — number of unique ISSUE-* records (paired .md+.json
//                      collapse to one)
//   evidenceRecords  — number of unique EVID-* directories (NOT raw file
//                      count: an EVID dir typically holds 2-4 files —
//                      evidence.json, evidence.md, screenshot.png, etc.)
//   testRuns         — number of unique RUN-* records (paired .md+.json
//                      collapse to one)
//
// reports is NOT in the counts schema (sync-status tracks it separately).
// We don't check reports here; check-canonical-files asserts the reports/
// dir exists, and report quality checks live in generate-report.js.

export const id = 'check-status-counts';
export const prdRule = 10;

/**
 * @param {{files:object, manifest:object|null}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:string, findings:object[]}>}
 */
export async function check(ctx) {
  const { files, manifest } = ctx;
  const findings = [];

  // Manifest may be null if it failed to parse (orchestrator tolerates the
  // parse error so other checks proceed). check-schemas surfaces the parse
  // failure; we silently pass here so the user sees one parse-error finding,
  // not five duplicate cascade findings.
  if (!manifest || typeof manifest !== 'object' || !manifest.counts) {
    return { id, prdRule, status: 'pass', findings };
  }

  // Count distinct EVID-* directories (not raw evidenceFiles entries).
  const evidIds = new Set((files.evidenceFiles ?? []).map((e) => e.id).filter(Boolean));

  const actual = {
    domains: (files.domains ?? []).length,
    flows: (files.flows ?? []).length,
    issues: (files.issues ?? []).length,
    evidenceRecords: evidIds.size,
    testRuns: (files.testRuns ?? []).length,
  };

  for (const [key, actualCount] of Object.entries(actual)) {
    const stored = manifest.counts[key];
    if (typeof stored !== 'number') continue; // schema violation — caught by check-schemas
    if (stored !== actualCount) {
      findings.push({
        severity: 'error',
        path: '11_workspace_manifest.json',
        code: 'TESTATLAS_COUNT_MISMATCH',
        message: `manifest.counts.${key}=${stored} but disk has ${actualCount}`,
        fixable: 'auto',
        fixDescription: 'Recompute manifest counts from disk via sync-status.js (HEAL-01)',
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
