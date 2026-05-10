// test/scripts/lint-commands-inv-e.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-19. RED → GREEN coverage for INV-E
// mcp-tool-param-validity: maintains a curated allowlist of MCP-tool
// params (in scripts/lib/mcp-tool-catalog.js) and flags invocations
// citing unknown params in command-body fences / inline-code examples.
//
// Tools NOT in the catalog are silently passed (lenient default — we
// only flag KNOWN-INVALID).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  getMcpToolCatalog,
  isValidMcpToolCall,
  MCP_TOOL_CATALOG,
} from '../../scripts/lib/mcp-tool-catalog.js';
import { checkMcpToolParamValidity } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-e-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('mcp-tool-catalog: shape — wait_for accepts text/selector/timeout, not settle', () => {
  const cat = getMcpToolCatalog();
  assert.deepEqual([...cat['mcp__chrome-devtools__wait_for'].params].sort(), [
    'selector',
    'text',
    'timeout',
  ]);
});

test('mcp-tool-catalog: shape — lighthouse_audit has no categories param', () => {
  const cat = MCP_TOOL_CATALOG['mcp__chrome-devtools__lighthouse_audit'];
  assert.ok(!cat.params.includes('categories'));
  assert.ok(!cat.params.includes('category'));
  assert.ok(cat.params.includes('mode'));
});

test('isValidMcpToolCall: lenient default for uncatalogued tools', () => {
  const r = isValidMcpToolCall('mcp__chrome-devtools__some_new_tool', ['foo']);
  assert.equal(r.valid, true);
  assert.equal(r.catalogued, false);
});

test('isValidMcpToolCall: settle is invalid for wait_for', () => {
  const r = isValidMcpToolCall('mcp__chrome-devtools__wait_for', ['settle']);
  assert.equal(r.valid, false);
  assert.deepEqual(r.invalid, ['settle']);
});

test('checkMcpToolParamValidity: POSITIVE — valid wait_for params', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Use `wait_for({text: ["loaded"], timeout: 5000})` to wait for content.',
      '',
    ].join('\n'),
  );
  const violations = await checkMcpToolParamValidity({ commandsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkMcpToolParamValidity: NEGATIVE — wait_for with settle param flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('neg-settle');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Use `wait_for({settle: true})` to wait for the route to settle.', ''].join('\n'),
  );
  const violations = await checkMcpToolParamValidity({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'mcp-tool-param-invalid');
  assert.match(violations[0].reason, /settle/);
});

test('checkMcpToolParamValidity: NEGATIVE — lighthouse_audit with category param flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('neg-cat');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Run `lighthouse_audit({url: "/", category: "accessibility"})` to filter.',
      '',
    ].join('\n'),
  );
  const violations = await checkMcpToolParamValidity({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'mcp-tool-param-invalid');
  assert.match(violations[0].reason, /category/);
});

test('checkMcpToolParamValidity: lenient — uncatalogued tool not flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('lenient');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Use `some_undocumented_tool({foo: "bar"})` for X.', ''].join('\n'),
  );
  const violations = await checkMcpToolParamValidity({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkMcpToolParamValidity: code-fence example flagged too', async () => {
  const { commandsDir } = await makeFixtureRoot('fence');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', '```', 'wait_for({settle: true})', '```', ''].join('\n'),
  );
  const violations = await checkMcpToolParamValidity({ commandsDir });
  assert.ok(violations.length >= 1);
});
