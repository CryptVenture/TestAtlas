// test/safety/capability-gate-invariant.test.js
//
// Phase 18-01 (Wave 0 safety hotfix) — regression guard for ISSUE-010 +
// ISSUE-011. Walks every .js file under scripts/ that imports a destructive
// fs primitive (cp / rm / unlink / rename) and asserts that the file ALSO
// references one of the capability helpers (assertCapability /
// requireCapability). The intent is to fail CI loudly the next time someone
// adds a destructive primitive without threading through the safety gate.
//
// The check is deliberately lenient — false positives are addressed via the
// ALLOWLIST below with an explicit justification. Files in the allowlist
// either:
//   (a) define the helper themselves (safety.js), OR
//   (b) implement a documented log-and-skip / best-effort cleanup pattern
//       that is reachable only through a gated entry point.
//
// Adding a new entry to ALLOWLIST WITHOUT a justification comment is a
// review red flag; the helper-call path is preferred.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_ROOT = path.resolve(__dirname, '..', '..', 'scripts');

// POSIX-relative paths under scripts/. Files here are EXEMPT from the
// "must call a capability helper" assertion. Each entry must carry a
// justification comment.
const ALLOWLIST = new Set([
  // safety.js itself defines assertCapability / requireCapability — the
  // helpers can't depend on themselves.
  'lib/safety.js',
  // e2e/run-node-api-graph.js — test-only harness; operates on a tmpdir() it
  // creates and tears down. Not reachable from user-facing commands. Phase 19
  // (this allowlist) made the exemption permanent and added an in-file
  // SAFETY-EXEMPT annotation block at the top of the script for traceability.
  // See scripts/e2e/run-node-api-graph.js header comment.
  'e2e/run-node-api-graph.js',
  // lib/copy-v2-artifacts.js — internal helper used only by init-workspace.js
  // and v2-migrate.js, both of which call assertCapability at their entry
  // points BEFORE any I/O reaches this helper. Threading capability checks
  // through the helper would duplicate the gate without adding safety. The
  // helper is also defensive: it stat-checks each source path, mkdirs only the
  // target subtree it owns under _testatlas/, and uses cp() which respects
  // node:fs/promises path-traversal rules. (Quick 260509-pdr.)
  'lib/copy-v2-artifacts.js',
]);

async function* walk(dir, base = dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (e.isDirectory()) {
      yield* walk(full, base);
    } else if (e.name.endsWith('.js')) {
      yield rel;
    }
  }
}

// Detect destructive-fs usage at the import + call level. The regex is
// permissive on whitespace and accepts both `import { rm } from 'node:fs/promises'`
// and `import * as fs from 'node:fs/promises'` followed by `fs.rm(...)`.
function importsDestructive(src) {
  // Direct named import from node:fs/promises (or 'node:fs').
  const importRe =
    /import\s*\{[^}]*\b(cp|rm|unlink|rename)\b[^}]*\}\s*from\s*['"]node:fs(?:\/promises)?['"]/;
  if (importRe.test(src)) return true;
  // Aliased import then call as fs.rm / fs.cp etc.
  const starRe = /import\s*\*\s*as\s+(\w+)\s*from\s*['"]node:fs(?:\/promises)?['"]/;
  const m = starRe.exec(src);
  if (m) {
    const ns = m[1];
    const callRe = new RegExp(`\\b${ns}\\.(cp|rm|unlink|rename)\\s*\\(`);
    if (callRe.test(src)) return true;
  }
  return false;
}

function callsHelper(src) {
  return /\b(assertCapability|requireCapability)\s*\(/.test(src);
}

test('every script touching cp/rm/unlink/rename calls a capability helper', async () => {
  const offenders = [];
  for await (const rel of walk(SCRIPTS_ROOT)) {
    if (ALLOWLIST.has(rel)) continue;
    const src = await readFile(path.join(SCRIPTS_ROOT, rel), 'utf8');
    if (!importsDestructive(src)) continue;
    if (!callsHelper(src)) {
      offenders.push(rel);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `These scripts use destructive fs primitives without a capability helper:\n  - ${offenders.join('\n  - ')}\n\nEither (a) thread through assertCapability/requireCapability at the entry point, or (b) add the file to ALLOWLIST in this test with a written justification.`,
  );
});

// Sanity: the freshly-fixed scripts MUST be on the helper-call path.
test('scripts/v2-migrate.js calls assertCapability (ISSUE-010 regression guard)', async () => {
  const src = await readFile(path.join(SCRIPTS_ROOT, 'v2-migrate.js'), 'utf8');
  assert.match(src, /assertCapability\s*\(/);
  assert.match(src, /if\s*\(\s*!gate\.allowed\s*\)/);
});

test('scripts/lib/update-core.js calls requireCapability (ISSUE-011 regression guard)', async () => {
  const src = await readFile(path.join(SCRIPTS_ROOT, 'lib', 'update-core.js'), 'utf8');
  assert.match(src, /import\s*\{[^}]*\brequireCapability\b/);
  assert.match(src, /requireCapability\s*\(\s*config\s*,\s*['"]destructive-fs['"]\s*\)/);
});

test('scripts/normalize-slugs.js calls requireCapability (Phase 19 B1 regression guard)', async () => {
  const src = await readFile(path.join(SCRIPTS_ROOT, 'normalize-slugs.js'), 'utf8');
  assert.match(src, /import\s*\{[^}]*\brequireCapability\b/);
  assert.match(src, /requireCapability\s*\(\s*config\s*,\s*['"]destructive-fs['"]\s*\)/);
});
