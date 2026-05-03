// scripts/lib/validate/check-stale-generated-sections.js
//
// PRD §33 conditions 8 + 9: detect drift between manifest.generatedSections
// hashes and the on-disk content of each tracked section.
// Plan 05-03 (Wave 2).
//
// Findings (two distinct codes, by drift type):
//   TESTATLAS_STALE_GENERATED_HASH       — whitespace-only diff;
//                                          severity 'warning', fixable='auto'
//                                          (HEAL-04 eligible — Plan 05-04).
//   TESTATLAS_MODIFIED_GENERATED_CONTENT — non-whitespace diff;
//                                          severity 'warning', fixable=null
//                                          (NEVER-heal — Pitfall 2 mitigation).
//
// Why the split:
//   - HEAL-04 is the conservative whitespace-renormalization auto-heal. It
//     can safely re-emit a section whose body, modulo whitespace, equals
//     what was last hashed.
//   - Any non-whitespace edit might be a deliberate human override of a
//     generated section. Auto-overwriting it would silently destroy work.
//     We surface the drift but never auto-fix.
//
// Whitespace-only heuristic:
//   We need to detect "the on-disk body is identical to the original up to
//   whitespace tweaks (added blank lines, trailing spaces, leading
//   indentation drift)". We DO NOT have the original body — only its hash.
//   So we apply a per-line whitespace canonicalization to the on-disk body
//   and re-hash:
//       canonical = body.split(/\n/)
//                       .map(l => l.replace(/^[ \t]+|[ \t]+$/g, ''))  // trim per-line
//                       .filter(l => l !== '')                          // drop blank lines
//                       .join('\n')
//       if (hashContent(canonical) === storedHash) → whitespace-only drift
//   This works because hashContent(bodyAtWrite) was computed on the body the
//   regenerator emitted — and regenerators typically emit canonical lines
//   (no leading/trailing whitespace, no blank lines). When a user later adds
//   indentation or blank lines inside the section, our canonicalization
//   recovers the original byte sequence. Anything else (added/removed/edited
//   visible characters) hashes differently and is treated as a non-
//   whitespace edit (NEVER-heal).
//
// Marker errors (TESTATLAS_MARKER_INVALID): handled by check-canonical-files
// + check-broken-links indirectly. We surface a finding here so the user
// sees that the manifest entry can't be hash-checked because the file's
// markers are corrupt.

import path from 'node:path';
import { hashContent } from '../content-hash.js';
import { parseMarkers } from '../markers.js';

export const id = 'check-stale-generated-sections';
export const prdRule = 8;

/**
 * Per-line canonicalize a section body for the HEAL-04 eligibility heuristic.
 *   - Strip leading/trailing horizontal whitespace from every line
 *   - Drop blank-only lines (whitespace-only or empty)
 *
 * Vertical line structure between non-blank lines is PRESERVED — this is the
 * key invariant for matching a regenerator-emitted body, which contains no
 * leading/trailing whitespace and no blank lines between bullet items.
 *
 * @param {string} body
 * @returns {string}
 */
function canonicalizeWhitespace(body) {
  return body
    .split(/\n/)
    .map((l) => l.replace(/^[ \t]+|[ \t]+$/g, ''))
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * @param {{wsDir:string, files:object, manifest:object|null}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:string, findings:object[]}>}
 */
export async function check(ctx) {
  const { wsDir, files, manifest } = ctx;
  const findings = [];

  const generatedSections = manifest?.generatedSections;
  if (!generatedSections || typeof generatedSections !== 'object') {
    return { id, prdRule, status: 'pass', findings };
  }

  // Index allMarkdownFiles by relative path for O(1) lookup.
  const mdByRel = new Map();
  for (const f of files.allMarkdownFiles ?? []) {
    const rel = path.relative(wsDir, f.path).split(path.sep).join('/');
    mdByRel.set(rel, f);
  }

  for (const [filename, sectionsMap] of Object.entries(generatedSections)) {
    if (!sectionsMap || typeof sectionsMap !== 'object') continue;

    const fileRec = mdByRel.get(filename);
    if (!fileRec) {
      // File listed in manifest.generatedSections but missing on disk.
      // check-canonical-files (or check-broken-links) handles missing-file
      // surfacing for canonical entries. We add nothing here — the missing
      // file already implies all sections are unreachable.
      continue;
    }

    let parsed;
    try {
      parsed = parseMarkers(fileRec.content);
    } catch (err) {
      findings.push({
        severity: 'warning',
        path: filename,
        code: 'TESTATLAS_MARKER_INVALID',
        message: `Cannot validate generated-section hashes: ${err.message}`,
        fixable: null,
      });
      continue;
    }

    if (parsed.errors.length > 0) {
      findings.push({
        severity: 'warning',
        path: filename,
        code: 'TESTATLAS_MARKER_INVALID',
        message: `Cannot validate generated-section hashes: ${parsed.errors[0].message}`,
        fixable: null,
      });
      continue;
    }

    for (const [sectionSlug, storedHash] of Object.entries(sectionsMap)) {
      const sec = parsed.sections.get(sectionSlug);
      if (!sec) {
        // Manifest expects a section that's no longer in the file. This
        // shouldn't happen in a healthy workspace; surface as MODIFIED
        // (NEVER-heal — the file structure changed, autoheal can't reason
        // about the user's intent).
        findings.push({
          severity: 'warning',
          path: filename,
          code: 'TESTATLAS_MODIFIED_GENERATED_CONTENT',
          message: `Manifest expects section "${sectionSlug}" in ${filename} but it is absent`,
          fixable: null,
        });
        continue;
      }

      // sec.hash is computed by parseMarkers via hashContent(contentLines).
      if (sec.hash === storedHash) continue; // pass — bytes-match.

      // Hash drift detected. Apply the whitespace-only heuristic.
      const body = sec.contentLines.join('\n');
      const canonical = canonicalizeWhitespace(body);
      const canonicalHash = hashContent(canonical);

      if (canonicalHash === storedHash) {
        findings.push({
          severity: 'warning',
          path: filename,
          line: sec.startLine,
          code: 'TESTATLAS_STALE_GENERATED_HASH',
          message: `Section "${sectionSlug}" in ${filename}: whitespace-only drift from manifest hash (eligible for HEAL-04)`,
          fixable: 'auto',
          fixDescription:
            'Whitespace-only drift in generated section — HEAL-04 will regenerate from canonical body and re-hash.',
        });
      } else {
        findings.push({
          severity: 'warning',
          path: filename,
          line: sec.startLine,
          code: 'TESTATLAS_MODIFIED_GENERATED_CONTENT',
          message: `Section "${sectionSlug}" in ${filename}: content changed (non-whitespace edit; manifest hash mismatch)`,
          fixable: null,
          fixDescription:
            'Section was modified outside of generation. Review changes; if intentional, re-run the generator (e.g., update-indexes, sync-status, summarize-run) to re-hash. Auto-heal will NOT overwrite human edits.',
        });
      }
    }
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'warn' : 'pass',
    findings,
  };
}
