// scripts/lib/determinism.js
//
// Plan 08-01. Determinism env-var contract for example regeneration.
//
// Canonical environment variables (FROZEN — used in plans 08-02..05 too):
//
//   TESTATLAS_DETERMINISTIC=1
//     Switches every Phase 5 emitter (create-issue, create-flow, create-domain,
//     create-evidence-record, update-indexes, sync-status, summarize-run,
//     generate-report) into deterministic mode: byte-identical output across
//     repeated runs given the same inputs.
//
//   TESTATLAS_FIXED_TIMESTAMP=<ISO-8601>
//     When set (regardless of TESTATLAS_DETERMINISTIC), now() returns this
//     literal string instead of `new Date().toISOString()`. Default for the
//     example regeneration framework: 2026-05-03T00:00:00.000Z.
//
//   TESTATLAS_SUITE_VERSION=<semver>
//     Pin for any embedded version markers. Optional — most artifacts don't
//     embed the suite version directly. Reserved for future cross-cutting use.
//
// Backwards compatibility: when none of these env vars are set, every helper
// behaves identically to the pre-Phase-8 implementation (new Date(),
// crypto.randomUUID(), unsorted readdir as appropriate). This file is the
// canonical doc location for the contract.

import { createHash, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';

/** True iff `process.env.TESTATLAS_DETERMINISTIC === '1'`. */
export function isDeterministic() {
  return process.env.TESTATLAS_DETERMINISTIC === '1';
}

/**
 * Return a fixed ISO timestamp when TESTATLAS_FIXED_TIMESTAMP is set, else the
 * current wall-clock as ISO-8601. Honors the env var REGARDLESS of
 * TESTATLAS_DETERMINISTIC — fixed-timestamp can be used independently.
 *
 * @returns {string}
 */
export function now() {
  return process.env.TESTATLAS_FIXED_TIMESTAMP || new Date().toISOString();
}

/**
 * Return a 32-hex-char ID. When TESTATLAS_DETERMINISTIC=1 AND a non-empty
 * `seed` is given, derive the ID from SHA-256(seed) (first 32 chars).
 * Otherwise call `crypto.randomUUID()` (returns a UUID v4 string — 36 chars).
 *
 * Note the asymmetric output shapes are intentional: callers in deterministic
 * mode pass a stable seed and expect a stable hex; callers in non-deterministic
 * mode never compare IDs cross-run, so UUID format is fine.
 *
 * @param {string|number|null|undefined} seed
 * @returns {string}
 */
export function uuid(seed) {
  if (isDeterministic() && seed != null && seed !== '') {
    return createHash('sha256').update(String(seed)).digest('hex').slice(0, 32);
  }
  return randomUUID();
}

/**
 * Read a directory and return entries (string names or Dirent objects)
 * sorted lexicographically by name. Honors any `readdir` options (e.g.
 * `{ withFileTypes: true }`).
 *
 * The returned array is ALWAYS sorted, regardless of TESTATLAS_DETERMINISTIC —
 * deterministic-by-default for callers, since unsorted enumeration is a
 * platform-specific source of drift even outside the regeneration framework.
 *
 * @param {string} dir
 * @param {object} [opts]
 * @returns {Promise<Array<string | import('node:fs').Dirent>>}
 */
export async function sortedReaddir(dir, opts = {}) {
  const entries = await readdir(dir, opts);
  return entries.sort((a, b) => {
    const na = typeof a === 'string' ? a : a.name;
    const nb = typeof b === 'string' ? b : b.name;
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });
}
