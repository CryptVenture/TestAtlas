// scripts/lib/adapters/_shared.js
//
// Shared primitives for every adapter renderer (Plan 06-01 Task 2):
//   - BOOTSTRAP_PREAMBLE: the verbatim PRD §23 line that every derived
//     adapter command file MUST begin its body with.
//   - wrapInAdapterEnvelope / parseAdapterMarker: the marker-bound envelope
//     that lets the parity gate (Plan 06-02) detect hand-edits to derived
//     files via a 16-hex SHA-256 prefix of the source text.
//   - capsToTools: deterministic mapping from TestAtlas capability vocab to
//     Claude Code's `allowed-tools` list. Other adapters (Plans 06-03, 06-04)
//     ship their own mappings if needed.
//   - serializeFrontmatter: insertion-order, inline-array YAML emitter used
//     by every renderer for byte-stable output.
//
// IMPORTANT: NO timestamps, NO suite-version reads, NO absolute paths in any
// output. The renderer is a pure function of (sourceText, sourcePath-relative
// to .testatlas/) — Pitfall 3 in 06-RESEARCH.md.

import { hashContent } from '../content-hash.js';

// PRD §23 verbatim — DO NOT modify without bumping the workspace-manifest
// schema version. The string below matches /root/TestAtlas/prd/prd.md line
// 2195 exactly, byte-for-byte. Test 1 of test/capability-degradation.test.js
// asserts this invariant.
export const BOOTSTRAP_PREAMBLE =
  'First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. ' +
  'If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.';

const ADAPTER_START_RE =
  /<!--\s*TESTATLAS:GENERATED:START\s+section="([^"]+)"\s+source="([^"]+)"\s+hash="([0-9a-f]{16})"\s*-->/;

/**
 * Compute the relative source path used inside the marker (e.g.
 * `commands/init.md`) by stripping everything before the first `.testatlas/`
 * segment of an absolute path.
 *
 * @param {string} sourcePath
 * @returns {string}
 */
function toRelSource(sourcePath) {
  const idx = sourcePath.lastIndexOf('.testatlas/');
  if (idx === -1) return sourcePath;
  return sourcePath.slice(idx + '.testatlas/'.length);
}

/**
 * Wrap `body` in a TESTATLAS:GENERATED envelope. The hash is computed over
 * the FULL source text — that's what the parity gate (Plan 06-02) compares
 * against on regen to detect hand-edits in derived files.
 *
 * Output format (terminating newline included):
 *   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
 *   <body>
 *   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
 *
 * @param {{ sourcePath: string, sourceText: string, body: string }} opts
 * @returns {string}
 */
export function wrapInAdapterEnvelope({ sourcePath, sourceText, body }) {
  const sourceRel = toRelSource(sourcePath);
  const hash = hashContent(sourceText);
  const start = `<!-- TESTATLAS:GENERATED:START section="adapter-body" source="${sourceRel}" hash="${hash}" -->`;
  const end = '<!-- TESTATLAS:GENERATED:END section="adapter-body" -->';
  return `${start}\n${body}\n${end}\n`;
}

/**
 * Scan `text` for the canonical adapter marker; return its parsed attributes
 * or `null` if absent. The hash MUST be 16 lowercase hex chars (matches
 * content-hash.js output).
 *
 * @param {string} text
 * @returns {{ section: string, source: string, hash: string } | null}
 */
export function parseAdapterMarker(text) {
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(ADAPTER_START_RE);
    if (m) return { section: m[1], source: m[2], hash: m[3] };
  }
  return null;
}

// Always-granted Claude Code tools (read-only navigation + file mutation
// primitives that every TestAtlas command needs to drive workspace I/O).
const BASELINE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];

/**
 * Map a TestAtlas capability list to a Claude Code `allowed-tools` array.
 *
 *   shell      → adds Bash
 *   web-fetch  → adds WebFetch
 *   MCP        → adds mcp__*
 *   browser    → adds mcp__* (browser is exposed via Chrome DevTools MCP)
 *   file-write → no addition (Write/Edit are baseline)
 *
 * Output is order-stable + deduplicated. Used by render-claude-code.js;
 * other adapters define their own mappings.
 *
 * @param {string[] | undefined | null} capabilities
 * @returns {string[]}
 */
export function capsToTools(capabilities) {
  const caps = Array.isArray(capabilities) ? capabilities : [];
  const out = [...BASELINE_TOOLS];
  if (caps.includes('shell')) out.push('Bash');
  if (caps.includes('web-fetch')) out.push('WebFetch');
  if (caps.includes('MCP') || caps.includes('browser')) out.push('mcp__*');
  // Dedup while preserving first-occurrence order (mcp__* could be added once
  // even if both browser and MCP are present — guarded above — but be defensive).
  const seen = new Set();
  return out.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
}

/**
 * Serialize a flat object to a deterministic YAML frontmatter block. Keys are
 * emitted in insertion order; arrays are emitted inline `[a, b, c]`. Values
 * are emitted as plain scalars (no quoting). This is intentionally minimal —
 * adapter renderers control input shape, so we don't need full YAML support.
 *
 * @param {Record<string, string | string[]>} obj
 * @returns {string} `---\n<key>: <value>\n...---\n`
 */
export function serializeFrontmatter(obj) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}
