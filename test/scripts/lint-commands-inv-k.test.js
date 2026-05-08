// test/scripts/lint-commands-inv-k.test.js
//
// Quick 260508-u72 (Round-13 follow-up) — RED → GREEN coverage for INV-K
// product-name-canonicalization. Curated allowlist of canonical product
// names; flag case mismatches. Discovered by ISSUE-182 — "cloud
// Scheduler" vs "Cloud Scheduler".

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkProductNameCanonicalization } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-k-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkProductNameCanonicalization: POSITIVE — `Cloud Scheduler` (canonical) passes', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Schedule the job using Cloud Scheduler.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkProductNameCanonicalization: NEGATIVE — `cloud Scheduler` (mixed) flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('neg');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Schedule the job using cloud Scheduler.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'product-name-canonicalization');
});

test('checkProductNameCanonicalization: SKIP — compound `cloud-scheduler-cron` not flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('compound');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Use the cloud-scheduler-cron entry to trigger.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkProductNameCanonicalization: SKIP — inside fenced code block not flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('fence');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '```',
      'cloud scheduler --create my-job',
      '```',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkProductNameCanonicalization: SKIP — inside inline-code not flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('inline');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Set the option to `cloud scheduler` for the API call.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkProductNameCanonicalization: NEGATIVE — `aws lambda` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('aws');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Deploy to aws lambda for serverless execution.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.ok(violations.length >= 1);
  assert.match(violations[0].suggestion, /AWS Lambda/);
});

test('checkProductNameCanonicalization: NEGATIVE — `github actions` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('gha');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Run via github actions in CI.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkProductNameCanonicalization: OPT-OUT — product-name-allowed marker suppresses', async () => {
  const { commandsDir } = await makeFixtureRoot('marker');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Quote literally: "cloud scheduler" appears in user docs. <!-- product-name-allowed: literal-quote -->',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkProductNameCanonicalization: POSITIVE — `JSON Schema` (canonical) passes', async () => {
  const { commandsDir } = await makeFixtureRoot('json-schema');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Validate against the JSON Schema defined under `_testatlas/schemas/`.',
      '',
      '## Lifecycle',
      '',
      'Update brain.',
      '',
    ].join('\n'),
  );
  const violations = await checkProductNameCanonicalization({ commandsDir });
  assert.equal(violations.length, 0);
});
