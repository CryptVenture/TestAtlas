// scripts/lib/adapter-detect.js
//
// Plan 07-01. Stat-based adapter detection probe.
//
// Per locked decision (RESEARCH §Pattern 2 + Code Example 2): the suite's
// install-time adapter detection scans the target repo for a fixed set of
// signal files/dirs. Any matched signal adds the corresponding adapter; the
// `generic` adapter is ALWAYS added so every install ships with paste-able
// fallback prompts.
//
// This signal table is intentionally NOT colocated with adapter-capabilities.json
// — that file declares per-adapter rendering capabilities, not detection
// heuristics; mixing the two would force Phase 6 to re-roll. Source-of-truth
// for detection lives here only.
//
// Returns: deterministic-ordered Array<adapterName>. Order matches the SIGNALS
// array (claude-code, cursor, aider, kilocode, opencode, mcp), with `generic`
// appended last (so callers can always rely on its position in tests).

import { stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Locked detection signal table. Order is the canonical match order.
 * @type {ReadonlyArray<{adapter: string, paths: string[]}>}
 */
export const SIGNALS = Object.freeze([
  { adapter: 'claude-code', paths: ['.claude/', 'CLAUDE.md'] },
  { adapter: 'cursor', paths: ['.cursor/rules/', '.cursorrules'] },
  { adapter: 'aider', paths: ['.aider.conf.yml', 'CONVENTIONS.md'] },
  { adapter: 'kilocode', paths: ['.kilo/', '.kilocode/'] },
  { adapter: 'opencode', paths: ['.opencode/'] },
  { adapter: 'mcp', paths: ['mcp-server-manifest.json', '.mcp/'] },
]);

/**
 * Probe a target directory and return matched adapter names.
 *
 * `generic` is ALWAYS included (paste-able prompts fallback per RESEARCH §Pattern 2).
 *
 * @param {string} target Absolute path of the target repo to probe.
 * @returns {Promise<string[]>}
 */
export async function detectAdapters(target) {
  const matched = [];
  for (const { adapter, paths } of SIGNALS) {
    for (const p of paths) {
      try {
        // `stat` follows symlinks but rejects on missing — exactly what we want.
        await stat(path.join(target, p));
        matched.push(adapter);
        break; // one signal per adapter is enough
      } catch {
        // Missing path → keep probing other signals for this adapter.
      }
    }
  }
  // Always include `generic` (deterministic last position).
  matched.push('generic');
  return matched;
}
