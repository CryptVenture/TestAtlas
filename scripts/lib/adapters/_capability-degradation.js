// scripts/lib/adapters/_capability-degradation.js
//
// Plan 06-01 Task 2: canonical capability-degradation prose template.
//
// When a command requires a capability the adapter does NOT declare in
// adapter-capabilities.json, the renderer appends this block to the
// rendered body. The wording is centralized here so every adapter (Aider,
// Cursor, MCP, Generic) emits the same prose — which makes the Phase 8
// Aider example workspace's "needs-validation" findings deterministic and
// reviewable.
//
// Source: 06-RESEARCH.md §Q6.2 ("Canonical degradation prose").

/**
 * Compute the missing capabilities and, if any, return the canonical
 * degradation prose block. Returns `''` (empty string) when the command's
 * capabilities are a subset of the adapter's — i.e., no degradation needed.
 *
 * @param {{ commandCaps: string[], adapterCaps: string[] }} opts
 * @returns {string}
 */
export function renderDegradationBlock({ commandCaps, adapterCaps }) {
  const adapterSet = new Set(adapterCaps);
  const missing = commandCaps.filter((c) => !adapterSet.has(c));
  if (missing.length === 0) return '';

  const requiredList = commandCaps.map((c) => `\`${c}\``).join(', ');
  const missingList = missing.map((c) => `\`${c}\``).join(', ');
  const missingClause = missing.length === 1 ? `${missing[0]} is` : `${missing.join(' or ')} are`;

  return [
    '## Capability Degradation',
    '',
    `Required capabilities for this command: ${requiredList}.`,
    `Missing in this adapter: ${missingList}.`,
    '',
    `**If ${missingClause} unavailable in this environment:**`,
    '',
    '- Do NOT fabricate screenshots, DOM snapshots, network captures, or console logs.',
    '- Read source artifacts statically: HTML/JSX/TSX/Vue/Svelte component files, framework routing conventions (React Router / Next.js / Remix), CSS/Tailwind utility usage, ARIA attributes in JSX.',
    '- Infer route inventory and component tree from code; mark each finding `confidence: needs-validation` per `.testatlas/bootstrap.md` §4 (capability-aware degradation) and §8 (no evidence, no finding).',
    "- Surface the missing capability in the `RUN-<timestamp>.json`'s `capabilities_observed` field so the next agent run with the missing capability can revisit and upgrade confidence.",
    '- Issue findings produced under degradation MUST set `confidence: needs-validation` regardless of severity.',
    '',
    'This degradation rule is non-negotiable. If you cannot honestly produce a finding, do not produce one — see `.testatlas/bootstrap.md` §8.',
    '',
  ].join('\n');
}
