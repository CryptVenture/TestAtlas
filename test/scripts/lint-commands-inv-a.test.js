// test/scripts/lint-commands-inv-a.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-15. RED → GREEN coverage for INV-A
// stop-code-existence: parse `## Stop Conditions` blocks for uppercase
// enum-style code literals (e.g. WORKSPACE_MISSING, BACKUP_FAILED), then
// verify each code appears in the source of at least one
// `node .testatlas/scripts/<x>.js` invocation cited in the same body.
// Codes that don't appear in any referenced script's throw / Error /
// status return are violations.
//
// Heuristic (must match implementation):
//   - tokens matching /[A-Z][A-Z0-9_]{4,}/ — ≥5 chars to skip acronyms
//   - filtered against a small allowlist of generic halt words (STOP,
//     HALT, ERROR, OK, FAIL).
//   - check is skipped when the body has no script invocations (cannot
//     verify); also skipped when the line is purely prose ("halts on
//     parse error") — only uppercase enum tokens trigger the check.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkStopCodeExistence } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-a-${label}-`));
  const commandsDir = path.join(root, 'commands');
  const scriptsDir = path.join(root, 'scripts');
  await mkdir(commandsDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });
  return { root, commandsDir, scriptsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

async function writeScript(scriptsDir, name, body) {
  await writeFile(path.join(scriptsDir, name), body, 'utf8');
}

test('checkStopCodeExistence: POSITIVE — code exists in referenced script', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('pos');
  await writeScript(
    scriptsDir,
    'foo.js',
    [
      '#!/usr/bin/env node',
      "if (!ws) throw new Error('WORKSPACE_MISSING — no workspace at ' + dir);",
      "if (failedBackup) { err.code = 'BACKUP_FAILED'; throw err; }",
    ].join('\n'),
  );
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- `WORKSPACE_MISSING` — workspace not present',
      '- `BACKUP_FAILED` — fs.cp failed',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkStopCodeExistence: NEGATIVE — fictional code not in any referenced script', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('neg');
  await writeScript(
    scriptsDir,
    'foo.js',
    ['#!/usr/bin/env node', "if (!ws) throw new Error('WORKSPACE_MISSING');"].join('\n'),
  );
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- `WORKSPACE_MISSING` — workspace not present',
      '- `TESTATLAS_FICTIONAL_CODE` — does not exist',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(violations.length, 1, `expected 1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'stop-code-existence');
  assert.match(violations[0].reason, /TESTATLAS_FICTIONAL_CODE/);
  assert.equal(typeof violations[0].file, 'string');
  assert.equal(typeof violations[0].line, 'number');
  assert.ok(violations[0].suggestion);
});

test('checkStopCodeExistence: NO-STOP-CONDITIONS — no violation', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('nostop');
  await writeScript(scriptsDir, 'foo.js', '/* fixture */');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Run `node .testatlas/scripts/foo.js`.', ''].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0);
});

test('checkStopCodeExistence: NO-SCRIPT-INVOCATIONS — cannot verify, no violation', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('noscript');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- `SOMETHING_WEIRD` — out of scope without scripts',
      '',
    ].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0);
});

test('checkStopCodeExistence: PROSE-ONLY — text-only descriptions not flagged', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('prose');
  await writeScript(scriptsDir, 'foo.js', '/* fixture, no codes */');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- halts on parse error',
      '- halts when input is missing',
      '- exits with non-zero status if the workspace is unwritable',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(
    violations.length,
    0,
    `prose-only stop conditions must not be flagged, got: ${JSON.stringify(violations)}`,
  );
});

test('checkStopCodeExistence: ALLOWLIST — generic halt words ignored', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('generic');
  await writeScript(scriptsDir, 'foo.js', '/* fixture */');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- `ERROR` — generic',
      '- `HALT` — generic',
      '- `EACCES` — POSIX errno',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(
    violations.length,
    0,
    `generic halt words must be allowlisted: ${JSON.stringify(violations)}`,
  );
});

test('checkStopCodeExistence: code matches any of multiple referenced scripts', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('multi');
  await writeScript(scriptsDir, 'foo.js', "throw new Error('WORKSPACE_MISSING')");
  await writeScript(scriptsDir, 'bar.js', "throw new Error('BACKUP_FAILED')");
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- `WORKSPACE_MISSING` — workspace not present',
      '- `BACKUP_FAILED` — fs.cp failed',
      '',
      'Run `node .testatlas/scripts/foo.js` then `node .testatlas/scripts/bar.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkStopCodeExistence({ commandsDir, scriptsDir });
  assert.equal(
    violations.length,
    0,
    `union over referenced scripts: ${JSON.stringify(violations)}`,
  );
});
