// test/commands/parse-frontmatter.test.js
//
// Unit tests for scripts/lib/parse-frontmatter.js (CMD-04).
// Also covers list-command-files.js (LIFECYCLE_FILES + listCommandFiles).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  extractFrontmatter,
  parseFrontmatter,
} from '../../scripts/lib/parse-frontmatter.js';
import {
  LIFECYCLE_FILES,
  listCommandFiles,
} from '../../scripts/lib/list-command-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIX_DIR = path.join(REPO_ROOT, 'test/fixtures/commands');

test('parse-frontmatter: parses minimal-valid.md with all 8 required fields', async () => {
  const text = await readFile(path.join(FIX_DIR, 'minimal-valid.md'), 'utf8');
  const fm = parseFrontmatter(text);
  assert.equal(fm.command, 'minimal-valid');
  assert.equal(fm.version, '1.0.0');
  assert.ok(typeof fm.description === 'string' && fm.description.length > 0);
  assert.deepEqual(fm.capabilities, ['shell', 'file-write']);
  assert.deepEqual(fm.produces, ['command-result']);
  assert.deepEqual(fm.consumes, ['workspace-manifest', 'bootstrap']);
  assert.deepEqual(fm.lifecycle, [
    '03_execution_status.md',
    '09_artifact_index.md',
    '10_command_log.md',
    '11_workspace_manifest.json',
    'history/run_log.md',
  ]);
  assert.ok(typeof fm.boundary === 'string' && fm.boundary.length >= 20);
});

test('parse-frontmatter: rejects malformed-frontmatter.md (missing closing fence)', async () => {
  const text = await readFile(path.join(FIX_DIR, 'malformed-frontmatter.md'), 'utf8');
  assert.throws(() => parseFrontmatter(text), /missing closing/i);
});

test('parse-frontmatter: rejects file not starting with `---` on line 1', () => {
  assert.throws(() => parseFrontmatter('# Title\n\nNo fence.\n'), /must start with `---`/);
});

test('parse-frontmatter: parses inline arrays', () => {
  const text = '---\ncapabilities: [shell, file-write]\n---\n';
  const fm = parseFrontmatter(text);
  assert.deepEqual(fm.capabilities, ['shell', 'file-write']);
});

test('parse-frontmatter: parses block arrays', () => {
  const text = '---\nproduces:\n  - app-map\n  - domain\n---\n';
  const fm = parseFrontmatter(text);
  assert.deepEqual(fm.produces, ['app-map', 'domain']);
});

test('parse-frontmatter: strips single-quoted and double-quoted scalars', () => {
  const text = `---\ndescription: "Foo bar"\nversion: '1.0.0'\n---\n`;
  const fm = parseFrontmatter(text);
  assert.equal(fm.description, 'Foo bar');
  assert.equal(fm.version, '1.0.0');
});

test('parse-frontmatter: rejects nested-object syntax (no block-array dash)', () => {
  // After `nested:` the indented line `key: value` is not a `- item`,
  // so the parser sees an empty value with no block-array following.
  const text = '---\nnested:\n  key: value\n---\n';
  assert.throws(() => parseFrontmatter(text), /expects a block array|malformed line/i);
});

test('extract-frontmatter: returns frontmatterText and body separately', async () => {
  const text = await readFile(path.join(FIX_DIR, 'minimal-valid.md'), 'utf8');
  const { frontmatterText, body } = extractFrontmatter(text);
  assert.ok(frontmatterText.includes('command: minimal-valid'));
  assert.ok(body.includes('# TestAtlas Command: minimal-valid'));
  assert.ok(!body.includes('command: minimal-valid'));
});

test('list-command-files: returns [] when .testatlas/commands/ does not exist', async () => {
  // Wave-0 state: directory does not exist yet.
  const files = await listCommandFiles({ cwd: '/tmp' });
  assert.deepEqual(files, []);
});

test('list-command-files: LIFECYCLE_FILES is the canonical 5-item set', () => {
  assert.equal(LIFECYCLE_FILES.length, 5);
  assert.ok(LIFECYCLE_FILES.includes('03_execution_status.md'));
  assert.ok(LIFECYCLE_FILES.includes('09_artifact_index.md'));
  assert.ok(LIFECYCLE_FILES.includes('10_command_log.md'));
  assert.ok(LIFECYCLE_FILES.includes('11_workspace_manifest.json'));
  assert.ok(LIFECYCLE_FILES.includes('history/run_log.md'));
});
