// test/_helpers/repo-local-state.js
//
// Skip-if-missing guard for tests that read suite-author-local state.
//
// Some tests verify the suite author's own working-tree state — files
// that are intentionally gitignored (e.g. `.planning/REQUIREMENTS.md`,
// `CLAUDE.md`, `_testatlas/brain/*`, `_testatlas/bootstrap/*`,
// `_testatlas/agents/registry.json`). Locally the author has these on
// disk, so the test verifies real content. On a fresh CI checkout the
// files don't exist and `readFile` throws ENOENT, failing the test
// for the wrong reason.
//
// `skipIfMissing(t, p)` reads-stat's `p`; if absent, marks the test
// skipped with an informative reason and returns `false` (the caller
// should `return` immediately). If present, returns `true` and the
// test proceeds. The reason is included verbatim in test reporter
// output so anyone reading CI logs understands why the test was
// skipped on the fresh checkout.

import { stat } from 'node:fs/promises';

/**
 * @param {{ skip: (reason?: string) => void }} t  node:test TestContext
 * @param {string} p  absolute path to a file or directory that must exist
 * @param {string} [why]  optional clarifying context appended to the skip reason
 * @returns {Promise<boolean>}  true if the path exists; false (and skipped) otherwise
 */
export async function skipIfMissing(t, p, why) {
  try {
    await stat(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') {
      const reason =
        `${p} not present — test verifies suite-author dogfood state ` +
        `that is gitignored and absent on fresh CI checkouts.` +
        (why ? ` ${why}` : '');
      t.skip(reason);
      return false;
    }
    throw e;
  }
}
