// scripts/lib/validate/check-orphaned-evidence.js
//
// PRD §33 condition 4: orphaned evidence detection. Plan 05-02 (Wave 1).
//
// Two opposite checks bundled here (matches RESEARCH.md §628-687):
//   1. ORPHAN — evidence files under evidence/<EVID-id>/ that are NOT referenced
//      by any issue/run/flow/domain. severity=warning, fixable=null. Never
//      auto-delete: the file might be a draft.
//   2. MISSING_REF — issue.evidence[] (and similar fields) entries that don't
//      resolve to a real file. severity=error, fixable=null. Heuristic match
//      is unsafe.
//
// The referenced-set is derived from:
//   - issue.evidence[]               (issue.schema.json)
//   - issue.evidenceLinks[]          (forward-compat — older fixtures may use this name)
//   - testRun.evidence[]             (test-run.schema.json)
//   - flow.evidence[]                (flow.schema.json)
//   - domain.evidence[]              (domain.schema.json — if present)
//
// References can be either an EVID-id (e.g., "EVID-007") OR a relative path
// (e.g., "evidence/EVID-007/screenshot.png"). Both forms are normalized.

import path from 'node:path';

export const id = 'check-orphaned-evidence';
export const prdRule = 4;

/**
 * Pull evidence references off a parsed artifact. Returns a list of strings
 * (each either an EVID-id like "EVID-007" or a relative path).
 *
 * @param {object|null} parsed
 * @returns {string[]}
 */
function collectEvidenceRefs(parsed) {
  if (!parsed || typeof parsed !== 'object') return [];
  const refs = [];
  for (const field of ['evidence', 'evidenceLinks']) {
    const v = parsed[field];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') refs.push(item);
        else if (item && typeof item === 'object' && typeof item.id === 'string') {
          refs.push(item.id);
        } else if (item && typeof item === 'object' && typeof item.path === 'string') {
          refs.push(item.path);
        }
      }
    }
  }
  return refs;
}

/**
 * Normalize a reference into the EVID-id portion if discernible.
 * "EVID-007"                                  → "EVID-007"
 * "evidence/EVID-007/screenshot.png"          → "EVID-007"
 * "EVID-007/screenshot.png"                   → "EVID-007"
 * Anything else returns null (unresolvable).
 *
 * @param {string} ref
 * @returns {string | null}
 */
function refToEvidId(ref) {
  if (!ref || typeof ref !== 'string') return null;
  // Accept both the canonical PRD §32 form (EVIDENCE-<digits>...) and the
  // legacy EVID- form. Matching is greedy on the longer prefix first so
  // "EVIDENCE-001-foo" yields "EVIDENCE-001-foo", not "EVID".
  const m = ref.match(/(EVIDENCE-[A-Za-z0-9-]+|EVID-[A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}

/**
 * @param {{wsDir:string, files:object}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:string, findings:object[]}>}
 */
export async function check(ctx) {
  const { wsDir, files } = ctx;
  const findings = [];

  // ── Build the referenced-set (EVID-ids that any artifact mentions). ──
  const referencedIds = new Set();
  // Also track raw path-style references so MISSING_REF can resolve them.
  /** @type {Array<{owner: string, ref: string}>} */
  const allRefs = [];

  for (const issue of files.issues) {
    const refs = collectEvidenceRefs(issue.parsed);
    for (const r of refs) {
      const ev = refToEvidId(r);
      if (ev) referencedIds.add(ev);
      allRefs.push({ owner: issue.jsonPath ?? issue.mdPath ?? '?', ref: r });
    }
  }
  for (const run of files.testRuns) {
    for (const r of collectEvidenceRefs(run.parsed)) {
      const ev = refToEvidId(r);
      if (ev) referencedIds.add(ev);
      allRefs.push({ owner: run.jsonPath ?? run.mdPath ?? '?', ref: r });
    }
  }
  for (const flow of files.flows) {
    for (const r of collectEvidenceRefs(flow.parsed)) {
      const ev = refToEvidId(r);
      if (ev) referencedIds.add(ev);
      allRefs.push({ owner: flow.jsonPath ?? flow.mdPath ?? '?', ref: r });
    }
  }
  for (const dom of files.domains) {
    for (const r of collectEvidenceRefs(dom.parsed)) {
      const ev = refToEvidId(r);
      if (ev) referencedIds.add(ev);
      allRefs.push({ owner: dom.jsonPath ?? '?', ref: r });
    }
  }

  // ── Orphan check: evidence files not referenced. ──
  // Group evidence files by EVID-id; an EVID dir is orphaned only if NONE of
  // its files are referenced. (A single mention of EVID-007 covers every file
  // under evidence/EVID-007/.)
  /** @type {Map<string, string[]>} */
  const evidenceByEvid = new Map();
  for (const ev of files.evidenceFiles) {
    const list = evidenceByEvid.get(ev.id) ?? [];
    list.push(ev.path);
    evidenceByEvid.set(ev.id, list);
  }
  for (const [evid, paths] of evidenceByEvid) {
    if (!referencedIds.has(evid)) {
      // Flag the directory (representative path) — surface every file in the
      // dir would be noisy.
      findings.push({
        severity: 'warning',
        path: path.relative(wsDir, paths[0]),
        code: 'TESTATLAS_ORPHANED_EVIDENCE',
        message: `Evidence ${evid} is not referenced by any issue/run/flow/domain`,
        fixable: null,
        fixDescription: 'Review whether to delete (manual) or attach to an issue/run',
      });
    }
  }

  // ── MISSING_REF check: every reference resolves to an existing EVID dir. ──
  // We have the workspace walk; if the EVID-id portion of a ref does not
  // appear in evidenceByEvid, flag the owning artifact.
  for (const { owner, ref } of allRefs) {
    const evid = refToEvidId(ref);
    if (!evid) {
      // Reference shape we couldn't parse — surface as missing-ref so the
      // user sees it.
      findings.push({
        severity: 'error',
        path: path.relative(wsDir, owner),
        code: 'TESTATLAS_MISSING_EVIDENCE_REF',
        message: `Evidence reference "${ref}" is not in EVID-* form and could not be resolved`,
        fixable: null,
      });
      continue;
    }
    if (!evidenceByEvid.has(evid)) {
      findings.push({
        severity: 'error',
        path: path.relative(wsDir, owner),
        code: 'TESTATLAS_MISSING_EVIDENCE_REF',
        message: `Evidence reference "${ref}" → ${evid} does not resolve to a real evidence directory under evidence/${evid}/`,
        fixable: null,
      });
    }
  }

  const status = findings.some((f) => f.severity === 'error')
    ? 'fail'
    : findings.length > 0
      ? 'warn'
      : 'pass';

  return { id, prdRule, status, findings };
}
