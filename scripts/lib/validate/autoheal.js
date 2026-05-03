// scripts/lib/validate/autoheal.js
//
// Plan 05-01 ships this file as a SCAFFOLD ONLY. The body is filled by Plan
// 05-04 (HEAL-01..04) when validate-workspace.js gains its `--auto-heal` flag.
//
// Why ship the scaffold here instead of in 05-04? The Wave-1 disjoint-files
// invariant requires 05-01 and 05-02 to share NO file paths. 05-04 depends on
// 05-02 + 05-03 transitively, so it serializes against this scaffold safely.
// Shipping the scaffold from 05-01 means 05-04 has zero "create new file"
// scaffold work — it only fills the body.
//
// Contract (locked for Plan 05-04 to implement):
//   autoHealFindings(results, ctx, {dryRun}) → {applied: Heal[], skipped: Heal[]}
//
// `results` is the validate-workspace output structure (Plan 05-02). `ctx`
// carries cwd + workspace dir + AJV singleton. `dryRun` opts out of writes.
//
// Returns two arrays:
//   - applied: heals that were performed (or would-be-performed, when dryRun)
//   - skipped: findings that COULD have been healed but were not (with reason)
//
// Conservative posture (per Plan 05-03 §"check-stale-generated-sections"):
// non-whitespace edits inside generated markers produce findings with
// fixable=null — autoHeal MUST refuse to overwrite human content.

/**
 * @typedef {{kind: string, file?: string, section?: string, detail?: string}} Heal
 *
 * @param {object} results validate-workspace output (Plan 05-02 contract)
 * @param {{cwd: string, workspaceDir: string}} ctx
 * @param {{dryRun?: boolean}} [opts]
 * @returns {Promise<{applied: Heal[], skipped: Heal[]}>}
 */
export async function autoHealFindings(_results, _ctx, _opts = {}) {
  // Plan 05-04 fills the body. Until then: no-op, returns empty arrays so
  // validate-workspace --auto-heal exits 0 with "0 heals applied".
  return { applied: [], skipped: [] };
}
