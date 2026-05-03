// scripts/lib/validate/check-duplicate-ids.js
//
// PRD §33 condition 7: no two artifacts share the same ID.
// Plan 05-03 (Wave 2).
//
// Findings:
//   TESTATLAS_DUPLICATE_ID — severity 'error', fixable=null (NEVER-heal).
//
// Why fixable=null: when two artifacts share an ID, autoheal cannot decide
// which is the original. The user must resolve manually (rename one, update
// references, run /atlas:doctor). This is the explicit NEVER-heal contract
// from Plan 05-04's CANONICAL list.
//
// Scope: ALL workspace artifact types are checked in a single pass:
//   - issues       (id is "ISSUE-<num>")
//   - flows        (id is "FLOW-<slug>")
//   - domains      (id is "domain-<slug>" — emitted from domain.json.id, NOT the dir slug)
//   - evidence     (id is "EVIDENCE-<num>" or similar — from evidence.json.id)
//   - testRuns     (id is "RUN-<...>")
//   - reports      (id is "REPORT-<...>")
//
// For domains and evidence, the walker already exposes a discrete identifier
// (domain.slug, evidence.id), so the duplicate check is direct. For runs and
// reports, the walker keys by basename — a collision shows up as two
// records sharing the same id field. For issues, the walker pairs .md and
// .json by basename, but TWO DIFFERENT basenames sharing the same numeric
// prefix (e.g., ISSUE-001-foo and ISSUE-001-bar) are TWO records — that's
// the bug we're catching.

import path from 'node:path';

export const id = 'check-duplicate-ids';
export const prdRule = 7;

/**
 * @param {{wsDir:string, files:object}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:string, findings:object[]}>}
 */
export async function check(ctx) {
  const { wsDir, files } = ctx;
  const findings = [];

  // Map<id, Array<{type, path}>> — every artifact's representative path.
  const byId = new Map();

  function record(idValue, type, absPath) {
    if (!idValue || typeof idValue !== 'string') return;
    const list = byId.get(idValue) ?? [];
    list.push({ type, path: absPath });
    byId.set(idValue, list);
  }

  for (const issue of files.issues ?? []) {
    // Walker derives `id` from filename (e.g., "ISSUE-001"). Two files
    // ISSUE-001-foo and ISSUE-001-bar collide on the numeric prefix.
    const repr = issue.jsonPath ?? issue.mdPath;
    if (repr) record(issue.id, 'issue', repr);
  }
  for (const flow of files.flows ?? []) {
    const repr = flow.jsonPath ?? flow.mdPath;
    if (repr) record(flow.id, 'flow', repr);
  }
  for (const dom of files.domains ?? []) {
    // Prefer the parsed `id` field from domain.json (canonical "domain-<slug>"),
    // falling back to the directory slug (also unique within domains/).
    const idValue = dom.parsed?.id ?? `domain-${dom.slug}`;
    record(idValue, 'domain', dom.jsonPath);
  }
  // Evidence records: collapse multiple files inside the same EVID dir to a
  // single ID (the dir name). Two SEPARATE dirs sharing an ID would already
  // show up as two evidenceFiles entries with the same `id` but different
  // parent dirs — but in practice the walker keys by `evidence/<EVID-id>/`,
  // so dir-name uniqueness is filesystem-enforced. Still, we aggregate by id
  // and only flag if the SET of distinct parent directories is > 1.
  const evidByIdDirs = new Map();
  for (const ev of files.evidenceFiles ?? []) {
    const parent = path.dirname(ev.path);
    const dirs = evidByIdDirs.get(ev.id) ?? new Set();
    dirs.add(parent);
    evidByIdDirs.set(ev.id, dirs);
  }
  for (const [evid, dirs] of evidByIdDirs) {
    if (dirs.size > 1) {
      // Record each distinct dir under the same id so the standard reporter
      // path catches the duplicate.
      for (const d of dirs) {
        record(evid, 'evidence', path.join(d, 'evidence.json'));
      }
    }
  }
  for (const run of files.testRuns ?? []) {
    const repr = run.jsonPath ?? run.mdPath;
    if (repr) record(run.id, 'testRun', repr);
  }
  for (const rep of files.reports ?? []) {
    const repr = rep.mdPath ?? rep.jsonPath;
    if (repr) record(rep.id, 'report', repr);
  }

  // ── Emit findings for any id with > 1 record ────────────────────────────
  for (const [idValue, list] of byId) {
    if (list.length <= 1) continue;
    // Distinct paths only — a single artifact has paired .md/.json under one
    // basename and the walker already collapsed those to one record. But if
    // we're aggregating across types or hand-rolled cases, dedupe defensively.
    const distinctPaths = Array.from(new Set(list.map((r) => r.path)));
    if (distinctPaths.length <= 1) continue;
    const relPaths = distinctPaths.map((p) => path.relative(wsDir, p)).join(', ');
    findings.push({
      severity: 'error',
      path: distinctPaths.map((p) => path.relative(wsDir, p)).join(','),
      code: 'TESTATLAS_DUPLICATE_ID',
      message: `ID ${idValue} appears in multiple artifacts: ${relPaths}`,
      fixable: null,
      fixDescription:
        'Manual review required — autoheal cannot determine which artifact is the original. Rename one and update all references.',
    });
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
