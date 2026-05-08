// test/scripts/lint-commands-inv-b.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-16. RED → GREEN coverage for INV-B
// outputs-vs-required-actions: extract `_testatlas/...` paths from a
// command body's `## Required Actions` section and require each path to
// also appear in the body's `## Outputs` section (or carry a deferred
// marker `<!-- output-deferred: <reason> -->`).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkOutputsVsRequiredActions } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-b-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkOutputsVsRequiredActions: POSITIVE — Outputs covers all Required Actions paths', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required Actions',
      '',
      '- Write `_testatlas/maps/apis.json`.',
      '- Write `_testatlas/03_execution_status.md`.',
      '',
      '## Outputs',
      '',
      '- `_testatlas/maps/apis.json`.',
      '- `_testatlas/03_execution_status.md`.',
      '',
    ].join('\n'),
  );
  const violations = await checkOutputsVsRequiredActions({ commandsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkOutputsVsRequiredActions: NEGATIVE — Required Actions writes missing path', async () => {
  const { commandsDir } = await makeFixtureRoot('neg');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required Actions',
      '',
      '- Write `_testatlas/maps/apis.json`.',
      '- Write `_testatlas/maps/cli.json`.',
      '',
      '## Outputs',
      '',
      '- `_testatlas/maps/apis.json`.',
      '',
    ].join('\n'),
  );
  const violations = await checkOutputsVsRequiredActions({ commandsDir });
  assert.equal(violations.length, 1, `expected 1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'outputs-missing-path');
  assert.match(violations[0].reason, /_testatlas\/maps\/cli\.json/);
  assert.equal(typeof violations[0].file, 'string');
  assert.equal(typeof violations[0].line, 'number');
  assert.ok(violations[0].suggestion);
});

test('checkOutputsVsRequiredActions: DEFERRED — output-deferred marker suppresses violation', async () => {
  const { commandsDir } = await makeFixtureRoot('deferred');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required Actions',
      '',
      '- Write `_testatlas/maps/apis.json` <!-- output-deferred: future plan -->.',
      '',
      '## Outputs',
      '',
      '- (none in this phase)',
      '',
    ].join('\n'),
  );
  const violations = await checkOutputsVsRequiredActions({ commandsDir });
  assert.equal(violations.length, 0, `deferred marker must suppress: ${JSON.stringify(violations)}`);
});

test('checkOutputsVsRequiredActions: NO-PATHS — Required Actions without paths produces no violation', async () => {
  const { commandsDir } = await makeFixtureRoot('nopath');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required Actions',
      '',
      '1. Open the explorer panel.',
      '2. Verify the result is rendered.',
      '',
      '## Outputs',
      '',
      '- (no on-disk artifacts)',
      '',
    ].join('\n'),
  );
  const violations = await checkOutputsVsRequiredActions({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkOutputsVsRequiredActions: NO-OUTPUTS-SECTION — silently skipped', async () => {
  const { commandsDir } = await makeFixtureRoot('nooutputs');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required Actions',
      '',
      '- Write `_testatlas/maps/apis.json`.',
      '',
    ].join('\n'),
  );
  const violations = await checkOutputsVsRequiredActions({ commandsDir });
  // INV-B requires both sections; absence of one is out-of-scope (other
  // invariants own structural-section presence).
  assert.equal(violations.length, 0);
});

test('checkOutputsVsRequiredActions: ALIAS — apis.json vs api.json caught by maps-path-consistency, not INV-B', async () => {
  // INV-B is exact-path matching. Singular/plural drift is owned by
  // maps-path-consistency (Round-11). INV-B may legitimately flag
  // `apis.json` (in Required Actions) when Outputs lists `api.json` —
  // both invariants surface, that's fine.
  const { commandsDir } = await makeFixtureRoot('alias');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required Actions',
      '',
      '- Write `_testatlas/maps/apis.json`.',
      '',
      '## Outputs',
      '',
      '- `_testatlas/maps/api.json`.',
      '',
    ].join('\n'),
  );
  const violations = await checkOutputsVsRequiredActions({ commandsDir });
  // INV-B should fire for apis.json missing from Outputs (exact-match).
  assert.ok(
    violations.length >= 1,
    `expected at least 1 violation (exact-match), got: ${JSON.stringify(violations)}`,
  );
});
