// scripts/lib/install-core.js
//
// Plan 07-01. Shared install kernel — consumed by both `bin/testatlas.js init`
// (npx flow) and top-level `install.js` (git-clone flow). Real implementation
// lands in Task 2; Task 1 publishes the contract so the entry-point modules
// can import it.

/**
 * @typedef {Object} RunInitOptions
 * @property {string} target            Absolute path of the install target repo.
 * @property {string} suiteRoot         Absolute path of the suite package root
 *                                      (the dir containing `.testatlas/`).
 * @property {boolean} [allAdapters]    Install every adapter regardless of detection.
 * @property {boolean} [force]          Remove existing `.testatlas/` and reinstall.
 * @property {boolean} [noUpdateCheck]  Skip GitHub Releases version probe.
 * @property {boolean} [dryRun]         Print plan, do not write.
 */

/**
 * @typedef {Object} RunInitResult
 * @property {'installed'|'already-installed'|'forced'|'dry-run'} status
 * @property {number} filesWritten
 * @property {string[]} adapters
 */

/**
 * Run the install kernel.
 *
 * Stub in Task 1 — real impl lands in Task 2.
 *
 * @param {RunInitOptions} _opts
 * @returns {Promise<RunInitResult>}
 */
export async function runInit(_opts) {
  throw new Error('install-core.runInit: not yet implemented (Task 2 lands the kernel)');
}
