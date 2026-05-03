// scripts/lib/content-hash.js
//
// Canonical content hashing for TestAtlas generated marker sections.
//
// Contract (locked; manifest semantics depend on it — DO NOT change without
// bumping the workspace-manifest schema version):
//   - Input is either an array of lines (no terminators) or a single string.
//   - For arrays:  join with '\n'.
//   - For strings: replace all '\r\n' with '\n' (single regex pass).
//   - Compute SHA-256 over the UTF-8 bytes of the canonical string.
//   - Return the first 16 hex chars: `.digest('hex').slice(0, 16)`.
//
// Rationale (from .planning/phases/02-schemas-templates-workspace-skeleton/02-RESEARCH.md
// §"Pattern 4: Content-Hash Contract"):
//   - Marker lines are excluded from the hash so trivial spacing tweaks around
//     markers don't invalidate the hash.
//   - CRLF is normalized so a Windows checkout and a POSIX checkout of the same
//     file produce the same hash.
//   - Trailing whitespace is preserved because two trailing spaces is a hard
//     line break in markdown — semantically meaningful content.

import { createHash } from 'node:crypto';

/**
 * Hash markdown section content with canonical line-ending normalization.
 *
 * @param {string[] | string} input - lines (no terminators) or a single string
 * @returns {string} 16-hex SHA-256 prefix of the canonical UTF-8 bytes
 */
export function hashContent(input) {
  const canonical = Array.isArray(input) ? input.join('\n') : String(input).replace(/\r\n/g, '\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}
