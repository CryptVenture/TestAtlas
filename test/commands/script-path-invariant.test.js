// test/commands/script-path-invariant.test.js
//
// Phase 17 Plan 02 (REVIEW-T1-2, REVIEW-INV-B) — regression gate for ISSUE-002.
//
// Invariant B — script-path:
//   Every source command at `.testatlas/commands/**/*.md` MUST NOT have a body
//   that matches the legacy suite-dogfood form `\bnode\s+scripts\/`. Only the
//   universal installed-target form `\bnode\s+\.testatlas\/scripts\/` is
//   permitted in source command bodies.
//
// Why: adapter renderers preserve source command bodies verbatim. The legacy
// form (`node scripts/foo.js`) only works in the suite-dogfood directory; in
// installed targets, scripts live at `.testatlas/scripts/` (no top-level
// `scripts/`). Leaking the legacy form into adapter output breaks every
// installed-target adapter.
//
// Local self-dogfood swap: contributors in this repo run scripts as
// `node scripts/foo.js` directly because `.testatlas/scripts/` doesn't exist
// locally. That swap is a CONTRIBUTOR mental swap (per CLAUDE.md §Self-dogfood)
// and MUST NOT appear in source command bodies.
//
// Test 1 (RED → GREEN): enumerate every source command, assert no script-path
// invariant violations (body must not match legacy `node scripts/`).
// Test 2: positive form check — for any body with a node-script invocation,
// the only matching form must be `node .testatlas/scripts/`.
// Test 3: predicate fixtures — exercise the predicate against canned inputs.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { listCommandFiles } from '../../scripts/lib/list-command-files.js';
import { extractFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

// Canonical regex for legacy suite-dogfood form. Matches `node scripts/...`
// but NOT `node .testatlas/scripts/...` (the leading `.` of `.testatlas/`
// breaks the `\s+scripts/` adjacency).
const LEGACY_NODE_SCRIPT_RE = /\bnode\s+scripts\//;

// Universal installed-target form.
const UNIVERSAL_NODE_SCRIPT_RE = /\bnode\s+\.testatlas\/scripts\//;

// Any node-script invocation (legacy OR universal) — used by Test 2.
const ANY_NODE_SCRIPT_RE = /\bnode\s+(\.testatlas\/)?scripts\//;

/**
 * Pure predicate: returns true when the body contains the legacy
 * `node scripts/` form.
 *
 * @param {string} body
 * @returns {boolean}
 */
export function violatesScriptPathInvariant(body) {
  return LEGACY_NODE_SCRIPT_RE.test(body);
}

test('REVIEW-INV-B: zero source command bodies use legacy `node scripts/` form', async () => {
  const files = await listCommandFiles({ includeCategorized: true });
  assert.ok(files.length > 0, 'expected at least one command file under .testatlas/commands/');

  /** @type {Array<{ file: string, count: number, reason: string }>} */
  const violations = [];
  for (const absPath of files) {
    const text = await readFile(absPath, 'utf8');
    let body;
    try {
      ({ body } = extractFrontmatter(text));
    } catch (_err) {
      // Malformed frontmatter is a different defect class; skip.
      continue;
    }
    const matches = body.match(/\bnode\s+scripts\//g);
    if (matches && matches.length > 0) {
      const rel = path.relative(process.cwd(), absPath);
      violations.push({
        file: rel,
        count: matches.length,
        reason: 'script-path-leaks-suite-form',
      });
    }
  }

  // Detailed diagnostic: name every offending file in the failure message so
  // the fixer (Task 2) can act without re-running this test.
  const detail = violations
    .map((v) => `  - ${v.file} (${v.count} match${v.count === 1 ? '' : 'es'}) [${v.reason}]`)
    .join('\n');
  assert.deepStrictEqual(
    violations,
    [],
    `script-path invariant violated by ${violations.length} source command(s):\n${detail}\n` +
      'Fix: replace `node scripts/<name>.js` with `node .testatlas/scripts/<name>.js` in each body. ' +
      'Local dev mental swap (per CLAUDE.md §Self-dogfood): contributors run `node scripts/<name>.js` directly.',
  );
});

test('REVIEW-INV-B: source bodies with node-script invocations use universal `.testatlas/scripts/` form', async () => {
  const files = await listCommandFiles({ includeCategorized: true });

  /** @type {Array<{ file: string, line: string }>} */
  const wrongForm = [];
  for (const absPath of files) {
    const text = await readFile(absPath, 'utf8');
    let body;
    try {
      ({ body } = extractFrontmatter(text));
    } catch (_err) {
      continue;
    }
    if (!ANY_NODE_SCRIPT_RE.test(body)) continue;
    // For each line that mentions a node-script, assert it matches the
    // universal form.
    const lines = body.split('\n');
    for (const line of lines) {
      if (!ANY_NODE_SCRIPT_RE.test(line)) continue;
      if (!UNIVERSAL_NODE_SCRIPT_RE.test(line) && LEGACY_NODE_SCRIPT_RE.test(line)) {
        const rel = path.relative(process.cwd(), absPath);
        wrongForm.push({ file: rel, line: line.trim() });
      }
    }
  }

  const detail = wrongForm.map((w) => `  - ${w.file}: ${w.line}`).join('\n');
  assert.deepStrictEqual(
    wrongForm,
    [],
    `${wrongForm.length} body line(s) use legacy form instead of universal \`node .testatlas/scripts/\`:\n${detail}`,
  );
});

test('predicate fixtures — violatesScriptPathInvariant returns true/false correctly', () => {
  // Legacy form → violation.
  assert.strictEqual(
    violatesScriptPathInvariant('Run `node scripts/foo.js` to do the thing.'),
    true,
    'body with `node scripts/` form must violate',
  );

  // Universal form → no violation.
  assert.strictEqual(
    violatesScriptPathInvariant('Run `node .testatlas/scripts/foo.js` here.'),
    false,
    'body with `node .testatlas/scripts/` form must not violate',
  );

  // Both forms in same body → still a violation (legacy is present).
  assert.strictEqual(
    violatesScriptPathInvariant(
      'First `node .testatlas/scripts/foo.js` then `node scripts/bar.js` (legacy).',
    ),
    true,
    'body containing legacy form anywhere must violate even if universal form is also present',
  );

  // No script invocation → no violation.
  assert.strictEqual(
    violatesScriptPathInvariant('Pure prose, no scripts.'),
    false,
    'body with no node-script invocation → no violation',
  );

  // Word-boundary respect — `anode scripts/` should NOT match.
  assert.strictEqual(
    violatesScriptPathInvariant('The anode scripts/x.js word should not match.'),
    false,
    '\\bnode\\s+ word boundary must reject "anode"',
  );

  // Multi-space separation tolerated by \s+.
  assert.strictEqual(
    violatesScriptPathInvariant('Try `node   scripts/foo.js` with extra spaces.'),
    true,
    '\\s+ must match multiple spaces between node and scripts/',
  );
});
