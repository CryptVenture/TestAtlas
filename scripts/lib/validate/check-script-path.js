// scripts/lib/validate/check-script-path.js
//
// Phase 17 Plan 02 — REVIEW-INV-B.
//
// Suite-build invariant: every source command at `.testatlas/commands/**/*.md`
// MUST NOT have a body that matches the legacy suite-dogfood form
// `\bnode\s+scripts\/`. Only the universal installed-target form
// `\bnode\s+\.testatlas\/scripts\/` is permitted in source command bodies.
//
// Why this exists:
//   - Adapter renderers (`scripts/lib/adapters/render-*.js`) preserve source
//     command bodies verbatim. The legacy `node scripts/<name>.js` form only
//     resolves in the suite-dogfood directory; in installed targets, scripts
//     live at `.testatlas/scripts/` and the top-level `scripts/` directory
//     does not exist. Leaking the legacy form into adapter output breaks
//     every installed-target adapter run.
//   - Phase 17 ISSUE-002 (review §1 line 79-92) locked Option A: standardize
//     all source bodies on the universal form. This invariant is the
//     suite-build gate that catches future regressions.
//
// Local self-dogfood swap (per CLAUDE.md §Self-dogfood):
//   Contributors in the source repo run `node scripts/<name>.js` directly
//   because `.testatlas/scripts/` doesn't exist locally. That swap is a
//   contributor mental swap, NOT something that may appear in source command
//   bodies.
//
// Regex specificity: `/\bnode\s+scripts\//` matches `node scripts/foo` but
// NOT `node .testatlas/scripts/foo` because the latter has `.testatlas/`
// between `node ` and `scripts/`, breaking the `\s+scripts\/` adjacency.
//
// Scope: this check only finds source command files when
// `<cwd>/.testatlas/commands/` exists (i.e. suite-self runs or installed
// targets that have authored their own commands). Targets without a commands
// dir get a trivial pass.
//
// Findings:
//   TESTATLAS_SCRIPT_PATH_LEAKS_SUITE_FORM — severity 'error', fixable null.
//   reason code: `script-path-leaks-suite-form`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listCommandFiles } from '../list-command-files.js';
import { extractFrontmatter } from '../parse-frontmatter.js';

export const id = 'check-script-path';
// Sibling invariant to PHASE17-INV-A (check-shell-capability). Same numeric
// space outside PRD §33's range so reporters distinguish Phase 17 invariants
// from the original 10-check baseline.
export const prdRule = 'PHASE17-INV-B';

// Matches the legacy suite-dogfood form. The leading `\b` + `\s+` after `node`
// keeps `anode scripts/` and `noden scripts/` from matching. The lack of an
// optional `(\.testatlas\/)?` group is deliberate — this regex catches ONLY
// the bad form, not the good form. (Mirrors test/commands/script-path-invariant.test.js.)
const LEGACY_NODE_SCRIPT_RE = /\bnode\s+scripts\//g;

// Hint text emitted with each finding. Captures both the fix instruction AND
// the script-path-leaks-suite-form reason that downstream tooling greps for.
const REMEDIATION_HINT =
  'Use `node .testatlas/scripts/<name>.js` (universal installed-target form). ' +
  'Local source dev runs `node scripts/<name>.js` via mental swap (CLAUDE.md §Self-dogfood). ' +
  'Reason: script-path-leaks-suite-form.';

/**
 * @param {{ wsDir?: string, config?: object }} ctx
 * @returns {Promise<{ id: string, prdRule: string, status: 'pass' | 'fail', findings: object[] }>}
 */
export async function check(ctx) {
  // Re-derive cwd from wsDir same way check-shell-capability does. The suite
  // root is the parent of `_testatlas/`, which is also where `.testatlas/`
  // lives. Falls back to process.cwd() when wsDir is absent (e.g. some test
  // harnesses).
  const cwd = ctx.wsDir ? path.dirname(ctx.wsDir) : process.cwd();
  const suiteCommandsRoot = path.join(cwd, '.testatlas', 'commands');

  let files;
  try {
    files = await listCommandFiles({ cwd, includeCategorized: true });
  } catch (err) {
    return {
      id,
      prdRule,
      status: 'fail',
      findings: [
        {
          severity: 'error',
          path: suiteCommandsRoot,
          code: 'TESTATLAS_SCRIPT_PATH_ENUMERATION_FAILED',
          message: `Could not enumerate command source files under ${suiteCommandsRoot}: ${err.message}`,
          fixable: null,
        },
      ],
    };
  }

  if (files.length === 0) {
    return { id, prdRule, status: 'pass', findings: [] };
  }

  /** @type {object[]} */
  const findings = [];
  for (const absPath of files) {
    let text;
    try {
      text = await readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    let body;
    try {
      ({ body } = extractFrontmatter(text));
    } catch {
      // CMD-04 / check-schemas owns malformed-frontmatter surface.
      continue;
    }
    const matches = body.match(LEGACY_NODE_SCRIPT_RE);
    if (!matches || matches.length === 0) continue;

    const relPath = path.relative(cwd, absPath).split(path.sep).join('/');
    findings.push({
      severity: 'error',
      path: relPath,
      code: 'TESTATLAS_SCRIPT_PATH_LEAKS_SUITE_FORM',
      reason: 'script-path-leaks-suite-form',
      count: matches.length,
      message:
        `Source command ${relPath} body contains ${matches.length} occurrence(s) of legacy ` +
        '`node scripts/...` form. Adapter renderers preserve bodies verbatim, so this leaks the ' +
        'suite-dogfood path into installed-target adapter output where `scripts/` does not exist.',
      fixable: null,
      fixDescription: REMEDIATION_HINT,
    });
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
