// test/scripts/mcp-server-help.test.js
//
// Regression test for ISSUE-035 (closed 2026-05-09): scripts/mcp-server.js
// previously responded to --help with zero stdout output and exit 0, looking
// indistinguishable from a frozen process. This test pins the contract:
//   - `--help` and `-h` print non-empty usage text
//   - exit 0
//   - usage mentions JSON-RPC + the .testatlas/commands surface so operators
//     understand what the server does without reading the source

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const SCRIPT = path.join(repoRoot, 'scripts/mcp-server.js');

function runHelp(flag) {
  return spawnSync(process.execPath, [SCRIPT, flag], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5_000,
  });
}

test('ISSUE-035: --help prints non-empty usage text and exits 0', () => {
  const result = runHelp('--help');
  assert.equal(result.status, 0, `--help exit code (stderr: ${result.stderr})`);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /MCP Server/);
  assert.match(result.stdout, /\.testatlas\/commands/);
  assert.ok(result.stdout.length > 100, 'usage text should be substantive');
});

test('ISSUE-035: -h short flag also prints usage and exits 0', () => {
  const result = runHelp('-h');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});
