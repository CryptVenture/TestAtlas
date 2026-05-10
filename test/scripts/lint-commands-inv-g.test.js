// test/scripts/lint-commands-inv-g.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-21. RED → GREEN coverage for INV-G
// bare-script-path-everywhere: tightens the existing Round-11
// bare-script-path invariant (LCB-11) to also catch references inside
// narrative prose AND inline backticks. Adds an explicit opt-out marker
// (`<!-- bare-script-path-allowed: source-repo-reference -->`) for
// legitimate source-repo file-location references.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkBareScriptPath } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-g-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkBareScriptPath: POSITIVE — `node .testatlas/scripts/X.js` form passes', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Run `node .testatlas/scripts/foo.js`.', ''].join('\n'),
  );
  const violations = await checkBareScriptPath({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkBareScriptPath: NEGATIVE — bare `scripts/X.js` in narrative prose flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('narrative');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'See scripts/foo.js for the implementation.', ''].join('\n'),
  );
  const violations = await checkBareScriptPath({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'bare-script-path');
});

test('checkBareScriptPath: NEGATIVE — bare `scripts/X.js` inside inline-code flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('inline');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'See `scripts/foo.js` for the implementation.', ''].join('\n'),
  );
  const violations = await checkBareScriptPath({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkBareScriptPath: OPT-OUT — bare-script-path-allowed marker suppresses', async () => {
  const { commandsDir } = await makeFixtureRoot('marker');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'See scripts/foo.js for the implementation. <!-- bare-script-path-allowed: source-repo-reference -->',
      '',
    ].join('\n'),
  );
  const violations = await checkBareScriptPath({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkBareScriptPath: OPT-OUT — marker on inline-code form', async () => {
  const { commandsDir } = await makeFixtureRoot('marker-ic');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'See `scripts/foo.js` for impl. <!-- bare-script-path-allowed: doc-only -->',
      '',
    ].join('\n'),
  );
  const violations = await checkBareScriptPath({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkBareScriptPath: NEGATIVE — fenced code with bare path flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('fence');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', '```', 'scripts/foo.js --flag', '```', ''].join('\n'),
  );
  const violations = await checkBareScriptPath({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkBareScriptPath: legacy explicit-file allowlist still honored', async () => {
  const { commandsDir } = await makeFixtureRoot('allow');
  await writeCmd(
    commandsDir,
    'allowed.md',
    ['# Allowed', '', 'See scripts/foo.js for context.', ''].join('\n'),
  );
  const violations = await checkBareScriptPath({
    commandsDir,
    allowlist: [{ fileRe: /allowed\.md$/, lineRe: /scripts\/foo\.js/ }],
  });
  assert.equal(violations.length, 0);
});
