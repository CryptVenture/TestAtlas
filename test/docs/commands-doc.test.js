// test/docs/commands-doc.test.js
//
// Plan 08-05 Task 1 — `docs/COMMANDS.md` is auto-generated from
// `.testatlas/commands/*.md`. Asserts:
//   1. drift detection: regenerating produces output identical to the
//      checked-in `docs/COMMANDS.md`.
//   2. coverage: every `.testatlas/commands/*.md` (except README.md) has a
//      corresponding section heading in `docs/COMMANDS.md`.
//   3. count: section count is >= 30 (CMD-01 promises 30 commands).
//
// The drift test re-runs the generator into an in-memory string by importing
// `main()` from `scripts/generate-commands-doc.js` with `--stdout`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS_DIR = path.join(REPO_ROOT, '.testatlas', 'commands');
const DOCS_PATH = path.join(REPO_ROOT, 'docs', 'COMMANDS.md');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'generate-commands-doc.js');

function runGenerator(args = []) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('docs/COMMANDS.md: regenerating produces identical output (no drift)', async () => {
  const r = runGenerator(['--stdout']);
  assert.equal(r.status, 0, `generator exited ${r.status}: ${r.stderr}`);
  const onDisk = await readFile(DOCS_PATH, 'utf8');
  assert.equal(
    r.stdout,
    onDisk,
    'docs/COMMANDS.md is stale; run `node scripts/generate-commands-doc.js` to regenerate',
  );
});

test('docs/COMMANDS.md: every .testatlas/commands/*.md has a section', async () => {
  const onDisk = await readFile(DOCS_PATH, 'utf8');
  const entries = await readdir(COMMANDS_DIR);
  const cmdFiles = entries
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .map((n) => n.replace(/\.md$/, ''));
  assert.ok(cmdFiles.length >= 30, `expected >= 30 commands, got ${cmdFiles.length}`);
  for (const cmd of cmdFiles) {
    assert.match(
      onDisk,
      new RegExp(`^## /atlas:${cmd}$`, 'm'),
      `docs/COMMANDS.md missing section for ${cmd}`,
    );
  }
});

test('docs/COMMANDS.md: section count is >= 30 (CMD-01)', async () => {
  const onDisk = await readFile(DOCS_PATH, 'utf8');
  const sections = onDisk.match(/^## \/atlas:/gm) || [];
  assert.ok(
    sections.length >= 30,
    `docs/COMMANDS.md has ${sections.length} sections; CMD-01 requires >= 30`,
  );
});
