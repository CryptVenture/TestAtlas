// test/scripts/safety-callsite-coverage.test.js
//
// Plan 11-04 Task 1 (RED). Static-scan invariant: every destructive primitive
// in scripts/** (excluding scripts/e2e/, comments, import lines, *.test.js)
// MUST have a preceding `assertCapability` reference within 20 source lines.
//
// At RED time ~20 callsites are unguarded; the test enumerates them in the
// failure message. Task 2 wires guards at every callsite and turns this GREEN.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPTS_DIR = 'scripts';

// Destructive primitive patterns (regex on raw source — no AST).
//   - fs.rm/fs.unlink/fs.cp method-form
//   - bare rm(/unlink( / cp({...force...}) when imported from node:fs/promises
//   - spawn/spawnSync/execFile/execFileSync
//
// We anchor each "bare-name" form to typical call sites — `await rm(`, `= rm(`,
// `(rm(` or start-of-line whitespace. This avoids matching prose inside
// template literals (e.g. "fallback to .testatlas/ rm (…)").
const CALL_PREFIX = '(?:^|\\s+await\\s+|[=,(\\[]\\s*)';
const DESTRUCTIVE_RE = [
  /\bfs\.(?:rm|unlink|cp)\s*\(/,
  new RegExp(`${CALL_PREFIX}_?rm\\s*\\(`),
  new RegExp(`${CALL_PREFIX}_?unlink\\s*\\(`),
  /\bcp\s*\([^)]*\bforce\b/,
  /\bspawn(?:Sync)?\s*\(/,
  /\bexecFile(?:Sync)?\s*\(/,
];

// Lines we never scan as destructive callsites.
const SKIP_LINE_RE = /^\s*(\*|\/\/|import\b|\*\/|export\s+\{)/;

/**
 * Recursively list `.js` files under `scripts/`, excluding e2e harness files
 * (those run with --allow-destructive in CI by design) and *.test.js.
 *
 * @param {string} [dir]
 * @param {string[]} [out]
 * @returns {Promise<string[]>}
 */
async function listScripts(dir = SCRIPTS_DIR, out = []) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'e2e' || ent.name === 'node_modules') continue;
      await listScripts(full, out);
    } else if (ent.name.endsWith('.js') && !ent.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

test('every destructive callsite in scripts/ is preceded by assertCapability within 20 lines', async () => {
  const failures = [];
  for (const f of await listScripts()) {
    const text = await readFile(f, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (SKIP_LINE_RE.test(line)) continue;
      let isDestructive = false;
      for (const re of DESTRUCTIVE_RE) {
        if (re.test(line)) {
          isDestructive = true;
          break;
        }
      }
      if (!isDestructive) continue;
      // Look back 20 lines for an assertCapability reference.
      const window = lines.slice(Math.max(0, i - 20), i).join('\n');
      if (!/\bassertCapability\b/.test(window)) {
        failures.push(`${f}:${i + 1}  ${line.trim().slice(0, 80)}`);
      }
    }
  }
  assert.equal(
    failures.length,
    0,
    `Unguarded destructive callsites (each requires an assertCapability reference within 20 lines):\n  ${failures.join('\n  ')}`,
  );
});
