// scripts/lib/slug.js
//
// PRD §32 ID/slug helpers. The ID_PATTERNS regex sources MUST stay
// byte-identical to .testatlas/schemas/vocabulary.schema.json $defs.<id>.pattern;
// test/slug.test.js asserts this on every run, so drift fails CI.
//
// All slugs are kebab-case: ^[a-z0-9]+(-[a-z0-9]+)*$
// (one or more lowercase-alphanumeric tokens joined by single hyphens;
// no leading/trailing hyphen; no double hyphens).

/**
 * Canonical kebab-slug regex (matches vocabulary.schema.json $defs.kebabSlug.pattern).
 */
export const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Type-safe slug check.
 *
 * @param {unknown} s
 * @returns {boolean}
 */
export function isKebabSlug(s) {
  return typeof s === 'string' && KEBAB_RE.test(s);
}

/**
 * Normalize an arbitrary string into a kebab-case slug:
 *   - lowercase
 *   - strip diacritics (NFKD + combining-mark removal)
 *   - replace runs of non-alphanumeric chars with a single hyphen
 *   - collapse multiple hyphens
 *   - trim leading/trailing hyphens
 *
 * @param {unknown} input
 * @returns {string}
 */
export function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritic combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Zero-pad a numeric ID. Defaults to 3-digit width per PRD §32 (`ISSUE-001-...`).
 * Numbers wider than `width` are returned unmodified (still valid against the
 * `\d{3,}` pattern in vocabulary.schema.json).
 *
 * @param {number | string} n
 * @param {number} [width=3]
 * @returns {string}
 */
export function padIssueNumber(n, width = 3) {
  return String(n).padStart(width, '0');
}

/**
 * ID validators per PRD §32. Each `.source` is byte-identical to the
 * matching `vocabulary.schema.json` `$defs.<id>.pattern` — kept in sync by
 * the WORK-05 schema-helper-sync test.
 */
export const ID_PATTERNS = {
  domain: /^domain-[a-z0-9]+(-[a-z0-9]+)*$/,
  flow: /^FLOW-[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]+(-[a-z0-9]+)*$/,
  test: /^TEST-[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]+(-[a-z0-9]+)*$/,
  issue: /^ISSUE-\d{3,}-[a-z0-9]+(-[a-z0-9]+)*$/,
  evidence: /^EVIDENCE-\d{3,}(-[a-z0-9]+(-[a-z0-9]+)*)?$/,
  page: /^PAGE-[a-z0-9]+(-[a-z0-9]+)*$/,
  api: /^API-(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)-[a-z0-9-]+$/,
  cli: /^CLI-[a-z0-9]+(-[a-z0-9]+)*$/,
  component: /^COMPONENT-[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]+(-[a-z0-9]+)*$/,
  job: /^JOB-[a-z0-9]+(-[a-z0-9]+)*$/,
  integration: /^INTEGRATION-[a-z0-9]+(-[a-z0-9]+)*$/,
  persona: /^PERSONA-[a-z0-9]+(-[a-z0-9]+)*$/,
};
