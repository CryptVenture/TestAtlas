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
//   - Return the full 64 hex chars: `.digest('hex')` (widened in Phase 11 —
//     was `.slice(0, 16)`; closes ISSUE-013, see 11-CONTEXT.md LOCKED
//     decisions). Legacy 16-char manifests are accepted via the
//     `verifyHashCompat` helper below.
//
// Rationale (from .planning/phases/02-schemas-templates-workspace-skeleton/02-RESEARCH.md
// §"Pattern 4: Content-Hash Contract"):
//   - Marker lines are excluded from the hash so trivial spacing tweaks around
//     markers don't invalidate the hash.
//   - CRLF is normalized so a Windows checkout and a POSIX checkout of the same
//     file produce the same hash.
//   - Trailing whitespace is preserved because two trailing spaces is a hard
//     line break in markdown — semantically meaningful content.
//
// Phase 11 (ISSUE-013 — manifest hash widening):
//   - The 16→64 char widening eliminates the targeted-attacker collision risk
//     (64 bits → 256 bits). The SHA-256 computation is unchanged; the slice
//     was simply removed.
//   - Backwards compatibility is preserved via `verifyHashCompat` which
//     length-detects the known hash and compares the first 16 chars of a
//     fresh hash to legacy 16-char hashes, full hash for modern 64-char
//     hashes. Auto-upgrade of legacy hashes is OUT-OF-SCOPE — manifests
//     upgrade organically when users re-run `testatlas update` or
//     `testatlas init --force`.
//   - Manifest body signing (the other half of ISSUE-013) is DEFERRED to a
//     future phase; recorded in 11-CONTEXT.md "Deferred Ideas".

import { createHash } from 'node:crypto';

/**
 * Hash markdown section content with canonical line-ending normalization.
 *
 * @param {string[] | string} input - lines (no terminators) or a single string
 * @returns {string} 64-hex SHA-256 of the canonical UTF-8 bytes (widened from
 *   16 in Phase 11; first 16 chars equal the pre-Phase-11 output, so legacy
 *   16-char manifests still validate via {@link verifyHashCompat})
 */
export function hashContent(input) {
  const canonical = Array.isArray(input) ? input.join('\n') : String(input).replace(/\r\n/g, '\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Verify that `input` content matches a known hash, with backward
 * compatibility for pre-Phase-11 manifests that stored 16-hex-char (64-bit)
 * prefixes instead of full 64-hex-char (256-bit) SHA-256 digests.
 *
 * Length-detection rules (per 11-CONTEXT.md ISSUE-013 LOCKED decisions):
 *   - 64 chars → full SHA-256 comparison (modern manifests, Phase-11+).
 *   - 16 chars → compare known hash to FIRST 16 chars of fresh full hash
 *                (legacy manifest path, organic-upgrade compat).
 *   - any other length, or non-string → false (malformed; reject conservatively
 *                so callers can surface manifest corruption rather than
 *                silently truncating-and-comparing).
 *
 * Auto-upgrade of legacy hashes is intentionally OUT-OF-SCOPE for Phase 11
 * (see 11-CONTEXT.md "Deferred Ideas"). Manifests upgrade organically when
 * users re-run `testatlas update` or `testatlas init --force`, at which point
 * the writer side calls `hashContent` and stores the widened 64-char value.
 *
 * @param {string[] | string} input  - canonical content to verify
 * @param {string} knownHash         - expected hash from manifest (16 or 64 hex chars)
 * @returns {boolean}                - true iff content matches knownHash under the appropriate path
 */
export function verifyHashCompat(input, knownHash) {
  if (typeof knownHash !== 'string') return false;
  const fresh = hashContent(input);
  if (knownHash.length === 64) return fresh === knownHash;
  if (knownHash.length === 16) return fresh.slice(0, 16) === knownHash;
  return false;
}
