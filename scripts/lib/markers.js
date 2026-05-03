// scripts/lib/markers.js
//
// Defensive line-state-machine parser + renderer for TestAtlas generated
// section markers.
//
// Marker syntax (locked, PRD §31; verbatim format — DO NOT bend):
//
//   <!-- TESTATLAS:GENERATED:START section="<slug>" -->
//   ... content ...
//   <!-- TESTATLAS:GENERATED:END section="<slug>" -->
//
// The parser is line-based — it does NOT understand markdown semantics, so
// markers inside fenced code blocks WILL match. Templates must avoid that
// pattern (Plan 02-02 enforces).
//
// On any parse error, renderSection refuses to write — better to surface a
// clear error than to corrupt user files.
//
// See .planning/phases/02-schemas-templates-workspace-skeleton/02-RESEARCH.md
// §"Pattern 2: Defensive Marker Parser" for the canonical pseudo-code and the
// 7 error-code rationale.

import { hashContent } from './content-hash.js';

export const START_RE = /^\s*<!--\s*TESTATLAS:GENERATED:START\s+section="([^"]+)"\s*-->\s*$/;
export const END_RE = /^\s*<!--\s*TESTATLAS:GENERATED:END\s+section="([^"]+)"\s*-->\s*$/;

/**
 * The 7 error codes parseMarkers can emit.
 *
 *   NESTED_MARKER       — START seen while another START is still open.
 *   ORPHAN_END          — END seen with no matching open START.
 *   ORPHAN_START        — Reserved (currently surfaced as MISSING_END at EOF;
 *                         kept distinct in case future variants want a
 *                         pre-EOF "you opened a section that's clearly
 *                         dangling" classification).
 *   MISSING_END         — Open START reaches EOF without a matching END.
 *   MISSING_START       — Reserved (currently equivalent to ORPHAN_END;
 *                         kept distinct for future enrichment).
 *   MISMATCHED_SECTION  — END section attribute differs from open START.
 *   DUPLICATE_SECTION   — Two complete START/END pairs share a slug.
 */
export const ERROR_CODES = Object.freeze({
  NESTED_MARKER: 'NESTED_MARKER',
  ORPHAN_END: 'ORPHAN_END',
  ORPHAN_START: 'ORPHAN_START',
  MISSING_END: 'MISSING_END',
  MISSING_START: 'MISSING_START',
  MISMATCHED_SECTION: 'MISMATCHED_SECTION',
  DUPLICATE_SECTION: 'DUPLICATE_SECTION',
});

/**
 * Parse marker pairs from a markdown string.
 *
 * Behavior:
 *   - CRLF input is normalized to LF before line splitting.
 *   - Each successfully closed pair becomes a section in the returned Map.
 *   - Each section carries a `hash` computed via content-hash.js (16 hex chars
 *     of SHA-256 over the content between markers).
 *   - All structural problems are accumulated into `errors[]` — the parser
 *     does NOT bail on the first issue; callers see the full picture.
 *
 * @param {string} text source markdown (CRLF-tolerant)
 * @returns {{ sections: Map<string, {startLine: number, endLine: number, contentLines: string[], hash: string}>, errors: Array<{code: string, line: number, message: string}> }}
 */
export function parseMarkers(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const sections = new Map();
  const errors = [];

  let openSlug = null;
  let openLine = -1; // 0-indexed line index of the open START marker
  let buf = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startMatch = line.match(START_RE);
    const endMatch = line.match(END_RE);

    if (startMatch) {
      if (openSlug !== null) {
        // Already inside a section — nested START is an error. Do NOT clobber
        // the open state; the inner START is ignored so we still surface the
        // outer MISSING_END / MISMATCHED_SECTION on its own terms.
        errors.push({
          code: ERROR_CODES.NESTED_MARKER,
          line: i + 1,
          message: `Nested START at line ${i + 1} (already inside section "${openSlug}" opened at line ${openLine + 1})`,
        });
      } else {
        openSlug = startMatch[1];
        openLine = i;
        buf = [];
      }
      continue;
    }

    if (endMatch) {
      if (openSlug === null) {
        errors.push({
          code: ERROR_CODES.ORPHAN_END,
          line: i + 1,
          message: `END marker at line ${i + 1} has no matching START`,
        });
        continue;
      }
      if (endMatch[1] !== openSlug) {
        errors.push({
          code: ERROR_CODES.MISMATCHED_SECTION,
          line: i + 1,
          message: `END section="${endMatch[1]}" does not match open START section="${openSlug}" at line ${openLine + 1}`,
        });
      }
      // Even on MISMATCHED_SECTION, we close on the first END seen so the
      // state machine doesn't get stuck (and so we still record the section
      // for callers that want to introspect partial parses).
      if (sections.has(openSlug)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_SECTION,
          line: openLine + 1,
          message: `Section "${openSlug}" appears more than once`,
        });
      }
      sections.set(openSlug, {
        startLine: openLine + 1, // 1-indexed: line of START marker
        endLine: i + 1, // 1-indexed: line of END marker
        contentLines: buf.slice(),
        hash: hashContent(buf),
      });
      openSlug = null;
      openLine = -1;
      buf = [];
      continue;
    }

    if (openSlug !== null) buf.push(line);
  }

  if (openSlug !== null) {
    errors.push({
      code: ERROR_CODES.MISSING_END,
      line: openLine + 1,
      message: `START at line ${openLine + 1} (section "${openSlug}") has no matching END before EOF`,
    });
  }

  return { sections, errors };
}

/**
 * Render an updated copy of `originalText` with `sectionSlug`'s content
 * replaced by `newContent`. Bytes outside the target section's marker pair
 * are byte-identical to the original.
 *
 * Refuses to render (throws) if the source has any marker errors — protects
 * downstream atomic-write callers from corrupting a file whose marker state
 * is already broken.
 *
 * @param {string} originalText source markdown
 * @param {string} sectionSlug section to replace
 * @param {string | string[]} newContent replacement content (string or lines array)
 * @returns {string} updated text
 * @throws {Error} `TESTATLAS_MARKER_INVALID` when source has marker errors
 *                 (the thrown Error has an `.errors` array with the parse output)
 * @throws {Error} `TESTATLAS_SECTION_NOT_FOUND` when `sectionSlug` is absent
 *                 (the thrown Error has `.sectionSlug`)
 */
export function renderSection(originalText, sectionSlug, newContent) {
  const { sections, errors } = parseMarkers(originalText);

  if (errors.length > 0) {
    const e = new Error(
      `Refusing to write: marker errors in source.\n  ${errors
        .map((x) => `[${x.code} line ${x.line}] ${x.message}`)
        .join('\n  ')}`,
    );
    e.code = 'TESTATLAS_MARKER_INVALID';
    e.errors = errors;
    throw e;
  }

  const section = sections.get(sectionSlug);
  if (!section) {
    const e = new Error(`Section "${sectionSlug}" not found in source`);
    e.code = 'TESTATLAS_SECTION_NOT_FOUND';
    e.sectionSlug = sectionSlug;
    throw e;
  }

  // Preserve the source's line-ending style so a CRLF file stays CRLF.
  const usesCrlf = /\r\n/.test(originalText);
  const eol = usesCrlf ? '\r\n' : '\n';

  // Split with a regex that accepts either terminator — the joined output
  // will use the detected eol for ALL line breaks, so mixed inputs become
  // consistent on the way out (acceptable per WORK-04 contract: round-trip
  // preserves bytes outside the target section's content body, but the file
  // is normalized to a single line-ending style).
  const sourceLines = originalText.split(/\r\n|\n/);

  const newLines = Array.isArray(newContent)
    ? newContent
    : String(newContent).replace(/\r\n/g, '\n').split('\n');

  // section.startLine and section.endLine are 1-indexed and point at the
  // marker lines themselves. Replace the lines BETWEEN them (exclusive of
  // marker lines).
  const before = sourceLines.slice(0, section.startLine); // up to & incl. START
  const after = sourceLines.slice(section.endLine - 1); // from END onward
  return [...before, ...newLines, ...after].join(eol);
}
