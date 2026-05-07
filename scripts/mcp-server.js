#!/usr/bin/env node

// scripts/mcp-server.js
//
// TestAtlas MCP Server (Plan 06-04 Task 3).
//
// Runnable JSON-RPC stdio server implementing MCP spec 2025-11-25. Exposes
// each `.testatlas/commands/<name>.md` file as an MCP Prompt named
// `atlas-<name>`. Reads command sources at request time — no per-command
// files are pre-rendered, no static index is built, adding a 32nd command
// to `.testatlas/commands/` makes it instantly discoverable.
//
// Why prompts/, not tools/: per the MCP spec, prompts are user-controlled
// ("for example, slash commands"); tools are LLM-autonomous. TestAtlas
// commands are user-driven workflows, so prompts/ is the correct primitive.
//
// Transport: stdio + JSON-RPC 2.0. Each message is one `\n`-terminated JSON
// line on stdin (request) / stdout (response). HTTP/SSE transport is
// deferred to a future plan.
//
// Workspace resolution: prefers env var `TESTATLAS_WORKSPACE` (so callers
// like Claude Desktop's mcp_config.json can pass any cwd), falls back to a
// walk-up search from `import.meta.dirname` looking for `.testatlas/commands/`.
//
// Methods supported:
//   - initialize      → returns capabilities + serverInfo + protocolVersion
//   - prompts/list    → returns 30 prompt entries with descriptions
//   - prompts/get     → returns the BOOTSTRAP_PREAMBLE-prefixed source body
//
// All other methods respond with JSON-RPC error -32601 ("Method not found").
// Malformed JSON lines respond with -32700 ("Parse error") when the request
// has a recoverable id; otherwise the line is dropped and a stderr log emitted.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  BOOTSTRAP_PREAMBLE,
  commandBaseNameFromSource,
  substituteAdapterCommandPath,
} from './lib/adapters/_shared.js';
import { listCommandFiles } from './lib/list-command-files.js';
import { extractFrontmatter, parseFrontmatter } from './lib/parse-frontmatter.js';

const SERVER_NAME = 'testatlas';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2025-11-25';

/**
 * Resolve the TestAtlas workspace root: directory containing `.testatlas/commands/`.
 * Honors $TESTATLAS_WORKSPACE first; otherwise walks up from this script's
 * directory until it finds one. Throws if no workspace is found — the server
 * cannot operate without a command source tree.
 *
 * @returns {string} absolute path to workspace root
 */
function resolveWorkspaceRoot() {
  const envOverride = process.env.TESTATLAS_WORKSPACE;
  if (envOverride && envOverride.length > 0) {
    return path.resolve(envOverride);
  }
  // Walk up from the script's directory.
  // `new URL(...).pathname` is Windows-broken (`/D:/...` → mangled by
  // path.resolve). `fileURLToPath` is the portable fallback for Node < 20.11.
  let dir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, '.testatlas', 'commands'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'mcp-server: could not locate workspace root (no .testatlas/commands/ found in ancestors). ' +
      'Set TESTATLAS_WORKSPACE=<path> in the environment.',
  );
}

/**
 * Read all source command files and return a sorted array of
 * `{ name, description, sourcePath, body }` records.
 *
 * @param {string} repoRoot
 * @returns {Promise<{ name: string, description: string, sourcePath: string, body: string, sourceText: string }[]>}
 */
async function loadPromptCatalog(repoRoot) {
  // V2 (Phase 14 Wave 5): include both flat V1 commands and V2 categorized
  // commands. The V2 prompt name is derived via commandBaseNameFromSource so
  // categorized commands carry their category prefix where needed (e.g.
  // `atlas-core-init` distinct from flat `atlas-init`).
  const sources = await listCommandFiles({ cwd: repoRoot, includeCategorized: true });
  const records = await Promise.all(
    sources.map(async (sp) => {
      const sourceText = await readFile(sp, 'utf8');
      const fm = parseFrontmatter(sourceText);
      const { body } = extractFrontmatter(sourceText);
      const baseName = commandBaseNameFromSource(sp);
      return {
        name: `atlas-${baseName}`,
        description: String(fm.description ?? '').trim(),
        sourcePath: sp,
        body,
        sourceText,
      };
    }),
  );
  // sources is already sorted by listCommandFiles; preserve order.
  return records;
}

/**
 * Build a JSON-RPC success response.
 *
 * @param {string|number|null} id
 * @param {unknown} result
 */
function ok(id, result) {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Build a JSON-RPC error response.
 *
 * @param {string|number|null} id
 * @param {number} code
 * @param {string} message
 * @param {unknown} [data]
 */
function err(id, code, message, data) {
  const e = { code, message };
  if (data !== undefined) e.data = data;
  return { jsonrpc: '2.0', id, error: e };
}

/**
 * Dispatch one JSON-RPC request. Returns the response object (or null for
 * notifications — requests with no `id` per JSON-RPC 2.0).
 *
 * @param {{
 *   request: { jsonrpc: string, id?: string|number, method: string, params?: object },
 *   catalog: Awaited<ReturnType<typeof loadPromptCatalog>>,
 * }} args
 * @returns {object | null}
 */
function dispatch({ request, catalog }) {
  const { id, method, params } = request;
  // Notification (no id) — the MCP spec uses the JSON-RPC 2.0 convention that
  // notifications are not responded to. We honor that.
  const isNotification = id === undefined || id === null;

  if (method === 'initialize') {
    if (isNotification) return null;
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { prompts: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }

  // The `notifications/initialized` notification from the client is part of
  // the handshake; we have nothing to do but acknowledge by silence.
  if (method === 'notifications/initialized' || method === 'initialized') {
    return null;
  }

  if (method === 'prompts/list') {
    if (isNotification) return null;
    return ok(id, {
      prompts: catalog.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: [],
      })),
    });
  }

  if (method === 'prompts/get') {
    if (isNotification) return null;
    const name = params?.name;
    if (!name || typeof name !== 'string') {
      return err(id, -32602, 'Invalid params: `name` (string) is required');
    }
    const entry = catalog.find((p) => p.name === name);
    if (!entry) {
      return err(id, -32602, `Unknown prompt: ${name}`);
    }
    // Quick 260507-hzw: substitute {{ADAPTER_COMMAND_PATH}} placeholder.
    // MCP prompts have no on-disk file the agent can re-read, so substitute
    // with the prompt-name-shaped pseudo-path "<MCP prompt: atlas-<name>>"
    // to make it explicit the body is delivered via JSON-RPC, not from disk.
    const preamble = substituteAdapterCommandPath(
      BOOTSTRAP_PREAMBLE,
      `<MCP prompt: ${entry.name}>`,
    );
    const text = `${preamble}\n\n${entry.body.trimStart()}`;
    return ok(id, {
      description: entry.description,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text },
        },
      ],
    });
  }

  if (isNotification) return null;
  return err(id, -32601, `Method not found: ${method}`);
}

/**
 * Run the server. Reads stdin line-by-line; each line is one JSON-RPC
 * request. Writes responses to stdout, one per line.
 */
async function main() {
  const repoRoot = resolveWorkspaceRoot();
  const catalog = await loadPromptCatalog(repoRoot);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Without a recoverable id we can't construct a proper JSON-RPC error
      // response per spec. Log to stderr (which the test ignores) so a real
      // operator can debug malformed traffic.
      process.stderr.write(`mcp-server: parse error on stdin line: ${trimmed.slice(0, 200)}\n`);
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      process.stderr.write('mcp-server: ignoring non-object stdin frame\n');
      return;
    }
    const response = dispatch({ request: parsed, catalog });
    if (response !== null) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((e) => {
  process.stderr.write(`mcp-server: fatal: ${e.message}\n`);
  process.exit(1);
});
