#!/usr/bin/env node
// scripts/assemble-adapter.js
//
// Plan 06-01 Task 3: per-adapter CLI generator.
//
// Reads the 30 source command files at `.testatlas/commands/*.md`, dispatches
// each through the adapter's renderer, writes the result via atomic-write to
// the adapter's outputDir + outputPattern. Idempotent: re-running on
// unchanged inputs writes nothing (and `--check` mode reports zero drift).
//
// CLI:
//   node scripts/assemble-adapter.js                       # all renderable adapters
//   node scripts/assemble-adapter.js --adapter claude-code # single adapter
//   node scripts/assemble-adapter.js --check               # dry-run; exit 1 on drift
//   node scripts/assemble-adapter.js --workspace <path>    # alternative cwd
//
// Plan 06-01 ships ONLY the claude-code renderer. Plans 06-03/06-04 will
// extend the dispatch table; the CLI fails clearly on unknown --adapter.
//
// IMPORTANT: This script does NOT create scripts/check-adapter-parity.js.
// That script is shipped atomically by Plan 06-02 — Pitfall 4 in 06-RESEARCH.md.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandBaseNameFromSource, substituteAdapterCommandPath } from './lib/adapters/_shared.js';
import { renderAider } from './lib/adapters/render-aider.js';
import { renderAmazonQ } from './lib/adapters/render-amazon-q.js';
import { renderClaudeCode } from './lib/adapters/render-claude-code.js';
import { renderCline } from './lib/adapters/render-cline.js';
import { renderCodex } from './lib/adapters/render-codex.js';
import { renderContinueDev } from './lib/adapters/render-continue-dev.js';
import { renderCursor } from './lib/adapters/render-cursor.js';
import { renderGemini } from './lib/adapters/render-gemini.js';
import { renderGeneric } from './lib/adapters/render-generic.js';
import { renderGithubCopilot } from './lib/adapters/render-github-copilot.js';
import { renderKilocode } from './lib/adapters/render-kilocode.js';
import { renderKiro } from './lib/adapters/render-kiro.js';
import { renderMcpToString } from './lib/adapters/render-mcp.js';
import { renderOpencode } from './lib/adapters/render-opencode.js';
import { renderRooCode } from './lib/adapters/render-roo-code.js';
import { renderSourcegraphAmp } from './lib/adapters/render-sourcegraph-amp.js';
import { renderWindsurf } from './lib/adapters/render-windsurf.js';
import { renderZed } from './lib/adapters/render-zed.js';
import { formatErrors } from './lib/ajv-instance.js';
import { atomicWrite } from './lib/atomic-write.js';
import { listCategorizedCommandFiles, listCommandFiles } from './lib/list-command-files.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const ADAPTER_CAPS_PATH = path.join('.testatlas', 'adapters', 'adapter-capabilities.json');
const SCHEMA_ID = 'https://testatlas.dev/schemas/v1/adapter-capabilities.schema.json';

// Per-command-file renderer dispatch. Each entry takes
// `{ sourceText, sourcePath, adapterCaps }` and returns the rendered string
// for ONE derived file. Aider (concatenated-conventions) and MCP (mcp-server
// strategy) bypass this table and use the multi-source dispatch below.
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

// Multi-source renderer dispatch. Each entry takes
// `{ sources, adapterCaps }` (where `sources` is the full ordered list of
// `{ sourceText, sourcePath }` pairs) and returns an array of derived
// `{ outPath, content }` outputs to write under the workspace root. Used by
// the concatenated-conventions and mcp-server strategies which produce a
// fixed set of output files independent of the per-source iteration.
const MULTI_RENDERERS = Object.freeze({
  aider: aiderMultiRenderer,
  'amazon-q': amazonQMultiRenderer,
  mcp: mcpMultiRenderer,
  'roo-code': rooCodeMultiRenderer,
  zed: zedMultiRenderer,
});

/**
 * @typedef {Object} AdapterEntry
 * @property {string} name
 * @property {string} displayName
 * @property {string} outputDir
 * @property {string[]} capabilities
 * @property {string} renderStrategy
 * @property {string} [outputPattern]
 * @property {string} [fileExtension]
 */

/**
 * Load adapter-capabilities.json and validate against the 17th schema.
 *
 * @param {string} cwd
 * @returns {Promise<AdapterEntry[]>}
 */
async function loadAdapters(cwd) {
  const ajv = await loadAllSchemas({ cwd });
  const validate = ajv.getSchema(SCHEMA_ID);
  if (!validate) {
    throw new Error(
      `assemble-adapter: schema ${SCHEMA_ID} not loaded (is .testatlas/schemas/adapter-capabilities.schema.json present?)`,
    );
  }
  const filePath = path.join(cwd, ADAPTER_CAPS_PATH);
  const data = JSON.parse(await readFile(filePath, 'utf8'));
  const ok = validate(data);
  if (!ok) {
    const lines = formatErrors(validate.errors, ADAPTER_CAPS_PATH);
    const err = new Error(
      `assemble-adapter: ${ADAPTER_CAPS_PATH} failed schema validation:\n  ${lines.join('\n  ')}`,
    );
    err.code = 'TESTATLAS_ADAPTER_CAPS_INVALID';
    throw err;
  }
  return data.adapters;
}

/**
 * Compute the absolute output path for a single command file.
 *
 * Phase 16 (Plan 16-01): per-command-file adapters render ALL commands
 * (V1 flat + V2 categorized) FLAT at the adapter commands root. The unique
 * flat name is derived in the caller via `commandBaseNameFromSource(sourcePath)`;
 * by the time we reach this function, `commandBaseName` is already the
 * collision-free flat identifier. The categorized SOURCE-OF-TRUTH at
 * `.testatlas/commands/<category>/` is preserved unchanged for organizational
 * clarity; it is NOT mirrored into adapter trees because Strong-tier hosts
 * (Claude Code, Codex, KiloCode...) only enumerate the top-level command
 * directory — see `prd/reports/v2-adapter-slash-command-discovery.md` Option A.
 *
 * The previous (Phase 14 Wave 5) category-nesting branch — which produced
 * nested adapter paths like `.claude/commands/council/atlas-foo.md` — has
 * been REMOVED, not merely guarded. Re-introducing category nesting requires
 * an explicit code change (with a test) rather than a silent caller-passed
 * flag.
 *
 * @param {string} workspace
 * @param {AdapterEntry} adapter
 * @param {string} commandBaseName  unique flat identifier (e.g. "init",
 *                                  "core-init", "council-domain-review")
 * @returns {string}
 */
function computeOutputPath(workspace, adapter, commandBaseName) {
  const pattern = adapter.outputPattern ?? `atlas-${commandBaseName}.md`;
  // Pattern can be either "{command}" templated (per-command) or static
  // (concatenated/manifest strategies — those don't go through the
  // per-command write loop and are handled by their own renderer).
  const rel = pattern.replace('{command}', commandBaseName);
  return path.join(workspace, adapter.outputDir, rel);
}

/**
 * Quick 260507-hzw: derive the TARGET-repo installed path the agent will see
 * at runtime, from the adapter's outputPattern. This is the path
 * substituted into the {{ADAPTER_COMMAND_PATH}} placeholder so the rendered
 * file's preamble points at the file the AGENT actually loaded — not the
 * suite's staging location under `.testatlas/adapters/<name>/...`.
 *
 * The returned string is POSIX-normalized (forward slashes), since rendered
 * markdown bodies are byte-stable across OSes and forward-slash is the
 * canonical filesystem-path form in markdown text.
 *
 * @param {AdapterEntry} adapter
 * @param {string} commandBaseName  unique flat identifier
 * @returns {string} workspace-relative path, e.g. `.kilocode/workflows/atlas-init.md`
 */
function computeInstalledPath(adapter, commandBaseName) {
  const pattern = adapter.outputPattern ?? `atlas-${commandBaseName}.md`;
  return pattern.replace('{command}', commandBaseName);
}

/**
 * Aider multi-source renderer adapter. Returns the two outputs (CONVENTIONS.md
 * + .aider.conf.yml) for the workspace.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps: string[],
 *   workspace: string,
 *   adapter: AdapterEntry,
 * }} args
 * @returns {Array<{ outPath: string, content: string }>}
 */
function aiderMultiRenderer({ sources, adapterCaps, workspace, adapter }) {
  const { conventions, conf } = renderAider({ sources, adapterCaps });
  return [
    { outPath: path.join(workspace, adapter.outputDir, 'CONVENTIONS.md'), content: conventions },
    { outPath: path.join(workspace, adapter.outputDir, '.aider.conf.yml'), content: conf },
  ];
}

/**
 * MCP multi-source renderer adapter. Returns the manifest output for the
 * workspace. The runnable server (`scripts/mcp-server.js`) is committed
 * separately and reads sources at request time — no per-command derived
 * files exist for MCP.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps: string[],
 *   workspace: string,
 *   adapter: AdapterEntry,
 * }} args
 * @returns {Array<{ outPath: string, content: string }>}
 */
async function mcpMultiRenderer({ sources, adapterCaps, workspace, adapter }) {
  // GAP-3 (quick-260506-nj2): inject suite version from the workspace's
  // package.json. Required; no fallback — a missing/unreadable package.json
  // should fail the build loudly rather than ship a stale "1.0.0".
  const pkgPath = path.join(workspace, 'package.json');
  let pkgVersion;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkgVersion = pkg.version;
  } catch (err) {
    throw new Error(
      `assemble-adapter: cannot read version from ${pkgPath} for mcp adapter: ${err.message}`,
    );
  }
  if (typeof pkgVersion !== 'string' || pkgVersion.length === 0) {
    throw new Error(
      `assemble-adapter: ${pkgPath} has no usable "version" field (got ${JSON.stringify(pkgVersion)})`,
    );
  }
  const content = renderMcpToString({ sources, adapterCaps, version: pkgVersion });
  return [
    {
      outPath: path.join(workspace, adapter.outputDir, 'mcp-server-manifest.json'),
      content,
    },
  ];
}

/**
 * Roo Code multi-source renderer adapter. Returns the single concatenated
 * `.roo/rules/atlas.md` output for the workspace.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps: string[],
 *   workspace: string,
 *   adapter: AdapterEntry,
 * }} args
 * @returns {Array<{ outPath: string, content: string }>}
 */
function rooCodeMultiRenderer({ sources, adapterCaps, workspace, adapter }) {
  const { rules } = renderRooCode({ sources, adapterCaps });
  return [
    {
      outPath: path.join(workspace, adapter.outputDir, adapter.outputPattern),
      content: rules,
    },
  ];
}

/**
 * Zed multi-source renderer adapter. Returns the single `.rules` file at the
 * adapter's outputDir root (no subdir; pattern is just `.rules`).
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps: string[],
 *   workspace: string,
 *   adapter: AdapterEntry,
 * }} args
 * @returns {Array<{ outPath: string, content: string }>}
 */
function zedMultiRenderer({ sources, adapterCaps, workspace, adapter }) {
  const { rules } = renderZed({ sources, adapterCaps });
  return [
    {
      outPath: path.join(workspace, adapter.outputDir, adapter.outputPattern),
      content: rules,
    },
  ];
}

/**
 * Amazon Q multi-source renderer adapter. Returns the single concatenated
 * `.amazonq/rules/atlas.md` output for the workspace.
 *
 * @param {{
 *   sources: { sourceText: string, sourcePath: string }[],
 *   adapterCaps: string[],
 *   workspace: string,
 *   adapter: AdapterEntry,
 * }} args
 * @returns {Array<{ outPath: string, content: string }>}
 */
function amazonQMultiRenderer({ sources, adapterCaps, workspace, adapter }) {
  const { rules } = renderAmazonQ({ sources, adapterCaps });
  return [
    {
      outPath: path.join(workspace, adapter.outputDir, adapter.outputPattern),
      content: rules,
    },
  ];
}

/**
 * Execute a multi-source adapter (aider, mcp). The renderer is given the full
 * list of sources at once and returns a fixed set of output files; the runner
 * handles drift detection + atomic writes in the same shape as runOneAdapter.
 *
 * @param {{
 *   adapter: AdapterEntry,
 *   workspace: string,
 *   check: boolean,
 *   multiRender: (args: {
 *     sources: { sourceText: string, sourcePath: string }[],
 *     adapterCaps: string[],
 *     workspace: string,
 *     adapter: AdapterEntry,
 *   }) => Array<{ outPath: string, content: string }> | Promise<Array<{ outPath: string, content: string }>>,
 * }} opts
 * @returns {Promise<{ written: string[], unchanged: string[], drift: string[] }>}
 */
async function runMultiSourceAdapter({ adapter, workspace, check, multiRender }) {
  // V2 (Phase 14 Wave 5): include both flat AND categorized command sources.
  // Concatenated/manifest renderers consume the full set in one pass; the
  // expected aggregate-hash and prompt list grow naturally.
  const sourcePaths = await listCommandFiles({ cwd: workspace, includeCategorized: true });
  const sources = await Promise.all(
    sourcePaths.map(async (sp) => ({ sourcePath: sp, sourceText: await readFile(sp, 'utf8') })),
  );
  // GAP-3 (quick-260506-nj2): mcpMultiRenderer is now async (reads
  // package.json). Other multi-renderers remain sync but await Promise.resolve()s
  // their array return cleanly — no breaking change.
  const outputs = await multiRender({
    sources,
    adapterCaps: adapter.capabilities,
    workspace,
    adapter,
  });

  const written = [];
  const unchanged = [];
  const drift = [];
  for (const { outPath, content } of outputs) {
    // Quick 260507-hzw: substitute {{ADAPTER_COMMAND_PATH}} with the
    // adapter's TARGET-repo install path. For aggregate adapters
    // (aider/roo-code/zed/amazon-q) the install path is the aggregate file
    // itself (CONVENTIONS.md, .roo/rules/atlas.md, .rules, .amazonq/rules/
    // atlas.md). For MCP the manifest carries no preamble so the helper is a
    // no-op. The aggregate path is derived by stripping the suite's staging
    // prefix `<adapter.outputDir>/` from the workspace-relative outPath.
    const wsRel = path.relative(workspace, outPath).split(path.sep).join('/');
    const stagingPrefix = `${adapter.outputDir.split(path.sep).join('/')}/`;
    const installedRel = wsRel.startsWith(stagingPrefix)
      ? wsRel.slice(stagingPrefix.length)
      : wsRel;
    const finalContent = substituteAdapterCommandPath(content, installedRel);

    let existing = null;
    try {
      existing = await readFile(outPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (existing === finalContent) {
      unchanged.push(outPath);
      continue;
    }
    if (check) {
      drift.push(outPath);
      continue;
    }
    await mkdir(path.dirname(outPath), { recursive: true });
    await atomicWrite(outPath, finalContent);
    written.push(outPath);
  }
  return { written, unchanged, drift };
}

/**
 * Execute one adapter end-to-end: render every source command into the
 * adapter's outputDir tree. In `--check` mode, returns the list of paths
 * whose on-disk content differs from the freshly-rendered output (without
 * writing anything).
 *
 * @param {{
 *   adapter: AdapterEntry,
 *   workspace: string,
 *   check: boolean,
 *   render: (opts: { sourceText: string, sourcePath: string }) => string,
 * }} opts
 * @returns {Promise<{ written: string[], unchanged: string[], drift: string[] }>}
 */
async function runOneAdapter({ adapter, workspace, check, render }) {
  // Flat V1 commands first (preserves V1 output paths byte-for-byte).
  const flatPaths = await listCommandFiles({ cwd: workspace });
  // V2 categorized commands (Phase 14 Wave 5): each renders into
  // `<outputDir>/.../<category>/atlas-<basename><ext>`.
  const categorized = await listCategorizedCommandFiles({ cwd: workspace });

  const written = [];
  const unchanged = [];
  const drift = [];

  // Combined enumeration: V1 flat + V2 categorized share the same write loop.
  // Phase 16 (Plan 16-01): every item is rendered FLAT at the adapter
  // commands root with `commandBaseNameFromSource(sourcePath)` as the unique
  // identifier (zero collisions confirmed across the V1+V2 source set per
  // `prd/reports/v2-adapter-slash-command-discovery.md` §"Naming Collision
  // Audit"). The category attribute is intentionally absent — it has no
  // effect on output path, only on the SOURCE-OF-TRUTH layout under
  // `.testatlas/commands/<category>/`.
  /** @type {{ sourcePath: string, baseName: string }[]} */
  const items = [
    ...flatPaths.map((sp) => ({
      sourcePath: sp,
      baseName: commandBaseNameFromSource(sp),
    })),
    ...categorized.map((c) => ({
      sourcePath: c.absPath,
      baseName: commandBaseNameFromSource(c.absPath),
    })),
  ];

  for (const item of items) {
    const sourceText = await readFile(item.sourcePath, 'utf8');
    const outPath = computeOutputPath(workspace, adapter, item.baseName);
    const rendered = render({
      sourceText,
      sourcePath: item.sourcePath,
      adapterCaps: adapter.capabilities,
    });

    // Quick 260507-hzw: substitute {{ADAPTER_COMMAND_PATH}} with the
    // adapter's TARGET-repo install path (derived from outputPattern with the
    // {command} slot filled). This is the path the agent will see at runtime
    // AFTER `install.js` copies the suite tree into a target repo — NOT the
    // suite's staging path under `.testatlas/adapters/<name>/...`. For
    // KiloCode the target install path is `.kilocode/workflows/atlas-<n>.md`,
    // not `.testatlas/adapters/kilocode/.kilocode/workflows/atlas-<n>.md`.
    //
    // Hash-stability: the marker hash is already baked into `rendered`
    // (computed from the placeholder-bearing sourceText inside
    // wrapInAdapterEnvelope), so substitution AFTER render preserves the
    // hash-stability contract — the same source bytes produce the same
    // marker.hash regardless of which adapter renders it (Option B1, plan
    // §Step B.2).
    const installedRel = computeInstalledPath(adapter, item.baseName);
    const finalRendered = substituteAdapterCommandPath(rendered, installedRel);

    let existing = null;
    try {
      existing = await readFile(outPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (existing === finalRendered) {
      unchanged.push(outPath);
      continue;
    }

    if (check) {
      drift.push(outPath);
      continue;
    }

    await mkdir(path.dirname(outPath), { recursive: true });
    await atomicWrite(outPath, finalRendered);
    written.push(outPath);
  }

  return { written, unchanged, drift };
}

/**
 * Public entry point. Keeps the CLI thin and tests fast (no child process
 * spawn needed — tests just import this).
 *
 * @param {{
 *   adapter?: string,         // single-adapter name; default = run all that have renderers
 *   workspace?: string,       // default = process.cwd()
 *   check?: boolean,          // dry-run + exit-1-on-drift mode
 * }} [opts]
 * @returns {Promise<{ adapters: Array<{ name: string, written: string[], unchanged: string[], drift: string[] }>, exitCode: 0 | 1 }>}
 */
export async function assembleAdapter(opts = {}) {
  const workspace = path.resolve(opts.workspace ?? process.cwd());
  const adapters = await loadAdapters(workspace);

  let targets;
  if (opts.adapter) {
    const found = adapters.find((a) => a.name === opts.adapter);
    if (!found) {
      throw new Error(
        `assemble-adapter: unknown adapter "${opts.adapter}". Known adapters: ${adapters.map((a) => a.name).join(', ')}`,
      );
    }
    if (!RENDERERS[found.name] && !MULTI_RENDERERS[found.name]) {
      const known = [...Object.keys(RENDERERS), ...Object.keys(MULTI_RENDERERS)].join(', ');
      throw new Error(
        `assemble-adapter: renderer not yet implemented for "${found.name}"; expected one of: ${known}`,
      );
    }
    targets = [found];
  } else {
    targets = adapters.filter((a) => RENDERERS[a.name] || MULTI_RENDERERS[a.name]);
  }

  const results = [];
  let exitCode = 0;

  for (const adapter of targets) {
    let r;
    if (MULTI_RENDERERS[adapter.name]) {
      r = await runMultiSourceAdapter({
        adapter,
        workspace,
        check: !!opts.check,
        multiRender: MULTI_RENDERERS[adapter.name],
      });
    } else {
      r = await runOneAdapter({
        adapter,
        workspace,
        check: !!opts.check,
        render: RENDERERS[adapter.name],
      });
    }
    results.push({ name: adapter.name, ...r });
    if (opts.check && r.drift.length > 0) exitCode = 1;
  }

  return { adapters: results, exitCode };
}

// ─── CLI wrapper ─────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/assemble-adapter.js [options]

Options:
  --adapter <name>    Render one adapter only (e.g. claude-code).
  --check             Dry-run; exit 1 if any output is stale.
  --workspace <path>  Workspace root (default: cwd).
  -h, --help          Show this help.
`;

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

/**
 * @param {string[]} argv
 */
async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--adapter') {
      opts.adapter = argv[++i];
    } else if (a === '--check') {
      opts.check = true;
    } else if (a === '--workspace') {
      opts.workspace = argv[++i];
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      process.stderr.write(`assemble-adapter: unknown arg "${a}"\n${USAGE}`);
      process.exit(2);
    }
  }

  try {
    const { adapters, exitCode } = await assembleAdapter(opts);
    for (const r of adapters) {
      const total = r.written.length + r.unchanged.length + r.drift.length;
      if (opts.check) {
        process.stdout.write(
          `${r.name}: ${r.drift.length} drift, ${r.unchanged.length} unchanged of ${total}\n`,
        );
        for (const p of r.drift)
          process.stdout.write(`  drift: ${path.relative(process.cwd(), p)}\n`);
      } else {
        process.stdout.write(
          `${r.name}: ${r.written.length} written, ${r.unchanged.length} unchanged of ${total}\n`,
        );
        for (const p of r.written) process.stdout.write(`  ${path.relative(process.cwd(), p)}\n`);
      }
    }
    process.exit(exitCode);
  } catch (err) {
    process.stderr.write(`assemble-adapter: ${err.message}\n`);
    process.exit(1);
  }
}
