// scripts/lib/migrate.js
//
// Plan 07-03 — workspace migration framework (UPDATE-05).
//
// Real implementation lands in Task 2; this Task 1 scaffold throws so any
// unexpected import path triggers a clear failure rather than silent no-op.

/**
 * @typedef {Object} MigrationDescriptor
 * @property {string} file
 * @property {number} fromSchema
 * @property {number} toSchema
 * @property {string} [description]
 */

const NOT_YET = 'scripts/lib/migrate.js: not yet implemented (Task 2 lands the runner)';

/**
 * Scaffold; Task 2 implements.
 * @param {string} _migrationsDir
 * @returns {Promise<MigrationDescriptor[]>}
 */
export async function discoverMigrations(_migrationsDir) {
  throw new Error(NOT_YET);
}

/**
 * Scaffold; Task 2 implements.
 * @param {{
 *   target: string,
 *   fromVersion: string,
 *   toVersion: string,
 *   migrationsDir: string,
 * }} _opts
 */
export async function applyMigrations(_opts) {
  throw new Error(NOT_YET);
}
