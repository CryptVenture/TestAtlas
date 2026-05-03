// scripts/lib/validate/check-canonical-files.js
//
// PRD §33 condition 1: all 14 canonical files present in the workspace.
// Plan 05-02 (Wave 1).
//
// Findings:
//   TESTATLAS_MISSING_CANONICAL — severity 'error', fixable null (NEVER auto-heal).
//
// Why never auto-heal: canonical files (00..13) hold human content. Restoring
// them via git or re-running /atlas:init is the user's call, not the
// validator's. Plan 05-04's autoheal contract explicitly excludes this case.

import { CANONICAL_FILENAMES } from './walk-workspace.js';

export const id = 'check-canonical-files';
export const prdRule = 1;

/**
 * @param {{files: {canonicalFiles: Map<string, {present: boolean}>}}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:'pass'|'fail', findings:object[]}>}
 */
export async function check(ctx) {
  const findings = [];
  for (const name of CANONICAL_FILENAMES) {
    const rec = ctx.files.canonicalFiles.get(name);
    if (!rec?.present) {
      findings.push({
        severity: 'error',
        path: name,
        code: 'TESTATLAS_MISSING_CANONICAL',
        message: `Canonical file ${name} is missing from the workspace`,
        fixable: null,
        fixDescription:
          'Restore via git checkout or re-run /atlas:init (this file holds human content; auto-heal does not recreate it)',
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
