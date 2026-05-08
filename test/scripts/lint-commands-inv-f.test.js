// test/scripts/lint-commands-inv-f.test.js
//
// Quick 260508-u72 — Wave-6 PLAN-20. RED → GREEN coverage for INV-F
// duplicate-section-headings: any `^## <heading>$` (case-insensitive)
// appearing more than once in the same file is HARD-FAIL. Subsumes
// the Round-11 lifecycle-heading-strict invariant (which only covered
// the canonical "## Lifecycle" alias forms).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkDuplicateSectionHeadings } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-f-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkDuplicateSectionHeadings: POSITIVE — single Lifecycle heading passes', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Lifecycle',
      '',
      '- step',
      '',
      '## Stop Conditions',
      '',
      '- none',
      '',
    ].join('\n'),
  );
  const violations = await checkDuplicateSectionHeadings({ commandsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkDuplicateSectionHeadings: NEGATIVE — two `## Lifecycle` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('neg-life');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Lifecycle',
      '',
      '- step',
      '',
      '## Lifecycle',
      '',
      '- duplicate!',
      '',
    ].join('\n'),
  );
  const violations = await checkDuplicateSectionHeadings({ commandsDir });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].invariant, 'duplicate-section-heading');
  assert.match(violations[0].reason, /Lifecycle/);
});

test('checkDuplicateSectionHeadings: NEGATIVE — two `## Outputs` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('neg-out');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Outputs',
      '',
      '- foo',
      '',
      '## Outputs',
      '',
      '- duplicate!',
      '',
    ].join('\n'),
  );
  const violations = await checkDuplicateSectionHeadings({ commandsDir });
  assert.equal(violations.length, 1);
  assert.match(violations[0].reason, /Outputs/);
});

test('checkDuplicateSectionHeadings: H3 nested with same name does not collide with H2', async () => {
  const { commandsDir } = await makeFixtureRoot('h3-ok');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Lifecycle',
      '',
      '### Lifecycle',
      '',
      '- nested ok',
      '',
    ].join('\n'),
  );
  const violations = await checkDuplicateSectionHeadings({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkDuplicateSectionHeadings: case-insensitive — `## Stop Conditions` and `## stop conditions` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('case');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Stop Conditions',
      '',
      '- a',
      '',
      '## stop conditions',
      '',
      '- b',
      '',
    ].join('\n'),
  );
  const violations = await checkDuplicateSectionHeadings({ commandsDir });
  assert.equal(violations.length, 1);
});
