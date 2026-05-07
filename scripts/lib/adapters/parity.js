// scripts/lib/adapters/parity.js
//
// Plan 06-02: adapter-parity enumeration library.
//
// Single export `enumerate({ repoRoot })` returns the full (command × adapter)
// matrix and a typed drift array. Used by:
//   - scripts/check-adapter-parity.js  (CLI: prints + exits)
//   - test/adapter-parity-stub.test.js (VAL-05 gate; rewritten in place by 06-02)
//
// Drift taxonomy (locked; downstream plans 06-03/04/05 do NOT extend):
//   - missing       : expected file does not exist on disk
//   - no-marker     : file exists but no adapter-marker envelope found
//   - hash-mismatch : marker exists but marker.hash !== hashContent(currentSourceText)
//                     (someone edited a source command without regenerating)
//   - hand-edit     : marker hash matches source but the body bytes differ
//                     from a fresh in-memory render (someone edited the
//                     derived file directly). Layer-2 detection — only fires
//                     for adapters whose renderer is registered in RENDERERS.
//
// Severity (transitional vs strict):
//   - `missing` is tolerated UNTIL Plan 06-05 flips strict mode (every adapter
//     shipped). The CLI's --strict flag elevates `missing` to a failure.
//   - `no-marker`, `hash-mismatch`, `hand-edit` are NEVER tolerated — they
//     fail the gate immediately in both modes.
//
// Matrix shape: 30 commands × 7 adapters = 210 obligations. Per-command-file
// adapters (claude-code, generic, opencode, kilocode, cursor) emit 30 distinct
// expected paths each. Concatenated/manifest adapters (aider, mcp) emit 30
// obligations all pointing to the SAME single output file (so the missing-file
// signal is per-(command, adapter) and the count stays uniform at 30/adapter).
//
// README files in adapter trees are intentionally NOT enumerated: they don't
// match any adapter.outputPattern. This is the answer to 06-RESEARCH.md §Q3.2.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashContent } from '../content-hash.js';
import { listCategorizedCommandFiles, listCommandFiles } from '../list-command-files.js';
import { commandBaseNameFromSource, parseAdapterMarker } from './_shared.js';
import { renderAider } from './render-aider.js';
import { renderAmazonQ } from './render-amazon-q.js';
import { renderClaudeCode } from './render-claude-code.js';
import { renderCline } from './render-cline.js';
import { renderCodex } from './render-codex.js';
import { renderContinueDev } from './render-continue-dev.js';
import { renderCursor } from './render-cursor.js';
import { renderGemini } from './render-gemini.js';
import { renderGeneric } from './render-generic.js';
import { renderGithubCopilot } from './render-github-copilot.js';
import { renderKilocode } from './render-kilocode.js';
import { renderKiro } from './render-kiro.js';
import { renderMcpToString } from './render-mcp.js';
import { renderOpencode } from './render-opencode.js';
import { renderRooCode } from './render-roo-code.js';
import { renderSourcegraphAmp } from './render-sourcegraph-amp.js';
import { renderWindsurf } from './render-windsurf.js';
import { renderZed } from './render-zed.js';

// Renderer dispatch table for layer-2 byte-compare. Each adapter must register
// here when it ships. An adapter without a registered renderer skips the
// layer-2 hand-edit check (the marker-hash check still runs, so source-drift
// is still caught).
const RENDERERS = Object.freeze({
  'claude-code': renderClaudeCode,
  cline: renderCline,
  codex: renderCodex,
  'continue-dev': renderContinueDev,
  cursor: renderCursor,
  'gemini-cli': renderGemini,
  generic: renderGeneric,
  'github-copilot': renderGithubCopilot,
  kilocode: renderKilocode,
  kiro: renderKiro,
  opencode: renderOpencode,
  'sourcegraph-amp': renderSourcegraphAmp,
  windsurf: renderWindsurf,
});

// Multi-source dispatch (concatenated-conventions, mcp-server). Each entry
// classifies the SHARED expected path ONCE per adapter and projects the
// outcome onto all 30 command obligations. Plan 06-04 ships aider + mcp.
const MULTI_CLASSIFIERS = Object.freeze({
  aider: classifyAider,
  'amazon-q': classifyAmazonQ,
  mcp: classifyMcp,
  'roo-code': classifyRooCode,
  zed: classifyZed,
});

const ADAPTER_CAPS_REL = path.join('.testatlas', 'adapters', 'adapter-capabilities.json');

/**
 * @typedef {Object} AdapterEntry
 * @property {string} name
 * @property {string} outputDir
 * @property {string} outputPattern
 * @property {string} fileExtension
 * @property {string[]} capabilities
 * @property {string} renderStrategy
 */

/**
 * @typedef {Object} DriftEntry
 * @property {'missing'|'no-marker'|'hash-mismatch'|'hand-edit'} kind
 * @property {string} adapter           Adapter name.
 * @property {string} command           Source command base name (no extension).
 * @property {string} expectedPath      Absolute path the parity gate expected.
 * @property {string} [sourcePath]      Absolute path of the source command.
 * @property {string} [expectedHash]    For hash-mismatch: marker.hash on disk.
 * @property {string} [actualHash]      For hash-mismatch: hashContent(currentSource).
 */

/**
 * @typedef {Object} EnumerateResult
 * @property {number} coverage         found / expected (0..1)
 * @property {number} expected         Total obligations across the matrix.
 * @property {number} found            expected - drift.length.
 * @property {DriftEntry[]} drift      One entry per obligation that failed.
 */

/**
 * Compute the absolute on-disk path for a (command, adapter) obligation.
 *
 * Per-command-file adapters: substitute {command} into outputPattern. The
 * caller passes the FLAT unique identifier from `commandBaseNameFromSource`;
 * Phase 16 (Plan 16-01) flattens every per-command-file adapter so there is
 * no category-nesting branch. The categorized SOURCE-OF-TRUTH at
 * `.testatlas/commands/<category>/` is preserved but is not mirrored into
 * adapter trees — see `prd/reports/v2-adapter-slash-command-discovery.md`
 * Option A.
 *
 * Concatenated/manifest adapters: outputPattern is a static filename —
 * every command obligation resolves to the same path (the single derived
 * file).
 *
 * @param {string} repoRoot
 * @param {AdapterEntry} adapter
 * @param {string} commandBaseName  unique flat identifier
 * @returns {string} absolute path
 */
function expectedPathFor(repoRoot, adapter, commandBaseName) {
  const rel = adapter.outputPattern.includes('{command}')
    ? adapter.outputPattern.replace('{command}', commandBaseName)
    : adapter.outputPattern;
  return path.join(repoRoot, adapter.outputDir, rel);
}

/**
 * Determine drift kind for a single (command, adapter) obligation.
 *
 * @param {{
 *   repoRoot: string,
 *   adapter: AdapterEntry,
 *   commandBaseName: string,
 *   sourcePath: string,
 *   sourceText: string,
 * }} ctx
 * @returns {Promise<DriftEntry | null>} null when the obligation is satisfied
 */
async function classifyOne(ctx) {
  const { repoRoot, adapter, commandBaseName, sourcePath, sourceText, category = null } = ctx;
  // Phase 16 (Plan 16-01): per-command-file adapters render flat. The
  // expected on-disk path is derived from the unique flat identifier
  // (`commandBaseNameFromSource(sourcePath)`); the marker `source` attribute
  // continues to carry the SOURCE-relative path including the category subdir
  // (e.g. `commands/council/council.md`) — that's the marker-source check
  // below, not the output-path computation.
  const flatName = commandBaseNameFromSource(sourcePath);
  const expectedPath = expectedPathFor(repoRoot, adapter, flatName);
  // `commandBaseName` is retained for drift-entry reporting (the user-facing
  // command identifier in error messages — typically the bare basename).
  void commandBaseName;

  let derivedText;
  try {
    derivedText = await readFile(expectedPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        kind: 'missing',
        adapter: adapter.name,
        command: commandBaseName,
        expectedPath,
        sourcePath,
      };
    }
    throw err;
  }

  // Concatenated/manifest strategies: a single output file represents 30
  // obligations. The marker check is per-command (the file is expected to
  // contain ONE marker per command source). Plan 06-04 wires those renderers;
  // for now any non-ENOENT presence is unexpected (renderer not shipped) but
  // we still walk the marker path for forward-compat.
  const marker = parseAdapterMarker(derivedText);

  // For per-command-file: a single marker per file, source attribute selects
  // which command this file belongs to. We need the marker for THIS command.
  // For concatenated: parseAdapterMarker only returns the FIRST marker — when
  // those renderers ship (06-04), this enumeration logic must be extended to
  // walk every marker. Plan 06-02 stops at single-marker semantics, which
  // matches the per-command-file adapters that exist today and falls back to
  // `no-marker` cleanly for unshipped concatenated adapters whose file
  // contains no marker at all yet.
  if (!marker) {
    return {
      kind: 'no-marker',
      adapter: adapter.name,
      command: commandBaseName,
      expectedPath,
      sourcePath,
    };
  }

  // For per-command-file adapters, the marker MUST belong to this command.
  // A mismatched marker.source is a strong "wrong file at this path" signal —
  // surface as no-marker (the right marker is missing).
  if (adapter.renderStrategy === 'per-command-file') {
    const expectedSourceRel = category
      ? `commands/${category}/${commandBaseName}.md`
      : `commands/${commandBaseName}.md`;
    if (marker.source !== expectedSourceRel) {
      return {
        kind: 'no-marker',
        adapter: adapter.name,
        command: commandBaseName,
        expectedPath,
        sourcePath,
      };
    }
  }

  const sourceHash = hashContent(sourceText);
  if (marker.hash !== sourceHash) {
    return {
      kind: 'hash-mismatch',
      adapter: adapter.name,
      command: commandBaseName,
      expectedPath,
      sourcePath,
      expectedHash: marker.hash,
      actualHash: sourceHash,
    };
  }

  // Layer 2: re-render in-memory and byte-compare. Catches hand-edits whose
  // marker hash still matches the source (someone edited the derived file
  // body without touching the marker line).
  const render = RENDERERS[adapter.name];
  if (render) {
    const fresh = render({ sourceText, sourcePath, adapterCaps: adapter.capabilities });
    if (fresh !== derivedText) {
      return {
        kind: 'hand-edit',
        adapter: adapter.name,
        command: commandBaseName,
        expectedPath,
        sourcePath,
      };
    }
  }

  return null;
}

/**
 * Classify the SHARED Aider obligation. Aider produces a single
 * CONVENTIONS.md whose envelope wraps all 30 source-derived sections; the
 * marker carries the AGGREGATE hash (= hashContent over the concatenation of
 * all per-source hashes). Drift kinds are projected uniformly onto all 30
 * command obligations:
 *   - missing       : CONVENTIONS.md does not exist on disk
 *   - no-marker     : CONVENTIONS.md exists but has no envelope
 *   - hash-mismatch : marker.hash !== aggregate hash recomputed from sources
 *   - hand-edit     : marker hash matches but a fresh render produces different bytes
 *
 * @param {{
 *   repoRoot: string,
 *   adapter: AdapterEntry,
 *   sources: { sourcePath: string, sourceText: string, commandBaseName: string }[],
 * }} args
 * @returns {Promise<DriftEntry['kind'] | null>} the shared kind to project, or null when satisfied
 */
async function classifyAider({ repoRoot, adapter, sources }) {
  const expectedPath = path.join(repoRoot, adapter.outputDir, 'CONVENTIONS.md');
  let derivedText;
  try {
    derivedText = await readFile(expectedPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    throw err;
  }

  const marker = parseAdapterMarker(derivedText);
  if (!marker || marker.source !== 'commands/_aggregate') return 'no-marker';

  // V2 (Phase 14 Wave 5): match the renderer's sourcePath-sort before computing
  // the aggregate hash so parity stays byte-stable as the source set grows.
  const sortedSources = [...sources].sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );
  const perSource = sortedSources.map((s) => hashContent(s.sourceText));
  const aggregateHash = hashContent(perSource.join(''));
  if (marker.hash !== aggregateHash) return 'hash-mismatch';

  // Layer-2: re-render and byte-compare.
  const fresh = renderAider({
    sources: sortedSources.map((s) => ({
      sourcePath: s.sourcePath,
      sourceText: s.sourceText,
    })),
    adapterCaps: adapter.capabilities,
  });
  if (fresh.conventions !== derivedText) return 'hand-edit';

  return null;
}

/**
 * Classify the SHARED MCP obligation. The MCP adapter ships a single
 * declarative manifest (`mcp-server-manifest.json`) that enumerates all 30
 * commands as MCP prompts. The manifest is pure JSON — no adapter-marker
 * envelope (JSON forbids comments). Drift kinds:
 *   - missing   : manifest does not exist on disk
 *   - no-marker : manifest exists but lacks `prompts[]` array (or wrong shape)
 *                 — surfaced as no-marker for taxonomy uniformity, since the
 *                 manifest IS the marker for this strategy
 *   - hash-mismatch : reserved (no in-band hash on JSON manifests; if the
 *                     test suite ever needs source-drift detection here, the
 *                     manifest's `prompts.length` and per-prompt name set
 *                     act as the integrity check — currently rolled into the
 *                     hand-edit byte-compare below)
 *   - hand-edit : on-disk JSON differs from a fresh render (caught by the
 *                 byte-compare against renderMcpToString)
 *
 * @param {{
 *   repoRoot: string,
 *   adapter: AdapterEntry,
 *   sources: { sourcePath: string, sourceText: string, commandBaseName: string }[],
 * }} args
 * @returns {Promise<DriftEntry['kind'] | null>}
 */
async function classifyMcp({ repoRoot, adapter, sources }) {
  const expectedPath = path.join(repoRoot, adapter.outputDir, 'mcp-server-manifest.json');
  let derivedText;
  try {
    derivedText = await readFile(expectedPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    throw err;
  }

  // Structural sanity: must parse, must declare prompts[].
  let parsed;
  try {
    parsed = JSON.parse(derivedText);
  } catch {
    return 'no-marker';
  }
  if (!parsed || !Array.isArray(parsed.prompts)) return 'no-marker';

  // GAP-3 (quick-260506-nj2): renderMcpToString now requires `version`.
  // Read package.json#version from repoRoot and pass through. A missing
  // version means parity itself can't render a fresh manifest — that's a
  // build-environment error, not a drift category, so throw loudly rather
  // than swallowing it as "missing".
  const pkgPath = path.join(repoRoot, 'package.json');
  let pkgVersion;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkgVersion = pkg.version;
  } catch (err) {
    throw new Error(`parity:mcp cannot read version from ${pkgPath}: ${err.message}`);
  }
  if (typeof pkgVersion !== 'string' || pkgVersion.length === 0) {
    throw new Error(`parity:mcp ${pkgPath} has no usable "version" field`);
  }

  // Layer-2: byte-compare against a fresh render.
  const fresh = renderMcpToString({
    sources: sources.map((s) => ({ sourcePath: s.sourcePath, sourceText: s.sourceText })),
    adapterCaps: adapter.capabilities,
    version: pkgVersion,
  });
  if (fresh !== derivedText) return 'hand-edit';

  return null;
}

/**
 * Shared classifier for the three concatenated-conventions adapters
 * (roo-code, zed, amazon-q). They all produce a single output file with the
 * same envelope shape: source="commands/_aggregate" + aggregate hash. The
 * caller passes the renderer-specific function and output filename.
 *
 * @param {{
 *   repoRoot: string,
 *   adapter: AdapterEntry,
 *   sources: { sourcePath: string, sourceText: string, commandBaseName: string }[],
 *   render: (args: { sources: { sourcePath: string, sourceText: string }[], adapterCaps: string[] }) => { rules: string },
 * }} args
 * @returns {Promise<DriftEntry['kind'] | null>}
 */
async function classifyConcatenatedRules({ repoRoot, adapter, sources, render }) {
  const expectedPath = path.join(repoRoot, adapter.outputDir, adapter.outputPattern);
  let derivedText;
  try {
    derivedText = await readFile(expectedPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    throw err;
  }

  const marker = parseAdapterMarker(derivedText);
  if (!marker || marker.source !== 'commands/_aggregate') return 'no-marker';

  // V2 (Phase 14 Wave 5): the renderers sort by sourcePath before computing the
  // aggregate hash; mirror that here so the parity hash matches byte-for-byte
  // regardless of what order parity received its sources in.
  const sortedSources = [...sources].sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );
  const perSource = sortedSources.map((s) => hashContent(s.sourceText));
  const aggregateHash = hashContent(perSource.join(''));
  if (marker.hash !== aggregateHash) return 'hash-mismatch';

  const fresh = render({
    sources: sortedSources.map((s) => ({
      sourcePath: s.sourcePath,
      sourceText: s.sourceText,
    })),
    adapterCaps: adapter.capabilities,
  });
  if (fresh.rules !== derivedText) return 'hand-edit';

  return null;
}

/**
 * Classify the SHARED Roo Code obligation (single .roo/rules/atlas.md).
 * @param {{ repoRoot: string, adapter: AdapterEntry, sources: { sourcePath: string, sourceText: string, commandBaseName: string }[] }} args
 * @returns {Promise<DriftEntry['kind'] | null>}
 */
async function classifyRooCode(args) {
  return classifyConcatenatedRules({ ...args, render: renderRooCode });
}

/**
 * Classify the SHARED Zed obligation (single `.rules` file at outputDir root).
 * @param {{ repoRoot: string, adapter: AdapterEntry, sources: { sourcePath: string, sourceText: string, commandBaseName: string }[] }} args
 * @returns {Promise<DriftEntry['kind'] | null>}
 */
async function classifyZed(args) {
  return classifyConcatenatedRules({ ...args, render: renderZed });
}

/**
 * Classify the SHARED Amazon Q obligation (single .amazonq/rules/atlas.md).
 * @param {{ repoRoot: string, adapter: AdapterEntry, sources: { sourcePath: string, sourceText: string, commandBaseName: string }[] }} args
 * @returns {Promise<DriftEntry['kind'] | null>}
 */
async function classifyAmazonQ(args) {
  return classifyConcatenatedRules({ ...args, render: renderAmazonQ });
}

/**
 * Enumerate the (command × adapter) parity matrix against the live tree at
 * `repoRoot` and report drift.
 *
 * @param {{ repoRoot?: string }} [opts]
 * @returns {Promise<EnumerateResult>}
 */
export async function enumerate({ repoRoot = process.cwd() } = {}) {
  const capsPath = path.join(repoRoot, ADAPTER_CAPS_REL);
  const caps = JSON.parse(await readFile(capsPath, 'utf8'));
  /** @type {AdapterEntry[]} */
  const adapters = caps.adapters;

  // V2 (Phase 14 Wave 5): merge flat V1 commands and V2 categorized commands.
  // Each record carries its `category` (null for flat) so per-command-file
  // adapters can compute nested output paths and the marker source-rel check
  // can match `commands/<category>/<name>.md`.
  const flatSources = await listCommandFiles({ cwd: repoRoot });
  const categorized = await listCategorizedCommandFiles({ cwd: repoRoot });
  const sourceTexts = [
    ...(await Promise.all(
      flatSources.map(async (sp) => ({
        sourcePath: sp,
        commandBaseName: path.basename(sp, '.md'),
        sourceText: await readFile(sp, 'utf8'),
        category: /** @type {string|null} */ (null),
      })),
    )),
    ...(await Promise.all(
      categorized.map(async (c) => ({
        sourcePath: c.absPath,
        commandBaseName: c.basename,
        sourceText: await readFile(c.absPath, 'utf8'),
        category: c.category,
      })),
    )),
  ];

  /** @type {DriftEntry[]} */
  const drift = [];
  let expected = 0;

  for (const adapter of adapters) {
    const multi = MULTI_CLASSIFIERS[adapter.name];
    if (multi) {
      // Multi-source: classify the shared obligation ONCE, then project the
      // outcome onto all 30 command obligations. The expectedPath we surface
      // for each drift entry is the single shared output file (CONVENTIONS.md
      // for aider, manifest for mcp), so users see exactly one path even
      // though we report one drift entry per command for invariant uniformity.
      const sharedKind = await multi({ repoRoot, adapter, sources: sourceTexts });
      const sharedExpected = path.join(repoRoot, adapter.outputDir, adapter.outputPattern);
      for (const src of sourceTexts) {
        expected += 1;
        if (sharedKind) {
          drift.push({
            kind: sharedKind,
            adapter: adapter.name,
            command: src.commandBaseName,
            expectedPath: sharedExpected,
            sourcePath: src.sourcePath,
          });
        }
      }
      continue;
    }
    for (const src of sourceTexts) {
      expected += 1;
      const entry = await classifyOne({
        repoRoot,
        adapter,
        commandBaseName: src.commandBaseName,
        sourcePath: src.sourcePath,
        sourceText: src.sourceText,
        category: src.category,
      });
      if (entry) drift.push(entry);
    }
  }

  const found = expected - drift.length;
  const coverage = expected === 0 ? 1 : found / expected;
  return { coverage, expected, found, drift };
}
