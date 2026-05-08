// test/scripts/lint-commands-inv-j.test.js
//
// Quick 260508-u72 (Round-13 follow-up) — RED → GREEN coverage for INV-J
// undefined-cross-reference. References like `F-\d+`, `INV-\w+`,
// `LCB-\d+`, `§\d+` in command bodies must resolve to a defined anchor
// in the same file or an explicitly-referenced doc. Discovered by
// ISSUE-175 — `explore.md` referenced `F-10` with no anchor.
//
// Lenient by design — only flag when the token is unambiguously dangling
// (no surrounding doc context). False positives are worse than missed
// catches here.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkUndefinedCrossReference } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-j-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkUndefinedCrossReference: NEGATIVE — bare `(F-10)` with no anchor flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('bare-f');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Some prose referencing (F-10) standalone.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'undefined-cross-reference');
});

test('checkUndefinedCrossReference: POSITIVE — `per F-10 in explore-codebase.md` passes', async () => {
  const { commandsDir } = await makeFixtureRoot('per-doc');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'See per F-10 in explore-codebase.md for context.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkUndefinedCrossReference: POSITIVE — anchor defined in same file passes', async () => {
  const { commandsDir } = await makeFixtureRoot('anchor');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '<a id="F-10"></a>',
      '',
      'Earlier we saw F-10.',
      '',
      'Now references (F-10) again.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkUndefinedCrossReference: POSITIVE — `**F-10**` heading-style anchor accepted', async () => {
  const { commandsDir } = await makeFixtureRoot('bold');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '**F-10** — defines the F-10 finding here.',
      '',
      'Later we cite F-10 again.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkUndefinedCrossReference: POSITIVE — `INV-A (lint-commands.js)` parenthetical doc-ref passes', async () => {
  const { commandsDir } = await makeFixtureRoot('inv-paren');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'See INV-A (lint-commands.js) for the related invariant.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkUndefinedCrossReference: POSITIVE — `§22 (PRD)` parenthetical passes', async () => {
  const { commandsDir } = await makeFixtureRoot('prd-paren');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Per §22 (PRD), this command must …',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkUndefinedCrossReference: NEGATIVE — bare `INV-Z` (undefined letter) standalone flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('bare-inv');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validators must enforce INV-Z without exception.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkUndefinedCrossReference: OPT-OUT — xref-allowed marker suppresses', async () => {
  const { commandsDir } = await makeFixtureRoot('marker');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'See (F-10) for details. <!-- xref-allowed: deliberately-loose -->',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkUndefinedCrossReference: POSITIVE — `see F-10` (cue word) passes (lenient)', async () => {
  const { commandsDir } = await makeFixtureRoot('see-cue');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'See F-10 for follow-up.', '', '## Lifecycle', '', 'Update brain.', ''].join(
      '\n',
    ),
  );
  const violations = await checkUndefinedCrossReference({ commandsDir });
  // Lenient — `see` is a cue word that suggests an upstream reference.
  assert.equal(violations.length, 0);
});
