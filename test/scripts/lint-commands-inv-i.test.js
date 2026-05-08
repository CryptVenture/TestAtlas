// test/scripts/lint-commands-inv-i.test.js
//
// Quick 260508-u72 (Round-13 follow-up) — RED → GREEN coverage for INV-I
// shell-required-in-fallback. "Manual fallback (no shell)" /
// "Fallback path (no shell)" prose blocks must NOT propose using
// shell-only tools (git, find, grep, node, npx, pnpm, etc.). Discovered
// by ISSUE-176 — explore-tests.md proposed `git ls-files` in the
// no-shell fallback, a logical contradiction.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkShellRequiredInFallback } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-i-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkShellRequiredInFallback: POSITIVE — fallback proposes only Read tool / file-write capability passes', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '### Manual fallback (no `shell`)',
      '',
      '- Use the Read tool to load each candidate file from the workspace.',
      '- Use the file-write capability to emit the inventory artifact.',
      '',
      '## Lifecycle',
      '',
      'See update-brain hook.',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkShellRequiredInFallback: NEGATIVE — fallback proposing `git ls-files` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('git');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '### Manual fallback (no `shell`)',
      '',
      '- Use `git ls-files` to enumerate test files.',
      '- Then write the inventory.',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'shell-required-in-fallback');
});

test('checkShellRequiredInFallback: NEGATIVE — fallback proposing `find ./src` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('find');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '### Fallback path (no shell)',
      '',
      'Use `find ./src -name "*.test.js"` to enumerate.',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkShellRequiredInFallback: NEGATIVE — fallback proposing `node script.js` flagged (node still requires shell)', async () => {
  const { commandsDir } = await makeFixtureRoot('node');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '### Fallback (no shell)',
      '',
      '- Run `node .testatlas/scripts/foo.js --x`.',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkShellRequiredInFallback: OPT-OUT — shell-fallback-allowed marker suppresses', async () => {
  const { commandsDir } = await makeFixtureRoot('marker');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '### Manual fallback (no `shell`)',
      '',
      '- Use `git ls-files` (this command runs natively, not via subprocess). <!-- shell-fallback-allowed: builtin-git -->',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkShellRequiredInFallback: NEGATIVE — fallback proposing `pnpm test` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('pnpm');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '### Manual fallback (no shell)',
      '',
      '- Run `pnpm test --filter foo`.',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkShellRequiredInFallback: outside-fallback context not flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('outside');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Setup',
      '',
      'Run `git ls-files` to enumerate before running this command.',
      '',
      '## Lifecycle',
      '',
      'See update-brain hook.',
      '',
    ].join('\n'),
  );
  const violations = await checkShellRequiredInFallback({ commandsDir });
  assert.equal(violations.length, 0);
});
