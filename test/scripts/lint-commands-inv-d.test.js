// test/scripts/lint-commands-inv-d.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-18. RED → GREEN coverage for INV-D
// capability-stopcondition-non-contradiction: when the same capability
// (per `vocabulary.schema.json $defs.capability.enum`) is referenced in
// BOTH `## Capability Degradation` and `## Stop Conditions`, the
// command's behavior is internally contradictory — pick ONE outcome.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkCapabilityStopNonContradiction } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-d-${label}-`));
  const commandsDir = path.join(root, 'commands');
  const schemasDir = path.join(root, 'schemas');
  await mkdir(commandsDir, { recursive: true });
  await mkdir(schemasDir, { recursive: true });
  return { root, commandsDir, schemasDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

const FIXTURE_VOCAB = {
  $defs: {
    capability: {
      enum: ['shell', 'browser', 'web-fetch', 'MCP', 'subagent-spawn'],
    },
  },
};

async function writeVocab(schemasDir) {
  await writeFile(
    path.join(schemasDir, 'vocabulary.schema.json'),
    JSON.stringify(FIXTURE_VOCAB, null, 2),
    'utf8',
  );
}

test('checkCapabilityStopNonContradiction: POSITIVE — degrade-only is fine', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('pos');
  await writeVocab(schemasDir);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Capability Degradation',
      '',
      '- if shell unavailable, degrade to mtime-only',
      '',
      '## Stop Conditions',
      '',
      '- halts on parse error',
      '',
    ].join('\n'),
  );
  const violations = await checkCapabilityStopNonContradiction({
    commandsDir,
    schemasDir,
  });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkCapabilityStopNonContradiction: NEGATIVE — same capability degraded AND halted', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('neg');
  await writeVocab(schemasDir);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Capability Degradation',
      '',
      '- if shell unavailable, degrade to mtime-only',
      '',
      '## Stop Conditions',
      '',
      '- halts when shell is unavailable',
      '',
    ].join('\n'),
  );
  const violations = await checkCapabilityStopNonContradiction({
    commandsDir,
    schemasDir,
  });
  assert.equal(violations.length, 1, `expected 1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'capability-stopcondition-contradiction');
  assert.match(violations[0].reason, /shell/);
});

test('checkCapabilityStopNonContradiction: NEGATIVE — browser/MCP both directions', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('multi');
  await writeVocab(schemasDir);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Capability Degradation',
      '',
      '- if either MCP or browser is unavailable, degrade to a static-only sweep.',
      '',
      '## Stop Conditions',
      '',
      '- halts when MCP is unavailable.',
      '- halts when browser is unavailable.',
      '',
    ].join('\n'),
  );
  const violations = await checkCapabilityStopNonContradiction({
    commandsDir,
    schemasDir,
  });
  assert.ok(violations.length >= 2, `expected >=2 violations, got: ${JSON.stringify(violations)}`);
  const reasons = violations.map((v) => v.reason).join(' ');
  assert.match(reasons, /MCP/);
  assert.match(reasons, /browser/);
});

test('checkCapabilityStopNonContradiction: SKIP — only one section present', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('one');
  await writeVocab(schemasDir);
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', '## Capability Degradation', '', '- if shell unavailable, degrade.', ''].join(
      '\n',
    ),
  );
  const violations = await checkCapabilityStopNonContradiction({
    commandsDir,
    schemasDir,
  });
  assert.equal(violations.length, 0);
});

test('checkCapabilityStopNonContradiction: PROSE — capability mention in unrelated context not flagged', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('prose');
  await writeVocab(schemasDir);
  // "shell" appears in degrade context; Stop Conditions mention parse error
  // — no overlap.
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Capability Degradation',
      '',
      '- if shell is unavailable, degrade to mtime-only.',
      '',
      '## Stop Conditions',
      '',
      '- workspace missing → halt; the operator must run /atlas:core-init first.',
      '',
    ].join('\n'),
  );
  const violations = await checkCapabilityStopNonContradiction({
    commandsDir,
    schemasDir,
  });
  assert.equal(violations.length, 0);
});
