// test/commands/test-flow-all-flag.test.js
//
// Quick 260505-vj4 Task 1 (TDD RED → GREEN):
// asserts the literal-presence of the new `--all` mode contract inside
// .testatlas/commands/test-flow.md.
//
// Three assertions:
//   1. test-flow.md contains an H3 naming the `--all` mode.
//   2. The `--all` clause specifies the matrix filter (only flows
//      referenced by ≥1 scenario; flows with zero scenarios are
//      skipped silently).
//   3. The `--all` clause specifies that capability-blocked or
//      `pending: capability-required` scenarios are SKIPPED with
//      justification — `--all` MUST NOT halt on first capability skip.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'test-flow.md');

test('test-flow.md declares an H3 `--all` mode section', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(
    text,
    /^### `?--all`? mode/m,
    'test-flow.md must contain a `### --all mode` H3 section',
  );
});

test('test-flow.md `--all` clause documents the matrix scenario-filter (skip flows with zero scenarios)', async () => {
  const text = await readFile(FILE, 'utf8');
  // The --all section must reference the scenario matrix and the
  // skip-flows-with-zero-scenarios filter.
  assert.match(
    text,
    /flows? referenced by .{0,40}scenario|scenario.{0,40}matrix|matrix.{0,40}scenario/i,
    'test-flow.md `--all` clause must reference flows-referenced-by-≥1-scenario filter',
  );
  assert.match(
    text,
    /(zero|no)( in-scope)? scenarios?.{0,80}(skip|silent)/i,
    'test-flow.md `--all` clause must say flows with zero scenarios are skipped silently',
  );
});

test('test-flow.md `--all` clause says capability-blocked scenarios skip-not-halt', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(
    text,
    /capability-required|capability.{0,20}block|capability.{0,20}unavail/i,
    'test-flow.md `--all` clause must reference capability-required / capability-blocked scenarios',
  );
  assert.match(
    text,
    /(skip|skipped).{0,200}(not halt|continues?|MUST NOT halt|do(es)? not halt)/is,
    'test-flow.md `--all` clause must say capability-blocked scenarios are skipped — `--all` does NOT halt on first skip',
  );
});
