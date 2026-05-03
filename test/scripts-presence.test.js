// test/scripts-presence.test.js
//
// Plan 05-01 owns this file EXCLUSIVELY. It carries the FINAL expected list of
// 11 NEW Phase 5 utility scripts (PRD §22 + SCR-01). No later plan modifies
// this test — as Plans 05-02 and 05-03 ship their scripts, the relevant
// fs.access checks flip from failing → passing without any test edits.
//
// Until Plans 05-02 and 05-03 ship, the four assertions for `validate-workspace`
// (05-02), `generate-report`, `check-stale-docs`, and `normalize-slugs` (05-03)
// will FAIL. That is BY DESIGN: the failure message names the missing script,
// giving downstream plans a clean target without creating a circular dep.

import { strict as assert } from 'node:assert';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The 11 NEW Phase 5 scripts. Order is intentionally the §22 listing order so
 * the failure output reads naturally to a human scanning a CI log.
 *
 *   05-01 (this plan):   update-indexes, create-issue, create-flow, create-domain,
 *                        create-evidence-record, summarize-run, sync-status   (7)
 *   05-02:               validate-workspace                                   (1)
 *   05-03:               generate-report, check-stale-docs, normalize-slugs   (3)
 */
const EXPECTED_SCRIPTS = [
  'validate-workspace.js', // ships in 05-02
  'update-indexes.js', // ships in 05-01
  'create-issue.js', // ships in 05-01
  'create-flow.js', // ships in 05-01
  'create-domain.js', // ships in 05-01
  'create-evidence-record.js', // ships in 05-01
  'generate-report.js', // ships in 05-03
  'check-stale-docs.js', // ships in 05-03
  'normalize-slugs.js', // ships in 05-03
  'summarize-run.js', // ships in 05-01
  'sync-status.js', // ships in 05-01
];

for (const scriptName of EXPECTED_SCRIPTS) {
  test(`Phase 5 script exists: scripts/${scriptName}`, async () => {
    const scriptPath = path.join(REPO_ROOT, 'scripts', scriptName);
    try {
      await access(scriptPath, constants.F_OK);
    } catch (err) {
      assert.fail(
        `expected scripts/${scriptName} to exist (missing — ship the script in its assigned plan): ${err.code}`,
      );
    }
  });
}
