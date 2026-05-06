// scripts/lib/adapters/render-mcp.js
//
// Plan 06-04 Task 3: MCP adapter renderer (mcp-server strategy).
//
// Output: a single declarative manifest at
// `.testatlas/adapters/mcp/mcp-server-manifest.json` enumerating all 32
// TestAtlas commands as MCP `prompts[]` per spec 2025-11-25.
//
// IMPORTANT: this adapter does NOT emit per-command files. The runnable
// server (`scripts/mcp-server.js`) reads `.testatlas/commands/*.md` directly
// at request time — adding a 32nd source command is automatic; the manifest
// is the only declarative artifact and exists primarily for clients that
// want to discover the contract without spawning the server.
//
// Manifest shape (06-RESEARCH.md §Q1.7 / §Q5):
//   {
//     "$schema": ".../schemas/<future-schema>.schema.json",
//     "name": "testatlas",
//     "version": "1.0.0",
//     "capabilities": { "prompts": { "listChanged": false } },
//     "prompts": [{ "name": "atlas-<cmd>", "description": "<copied>", "arguments": [] }]
//   }
//
// Why prompts/, not tools/: per MCP spec 2025-11-25, prompts are
// user-controlled (the spec literally says "for example, slash commands");
// tools are LLM-autonomous. TestAtlas commands are user-driven workflows,
// so prompts/ is the correct primitive.
//
// The manifest's structural correctness is asserted by mcp-server.test.js
// (subprocess + manifest comparison). A separate JSON Schema for the
// manifest is intentionally deferred to Plan 06-05 (which extends the
// validation suite) — over-engineering for v1.

import path from 'node:path';
import { parseFrontmatter } from '../parse-frontmatter.js';

/**
 * Derive the command base name (e.g. "init") from the absolute source path.
 *
 * @param {string} sourcePath
 * @returns {string}
 */
function commandBaseName(sourcePath) {
  // path.basename handles both `/` (POSIX) and `\` (Windows) separators.
  const file = path.basename(sourcePath);
  return file.endsWith('.md') ? file.slice(0, -3) : file;
}

/**
 * Build the MCP server manifest object. Returns the manifest as an object
 * (callers JSON.stringify with `\n` ending for byte-stable output).
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps?: string[],
 *   version: string,
 * }} opts
 * @returns {{ manifest: object }}
 */
export function renderMcp({ sources, version }) {
  // GAP-3 (quick-260506-nj2): version is a REQUIRED parameter. The previous
  // hardcoded '1.0.0' caused the manifest to drift from package.json#version
  // forever. Fail-fast — a missing/empty version is a programming error.
  if (typeof version !== 'string' || version.length === 0) {
    throw new TypeError('renderMcp: version (string) is required');
  }

  // Sort by full sourcePath so the manifest order matches listCommandFiles
  // (the order the server uses on prompts/list and the test compares against).
  const sorted = [...sources].sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );

  const prompts = sorted.map((s) => {
    const fm = parseFrontmatter(s.sourceText);
    const name = `atlas-${commandBaseName(s.sourcePath)}`;
    const description = String(fm.description ?? '').trim();
    return { name, description, arguments: [] };
  });

  const manifest = {
    name: 'testatlas',
    version,
    capabilities: { prompts: { listChanged: false } },
    prompts,
  };

  return { manifest };
}

/**
 * Convenience helper: render and serialize. The serialization is
 * 2-space-indented JSON terminated with a single newline — byte-stable for
 * the parity gate's hash + idempotency checks.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps?: string[],
 *   version: string,
 * }} opts
 * @returns {string}
 */
export function renderMcpToString(opts) {
  // GAP-3: re-validate at this entry too so callers that bypass renderMcp
  // (theoretical) still get the same fail-fast.
  if (!opts || typeof opts.version !== 'string' || opts.version.length === 0) {
    throw new TypeError('renderMcpToString: version (string) is required');
  }
  const { manifest } = renderMcp(opts);
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
