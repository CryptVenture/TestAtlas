// test/docs/schemas-doc.test.js
//
// Plan 08-05 Task 1 — `docs/SCHEMAS.md` is auto-generated from
// `.testatlas/schemas/*.schema.json`. Asserts:
//   1. drift detection: regenerating produces identical output.
//   2. coverage: every schema file has a section.
//   3. count: section count is >= 19 (15 PRD §21 + adapter-capabilities +
//      command-instruction + install-manifest + example-script-schema).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.testatlas', 'schemas');
const DOCS_PATH = path.join(REPO_ROOT, 'docs', 'SCHEMAS.md');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'generate-schemas-doc.js');

function runGenerator(args = []) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('docs/SCHEMAS.md: regenerating produces identical output (no drift)', async () => {
  const r = runGenerator(['--stdout']);
  assert.equal(r.status, 0, `generator exited ${r.status}: ${r.stderr}`);
  const onDisk = await readFile(DOCS_PATH, 'utf8');
  assert.equal(
    r.stdout,
    onDisk,
    'docs/SCHEMAS.md is stale; run `node scripts/generate-schemas-doc.js` to regenerate',
  );
});

test('docs/SCHEMAS.md: every .testatlas/schemas/*.schema.json has a section', async () => {
  const onDisk = await readFile(DOCS_PATH, 'utf8');
  const entries = await readdir(SCHEMAS_DIR);
  const schemaFiles = entries.filter((n) => n.endsWith('.schema.json'));
  assert.ok(schemaFiles.length >= 20, `expected >= 20 schemas, got ${schemaFiles.length}`);
  for (const file of schemaFiles) {
    // Section heading uses schema title; assert link to source file is present.
    assert.match(
      onDisk,
      new RegExp(`\\.testatlas/schemas/${file.replace(/\./g, '\\.')}`),
      `docs/SCHEMAS.md missing source link for ${file}`,
    );
  }
});

test('docs/SCHEMAS.md: section count is >= 19', async () => {
  const onDisk = await readFile(DOCS_PATH, 'utf8');
  const sections = onDisk.match(/^## /gm) || [];
  assert.ok(
    sections.length >= 19,
    `docs/SCHEMAS.md has ${sections.length} top-level sections; expected >= 19`,
  );
});
