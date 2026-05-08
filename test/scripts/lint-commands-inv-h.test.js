// test/scripts/lint-commands-inv-h.test.js
//
// Quick 260508-u72 (Round-13 follow-up) — RED → GREEN coverage for INV-H
// missing-canonical-section. Every command body MUST have a `## Lifecycle`
// H2 section (or carry the `<!-- no-lifecycle: <reason> -->` opt-out
// marker). Discovered by ISSUE-187 — `council-test-plan.md` was missing the
// Lifecycle section entirely; the prior `lifecycle-heading-strict`
// invariant only caught misnamed lifecycle, not absent.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkMissingCanonicalSection } from '../../scripts/lint-commands.js';

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-inv-h-${label}-`));
  const commandsDir = path.join(root, 'commands');
  await mkdir(commandsDir, { recursive: true });
  return { root, commandsDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

test('checkMissingCanonicalSection: POSITIVE — `## Lifecycle` heading present passes', async () => {
  const { commandsDir } = await makeFixtureRoot('pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required First Reads',
      '',
      'Some content.',
      '',
      '## Lifecycle',
      '',
      'After running, call `node .testatlas/scripts/update-brain-after-command.js`.',
      '',
    ].join('\n'),
  );
  const violations = await checkMissingCanonicalSection({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkMissingCanonicalSection: NEGATIVE — file with no `## Lifecycle` flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('neg');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Required First Reads',
      '',
      'Some content but no lifecycle section.',
      '',
    ].join('\n'),
  );
  const violations = await checkMissingCanonicalSection({ commandsDir });
  assert.ok(violations.length >= 1, `expected >=1 violation, got: ${JSON.stringify(violations)}`);
  assert.equal(violations[0].invariant, 'missing-canonical-section');
});

test('checkMissingCanonicalSection: OPT-OUT — no-lifecycle marker suppresses', async () => {
  const { commandsDir } = await makeFixtureRoot('marker');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '<!-- no-lifecycle: read-only doc surface, no brain-write side-effects -->',
      '',
      '## Required First Reads',
      '',
      'Some content.',
      '',
    ].join('\n'),
  );
  const violations = await checkMissingCanonicalSection({ commandsDir });
  assert.equal(violations.length, 0);
});

test('checkMissingCanonicalSection: NEGATIVE — only H1 lifecycle does not satisfy (must be H2)', async () => {
  const { commandsDir } = await makeFixtureRoot('h1only');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Lifecycle',
      '',
      'A document about lifecycles, but not a command lifecycle section.',
      '',
    ].join('\n'),
  );
  const violations = await checkMissingCanonicalSection({ commandsDir });
  assert.ok(violations.length >= 1);
});

test('checkMissingCanonicalSection: POSITIVE — `## Lifecycle` with trailing whitespace still passes', async () => {
  const { commandsDir } = await makeFixtureRoot('trail');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      '## Lifecycle   ',
      '',
      'After-run notes.',
      '',
    ].join('\n'),
  );
  const violations = await checkMissingCanonicalSection({ commandsDir });
  assert.equal(violations.length, 0);
});
