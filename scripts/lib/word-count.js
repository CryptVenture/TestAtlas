// Pure, tokenizer-free, matches PRD "≤3000 words" wording.
// Used by scripts/check-token-budget.js and forward-compat by Phase 3 + 5 scripts.

/**
 * Count whitespace-separated tokens in `text`. Empty strings → 0.
 * Counts every visible token, including those inside code blocks and HTML
 * comments — that is intentional (anti-pattern: stripping code blocks creates
 * a backdoor for hiding rules; see 01-RESEARCH.md §"Anti-Patterns to Avoid").
 *
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Return the first `n` whitespace-separated tokens of `text`, joined by a single
 * space. Used by tests (first-500 zone) and forward-compat by validate-workspace.
 *
 * @param {string} text
 * @param {number} n
 * @returns {string}
 */
export function firstNWords(text, n) {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}
