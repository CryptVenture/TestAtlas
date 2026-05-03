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
import { renderClaudeCode } from './lib/adapters/render-claude-code.js';
import { renderGeneric } from './lib/adapters/render-generic.js';
import { renderOpencode } from './lib/adapters/render-opencode.js';
import { formatErrors } from './lib/ajv-instance.js';
import { atomicWrite } from './lib/atomic-write.js';
import { listCommandFiles } from './lib/list-command-files.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const ADAPTER_CAPS_PATH = path.join('.testatlas', 'adapters', 'adapter-capabilities.json');
const SCHEMA_ID = 'https://testatlas.dev/schemas/adapter-capabilities.schema.json';

// Renderer dispatch table. Plans 06-03 / 06-04 add entries here. If an
// adapter has no entry, --adapter <name> fails fast with a clear message
// and the all-adapters mode silently skips it.
const RENDERERS = Object.freeze({
  'claude-code': renderClaudeCode,
  generic: renderGeneric,
  opencode: renderOpencode,
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
 * Compute the absolute output path for a single command in a given adapter.
 *
 * @param {string} workspace
 * @param {AdapterEntry} adapter
 * @param {string} commandBaseName  filename without extension, e.g. "init"
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
  const sources = await listCommandFiles({ cwd: workspace });
  const written = [];
  const unchanged = [];
  const drift = [];

  for (const sourcePath of sources) {
    const sourceText = await readFile(sourcePath, 'utf8');
    const baseName = path.basename(sourcePath, '.md');
    const outPath = computeOutputPath(workspace, adapter, baseName);
    const rendered = render({ sourceText, sourcePath });

    let existing = null;
    try {
      existing = await readFile(outPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (existing === rendered) {
      unchanged.push(outPath);
      continue;
    }

    if (check) {
      drift.push(outPath);
      continue;
    }

    await mkdir(path.dirname(outPath), { recursive: true });
    await atomicWrite(outPath, rendered);
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
    if (!RENDERERS[found.name]) {
      const known = Object.keys(RENDERERS).join(', ');
      throw new Error(
        `assemble-adapter: renderer not yet implemented for "${found.name}"; expected one of: ${known}`,
      );
    }
    targets = [found];
  } else {
    targets = adapters.filter((a) => RENDERERS[a.name]);
  }

  const results = [];
  let exitCode = 0;

  for (const adapter of targets) {
    const render = RENDERERS[adapter.name];
    const r = await runOneAdapter({
      adapter,
      workspace,
      check: !!opts.check,
      render,
    });
    results.push({ name: adapter.name, ...r });
    if (opts.check && r.drift.length > 0) exitCode = 1;
  }

  return { adapters: results, exitCode };
}

// ─── CLI wrapper ─────────────────────────────────────────────────────────────

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

const USAGE = `Usage: node scripts/assemble-adapter.js [options]

Options:
  --adapter <name>    Render one adapter only (e.g. claude-code).
  --check             Dry-run; exit 1 if any output is stale.
  --workspace <path>  Workspace root (default: cwd).
  -h, --help          Show this help.
`;
