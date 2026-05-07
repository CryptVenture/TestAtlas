// test/mcp-server.test.js
//
// Plan 06-04 Task 3: subprocess JSON-RPC tests for scripts/mcp-server.js plus
// structural assertions on the manifest at
// `.testatlas/adapters/mcp/mcp-server-manifest.json`.
//
// Per MCP spec 2025-11-25 (06-RESEARCH.md §Q1.7 / §Q5):
//   - Transport: stdio, JSON-RPC 2.0, one message per line.
//   - `initialize` returns capabilities + serverInfo.
//   - `prompts/list` returns 30 entries (one per source command), each
//     `{ name: 'atlas-<cmd>', description: <string> }`.
//   - `prompts/get { name }` returns
//     `{ description, messages: [{ role: 'user', content: { type: 'text', text: <body> } }] }`
//     where text starts with the verbatim BOOTSTRAP_PREAMBLE.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE_PREFIX } from '../scripts/lib/adapters/_shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(repoRoot, 'scripts', 'mcp-server.js');
const MANIFEST_PATH = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'mcp',
  'mcp-server-manifest.json',
);

/**
 * Spawn the MCP server, send a sequence of JSON-RPC requests on stdin (one
 * per line), collect responses on stdout (one per line) until we have one
 * response per request, then close stdin and return the parsed responses.
 *
 * @param {object[]} requests
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<object[]>}
 */
function rpc(requests, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER_PATH], {
      cwd: repoRoot,
      env: { ...process.env, TESTATLAS_WORKSPACE: repoRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    /** @type {object[]} */
    const responses = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `mcp-server: timeout after ${timeoutMs}ms; got ${responses.length}/${requests.length}; stderr=${stderrBuf}`,
        ),
      );
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk;
      while (true) {
        const nl = stdoutBuf.indexOf('\n');
        if (nl === -1) break;
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (line.trim().length === 0) continue;
        try {
          responses.push(JSON.parse(line));
        } catch (err) {
          clearTimeout(timer);
          child.kill('SIGKILL');
          reject(new Error(`mcp-server: non-JSON line on stdout: ${line}; err=${err.message}`));
          return;
        }
        if (responses.length >= requests.length) {
          clearTimeout(timer);
          child.stdin.end();
          // Give the process a tick to exit cleanly; resolve immediately.
          resolve(responses);
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    for (const req of requests) {
      child.stdin.write(`${JSON.stringify(req)}\n`);
    }
  });
}

test('Test 1 (initialize): returns capabilities.prompts.listChanged === false + protocolVersion + serverInfo', async () => {
  const [resp] = await rpc([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    },
  ]);
  assert.equal(resp.jsonrpc, '2.0');
  assert.equal(resp.id, 1);
  assert.ok(resp.result, `expected resp.result, got: ${JSON.stringify(resp)}`);
  assert.equal(resp.result.capabilities?.prompts?.listChanged, false);
  assert.equal(resp.result.protocolVersion, '2025-11-25');
  assert.equal(resp.result.serverInfo?.name, 'testatlas');
  assert.ok(resp.result.serverInfo?.version);
});

test('Test 2 (prompts/list): returns K entries (V1 flat + V2 categorized) with shape { name: "atlas-<cmd>", description: <non-empty> }', async () => {
  // V2 (Phase 14 Wave 5): the MCP server now exposes both flat V1 commands
  // and V2 categorized commands as prompts; the count is computed from the
  // live source tree so adding a command does not require updating this test.
  const { listCategorizedCommandFiles, listCommandFiles } = await import(
    '../scripts/lib/list-command-files.js'
  );
  const flat = (await listCommandFiles({ cwd: process.cwd() })).length;
  const cat = (await listCategorizedCommandFiles({ cwd: process.cwd() })).length;
  const expected = flat + cat;

  const responses = await rpc([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    },
    { jsonrpc: '2.0', id: 2, method: 'prompts/list' },
  ]);
  const listResp = responses.find((r) => r.id === 2);
  assert.ok(listResp, `expected response with id=2; got: ${JSON.stringify(responses)}`);
  assert.ok(Array.isArray(listResp.result?.prompts), 'result.prompts must be an array');
  assert.equal(listResp.result.prompts.length, expected, `must return exactly ${expected} prompts`);
  for (const p of listResp.result.prompts) {
    assert.match(p.name, /^atlas-/, `each prompt name must begin with "atlas-": got ${p.name}`);
    assert.ok(
      typeof p.description === 'string' && p.description.length > 0,
      `prompt ${p.name} must have non-empty description`,
    );
  }
});

test('Test 3 (prompts/get atlas-core-init): returns description + messages[0].content.text starting with BOOTSTRAP_PREAMBLE', async () => {
  // Phase 17 Plan 17-04 deleted V1 commands/init.md (slash collision fix);
  // the canonical /atlas:init source is now commands/core/init.md, which
  // surfaces in the MCP prompts manifest as `atlas-core-init`.
  const responses = await rpc([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    },
    { jsonrpc: '2.0', id: 3, method: 'prompts/get', params: { name: 'atlas-core-init' } },
  ]);
  const getResp = responses.find((r) => r.id === 3);
  assert.ok(getResp, `expected response with id=3; got: ${JSON.stringify(responses)}`);
  assert.ok(
    typeof getResp.result?.description === 'string' && getResp.result.description.length > 0,
  );
  assert.ok(Array.isArray(getResp.result.messages) && getResp.result.messages.length >= 1);
  const msg = getResp.result.messages[0];
  assert.equal(msg.role, 'user');
  assert.equal(msg.content?.type, 'text');
  assert.ok(typeof msg.content.text === 'string');
  // Quick 260507-hzw: BOOTSTRAP_PREAMBLE carries an {{ADAPTER_COMMAND_PATH}}
  // placeholder substituted at runtime per delivery channel. MCP server
  // substitutes with `<MCP prompt: atlas-<name>>`. The placeholder-free
  // prefix is byte-stable across all channels and is what we pin here.
  assert.ok(
    msg.content.text.includes(BOOTSTRAP_PREAMBLE_PREFIX),
    `prompts/get atlas-core-init text must contain bootstrap preamble`,
  );
  assert.ok(
    msg.content.text.includes('<MCP prompt: atlas-core-init>'),
    `prompts/get atlas-core-init text must substitute {{ADAPTER_COMMAND_PATH}} for the MCP-prompt pseudo-path`,
  );
});

test('Test 4 (manifest matches server): manifest.prompts.length === K (V1 + V2) and every name matches a prompts/list entry', async () => {
  const { listCategorizedCommandFiles, listCommandFiles } = await import(
    '../scripts/lib/list-command-files.js'
  );
  const flat = (await listCommandFiles({ cwd: process.cwd() })).length;
  const cat = (await listCategorizedCommandFiles({ cwd: process.cwd() })).length;
  const expected = flat + cat;
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.name, 'testatlas');
  assert.equal(manifest.capabilities?.prompts?.listChanged, false);
  assert.ok(Array.isArray(manifest.prompts));
  assert.equal(manifest.prompts.length, expected, `manifest must declare ${expected} prompts`);

  const responses = await rpc([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    },
    { jsonrpc: '2.0', id: 2, method: 'prompts/list' },
  ]);
  const listResp = responses.find((r) => r.id === 2);
  const serverNames = new Set(listResp.result.prompts.map((p) => p.name));
  for (const p of manifest.prompts) {
    assert.ok(serverNames.has(p.name), `manifest prompt ${p.name} not returned by prompts/list`);
  }
});

test('Test 5: README.md exists with required sections (Install / Capabilities / prompts / stdio / NO PER-COMMAND FILES)', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'mcp', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'prompts', 'stdio', 'PER-COMMAND']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section/topic: ${heading}`);
  }
  assert.match(text, /mcp-server\.js/, 'README must reference scripts/mcp-server.js');
});
