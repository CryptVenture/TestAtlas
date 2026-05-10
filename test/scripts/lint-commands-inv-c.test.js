// test/scripts/lint-commands-inv-c.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-17. RED → GREEN coverage for INV-C
// numerical-claim-vs-script: detect patterns like
// `<n> JSON + <m> JSONL = <total>` or `checks N artifacts` in command
// bodies; cross-reference to the cited script's array length where the
// script defines a static literal array of file constants. High-
// confidence-only — if the script's array length is not statically
// determinable, do NOT flag (false positives are worse than missing
// detections for this class).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkNumericalClaimVsScript } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-c-${label}-`));
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

const SCRIPT_WITH_20_3 = `#!/usr/bin/env node
const REQUIRED_JSON_FILES = [
  'manifest.json', 'state.json', 'domains.json', 'flows.json',
  'routes.json', 'components.json', 'commands.json', 'personas.json',
  'issues.json', 'evidence.json', 'risks.json', 'assumptions.json',
  'open_questions.json', 'decisions.json', 'coverage.json',
  'quality_scores.json', 'agent_sessions.json', 'drift.json',
  'embeddings_manifest.json', 'graph.json',
];
const REQUIRED_JSONL_FILES = [
  'claims.jsonl', 'observations.jsonl', 'events.jsonl',
];
`;

const SCRIPT_WITH_19_3 = `#!/usr/bin/env node
const REQUIRED_JSON_FILES = [
  'manifest.json', 'state.json', 'domains.json', 'flows.json',
  'routes.json', 'components.json', 'commands.json', 'personas.json',
  'issues.json', 'evidence.json', 'risks.json', 'assumptions.json',
  'open_questions.json', 'decisions.json', 'coverage.json',
  'quality_scores.json', 'agent_sessions.json', 'drift.json',
  'embeddings_manifest.json',
];
const REQUIRED_JSONL_FILES = [
  'claims.jsonl', 'observations.jsonl', 'events.jsonl',
];
`;

test('checkNumericalClaimVsScript: POSITIVE — claim matches static array lengths', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('pos');
  await writeScript(scriptsDir, 'foo.js', SCRIPT_WITH_20_3);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validates 20 JSON + 3 JSONL = 23 brain files.',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkNumericalClaimVsScript({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkNumericalClaimVsScript: NEGATIVE — claim cites wrong totals', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('neg');
  await writeScript(scriptsDir, 'foo.js', SCRIPT_WITH_20_3);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validates 19 JSON + 3 JSONL = 22 brain files.',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkNumericalClaimVsScript({ commandsDir, scriptsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'numerical-claim-mismatch');
  assert.match(violations[0].reason, /19|3|22|JSON/);
  assert.equal(typeof violations[0].file, 'string');
  assert.equal(typeof violations[0].line, 'number');
});

test('checkNumericalClaimVsScript: NEGATIVE — claim of 19 + 3 = 22 vs script 19 + 3 = 22 passes', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('neg2');
  await writeScript(scriptsDir, 'foo.js', SCRIPT_WITH_19_3);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validates 19 JSON + 3 JSONL = 22 brain files.',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkNumericalClaimVsScript({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0);
});

test('checkNumericalClaimVsScript: SKIP — no script invocation, no violation', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('noscript');
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Validates 19 JSON + 3 JSONL = 22 brain files.', ''].join('\n'),
  );
  const violations = await checkNumericalClaimVsScript({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0);
});

test('checkNumericalClaimVsScript: SKIP — script has no statically-determinable arrays', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('dynamic');
  await writeScript(
    scriptsDir,
    'foo.js',
    `#!/usr/bin/env node
const REQUIRED_JSON_FILES = await readArrayFromConfig();
`,
  );
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validates 5 JSON + 0 JSONL = 5 brain files.',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkNumericalClaimVsScript({ commandsDir, scriptsDir });
  assert.equal(
    violations.length,
    0,
    `dynamic arrays must be silently skipped: ${JSON.stringify(violations)}`,
  );
});

test('checkNumericalClaimVsScript: OPT-OUT — count-not-verified marker suppresses', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('optout');
  await writeScript(scriptsDir, 'foo.js', SCRIPT_WITH_20_3);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validates 19 JSON + 3 JSONL = 22 brain files. <!-- count-not-verified: legacy doc rev -->',
      '',
      'Run `node .testatlas/scripts/foo.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkNumericalClaimVsScript({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0);
});
