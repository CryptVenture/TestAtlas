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
// array (canonical 6 first, then the 11 expanded entries appended in
// alphabetical order for stable behavior), with `generic` appended last (so
// callers can always rely on its position in tests).
//
// SIGNALS covers all 18 capability adapters declared in
// `.testatlas/adapters/adapter-capabilities.json` minus `generic` (which is
// always appended unconditionally). Each entry's `paths` list is checked in
// order; the first match wins for that adapter and de-duplicates across paths.

import { stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Locked detection signal table. Order is the canonical match order:
 *   1. The 6 original adapters in their historical order (claude-code, cursor,
 *      aider, kilocode, opencode, mcp).
 *   2. The 11 expanded adapters in alphabetical order (amazon-q, cline, codex,
 *      continue-dev, gemini-cli, github-copilot, kiro, roo-code, sourcegraph-amp,
 *      windsurf, zed).
 * `generic` is NOT in this table — detectAdapters() always appends it last.
 *
 * @type {ReadonlyArray<{adapter: string, paths: string[]}>}
 */
export const SIGNALS = Object.freeze([
  // Original 6 — preserve order for backwards-compatible match results.
  { adapter: 'claude-code', paths: ['.claude/', 'CLAUDE.md'] },
  { adapter: 'cursor', paths: ['.cursor/rules/', '.cursorrules'] },
  { adapter: 'aider', paths: ['.aider.conf.yml', 'CONVENTIONS.md'] },
  { adapter: 'kilocode', paths: ['.kilo/', '.kilocode/'] },
  { adapter: 'opencode', paths: ['.opencode/'] },
  { adapter: 'mcp', paths: ['mcp-server-manifest.json', '.mcp/'] },
  // Expanded 11 — alphabetical. Each adapter's first path mirrors the
  // canonical install dir from adapter-capabilities.json's outputPattern.
  { adapter: 'amazon-q', paths: ['.amazonq/', '.amazonq/rules/'] },
  { adapter: 'cline', paths: ['.clinerules/', '.clinerules/workflows/'] },
  { adapter: 'codex', paths: ['.codex/', '.codex/prompts/'] },
  { adapter: 'continue-dev', paths: ['.continue/', '.continue/prompts/'] },
  { adapter: 'gemini-cli', paths: ['.gemini/', '.gemini/commands/'] },
  { adapter: 'github-copilot', paths: ['.github/copilot/', '.github/prompts/'] },
  { adapter: 'kiro', paths: ['.kiro/', '.kiro/skills/'] },
  { adapter: 'roo-code', paths: ['.roo/', '.roo/rules/'] },
  { adapter: 'sourcegraph-amp', paths: ['.agents/', 'AGENTS.md'] },
  { adapter: 'windsurf', paths: ['.windsurf/', '.windsurf/workflows/'] },
  { adapter: 'zed', paths: ['.zed/', '.rules'] },
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
