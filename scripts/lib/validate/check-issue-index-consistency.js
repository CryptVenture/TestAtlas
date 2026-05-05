// scripts/lib/validate/check-issue-index-consistency.js
//
// PRD §33 condition 5: every issue is indexed by domain+severity+status+type
// in the to_fix/by_*/ cross-cut indexes; every cross-cut index entry resolves
// to a real issue file. Plan 05-02 (Wave 1).
//
// The 4 cross-cuts (per PRD §17 + init-workspace.js NESTED_DIRS):
//   to_fix/by_domain/<domain-id>.md
//   to_fix/by_severity/<severity>.md
//   to_fix/by_status/<status>.md
//   to_fix/by_type/<type>.md
//
// Findings:
//   TESTATLAS_INDEX_MISMATCH — severity 'error', fixable 'auto'.
//     Forward miss: issue's facet value has no matching index entry.
//     Reverse dangling: index lists ISSUE-N where ISSUE-N has no on-disk file.
//   TESTATLAS_INDEX_STALE — severity 'error', fixable 'auto' (Plan 11-06 / F-23).
//     Stale-direction: index entry lists a real issue, but the issue's actual
//     facet value disagrees with the index's category (e.g., issue is
//     severity:medium but appears in by_severity/high.md). Common after
//     status transitions (triaged → closed) leave old indexes uncleaned.
//
// Why fixable='auto': the cross-cut indexes are pure derivations of issue
// metadata (no human authorship inside the index — only generated bullet
// lists). Plan 05-04's HEAL-03 regenerates them from on-disk issues.

import path from 'node:path';

export const id = 'check-issue-index-consistency';
export const prdRule = 5;

const FACETS = [
  { dir: 'by_domain', field: 'domain' },
  { dir: 'by_severity', field: 'severity' },
  { dir: 'by_status', field: 'status' },
  { dir: 'by_type', field: 'type' },
];

/**
 * Heuristic: does this index file's content reference the given issue?
 * We accept either of the canonical reference shapes:
 *   - the issue ID ("ISSUE-001")
 *   - the issue's filename ("ISSUE-001-foo.md" or ".json")
 *   - the issue slug ("foo")
 *
 * Conservative — we require an exact substring match on at least one of the
 * three identifiers to avoid false positives from shared common words.
 *
 * @param {string} content
 * @param {{id:string, slug:string}} issue
 */
function indexReferencesIssue(content, issue) {
  if (content.includes(issue.id)) return true;
  // Filename references.
  if (content.includes(`${issue.id}-${issue.slug}.md`)) return true;
  if (content.includes(`${issue.id}-${issue.slug}.json`)) return true;
  return false;
}

/**
 * Look up an index file's content from ctx.files.indexes by relative path.
 *
 * @param {string} wsDir
 * @param {Array<{path:string, slug:string, content:string}>} indexes
 * @param {string} relPath
 * @returns {string | null}
 */
function findIndexContent(wsDir, indexes, relPath) {
  const wantAbs = path.join(wsDir, relPath);
  const idx = indexes.find((i) => i.path === wantAbs);
  return idx ? idx.content : null;
}

/**
 * @param {{wsDir:string, files:object}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:string, findings:object[]}>}
 */
export async function check(ctx) {
  const { wsDir, files } = ctx;
  const findings = [];

  // ── Forward direction: each issue → expected index entry exists. ──
  for (const issue of files.issues) {
    if (!issue.parsed) continue; // parse errors handled by check-schemas
    for (const facet of FACETS) {
      const value = issue.parsed[facet.field];
      if (typeof value !== 'string' || !value) continue;
      const expectedRel = path.posix.join('to_fix', facet.dir, `${value}.md`);
      const content = findIndexContent(wsDir, files.indexes, expectedRel);
      if (content === null) {
        findings.push({
          severity: 'error',
          path: expectedRel,
          code: 'TESTATLAS_INDEX_MISMATCH',
          message: `Issue ${issue.id} (${facet.field}=${value}) is not represented in the cross-cut index ${expectedRel} (file missing)`,
          fixable: 'auto',
          fixDescription: 'Regenerate cross-cut indexes from on-disk issue metadata (HEAL-03)',
        });
        continue;
      }
      if (!indexReferencesIssue(content, issue)) {
        findings.push({
          severity: 'error',
          path: expectedRel,
          code: 'TESTATLAS_INDEX_MISMATCH',
          message: `Issue ${issue.id} (${facet.field}=${value}) is missing from index ${expectedRel}`,
          fixable: 'auto',
          fixDescription: 'Regenerate cross-cut indexes from on-disk issue metadata (HEAL-03)',
        });
      }
    }
  }

  // ── Reverse direction: each index entry resolves to a real issue. ──
  // We re-scan each by_* index for ISSUE-* tokens and ensure each token
  // matches a known issue id.
  const knownIssueIds = new Set(files.issues.map((i) => i.id));
  const issuesById = new Map(files.issues.map((i) => [i.id, i]));
  for (const idx of files.indexes) {
    const rel = path.relative(wsDir, idx.path).split(path.sep).join('/');
    if (!rel.startsWith('to_fix/by_')) continue;
    const tokens = idx.content.match(/ISSUE-[A-Za-z0-9-]+/g) ?? [];
    const seen = new Set();
    for (const tok of tokens) {
      // Match the bare ID prefix (e.g., "ISSUE-001" from "ISSUE-001-foo.md").
      const m = tok.match(/^(ISSUE-[0-9]+)/);
      const ref = m ? m[1] : tok;
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (!knownIssueIds.has(ref)) {
        findings.push({
          severity: 'error',
          path: rel,
          code: 'TESTATLAS_INDEX_MISMATCH',
          message: `Index ${rel} references ${ref} but no matching issue file exists in to_fix/`,
          fixable: 'auto',
          fixDescription: 'Regenerate cross-cut indexes from on-disk issue metadata (HEAL-03)',
        });
      }
    }
  }

  // ── Stale-detection: each index entry's referenced issue has matching ──
  // ── facet value (Plan 11-06 / F-23).                                  ──
  //
  // Forward direction catches "issue's facet value has no index entry".
  // Reverse direction catches "index entry resolves to a phantom issue".
  // Neither catches "index lists a real issue but with the WRONG facet
  // value" — which happens after status transitions when the old index
  // file isn't regenerated. This third pass closes that gap.
  for (const idx of files.indexes) {
    const rel = path.relative(wsDir, idx.path).split(path.sep).join('/');
    // Match "to_fix/by_<facet>/<value>.md" exactly (skip 09_artifact_index
    // and domains/<slug>/index.md — they aren't faceted cross-cuts).
    const m = rel.match(/^to_fix\/by_([^/]+)\/([^/]+)\.md$/);
    if (!m) continue;
    const facetDir = `by_${m[1]}`;
    const indexValue = m[2];
    const facet = FACETS.find((f) => f.dir === facetDir);
    if (!facet) continue;

    const tokens = idx.content.match(/ISSUE-[A-Za-z0-9-]+/g) ?? [];
    const seen = new Set();
    for (const tok of tokens) {
      const idMatch = tok.match(/^(ISSUE-[0-9]+)/);
      const ref = idMatch ? idMatch[1] : tok;
      if (seen.has(ref)) continue;
      seen.add(ref);
      const issue = issuesById.get(ref);
      // Skip phantom refs (already covered by the reverse-direction MISMATCH
      // emitter above) and parse-error issues (covered by check-schemas).
      if (!issue?.parsed) continue;
      const actual = issue.parsed[facet.field];
      if (typeof actual !== 'string' || !actual) continue;
      if (actual !== indexValue) {
        findings.push({
          severity: 'error',
          path: rel,
          code: 'TESTATLAS_INDEX_STALE',
          message: `Index ${rel} lists ${ref} but issue.${facet.field} = "${actual}", not "${indexValue}" — index entry is stale`,
          fixable: 'auto',
          fixDescription: 'Regenerate cross-cut indexes from on-disk issue metadata (HEAL-03)',
        });
      }
    }
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
