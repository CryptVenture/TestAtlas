// scripts/lib/canonical-names.js
//
// Quick 260508-u72 (Round-13 follow-up) — INV-K product-name-canonicalization
// dictionary. Authoritative spelling for product / technology names that
// appear in command bodies. The map key is the lowercase form; the value
// is the canonical spelling that must be used.
//
// To add a new entry:
//   1. Add `'lower form': 'CanonicalForm'` to CANONICAL_NAMES below.
//   2. Run `node scripts/lint-commands.js` to surface drift in existing
//      command bodies.
//   3. Fix the drift in the same commit per the standing convention.
//
// Other tools may import this map; keep it pure data with no side
// effects.

export const CANONICAL_NAMES = Object.freeze({
  'cloud scheduler': 'Cloud Scheduler',
  'aws lambda': 'AWS Lambda',
  'github actions': 'GitHub Actions',
  'json schema': 'JSON Schema',
  'open api': 'OpenAPI',
  graphql: 'GraphQL',
  'rest api': 'REST API',
  kubernetes: 'Kubernetes',
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  redis: 'Redis',
  docker: 'Docker',
  kafka: 'Kafka',
  rabbitmq: 'RabbitMQ',
});

/**
 * Build a regex that matches any of the canonical names case-insensitively.
 * Each match yields the matched substring (so callers can compare its
 * literal case against the canonical form).
 *
 * @returns {RegExp}
 */
export function buildCanonicalNameRegex() {
  // Sort keys longest-first so e.g. "rest api" wins over "rest" if a
  // future single-word entry is added.
  const keys = Object.keys(CANONICAL_NAMES).sort((a, b) => b.length - a.length);
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // \b boundaries on each side. Use a non-capturing alternation. Allow a
  // single ASCII space inside the matched form (already part of the keys).
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');
}
