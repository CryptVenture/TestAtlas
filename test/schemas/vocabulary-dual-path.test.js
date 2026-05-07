// test/schemas/vocabulary-dual-path.test.js
//
// Quick-260507-vn2 follow-up: vocabulary lives at a SINGLE canonical path
// — `.testatlas/schemas/vocabulary.schema.json` — alongside every other
// schema. The legacy `.testatlas/vocabulary.json` top-level path was removed.
//
// This test guards against:
//   1. The canonical schema file going missing.
//   2. The canonical schema's `$id` drifting from the URI all other schemas
//      `$ref` (`https://testatlas.dev/schemas/v1/vocabulary.schema.json`).
//   3. The legacy top-level path being re-introduced (would silently
//      reintroduce the drift risk that Quick-260507-vn2 eliminated).

import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CANONICAL = path.join(REPO_ROOT, '.testatlas', 'schemas', 'vocabulary.schema.json');
const LEGACY = path.join(REPO_ROOT, '.testatlas', 'vocabulary.json');

test('vocabulary schema exists at the canonical path .testatlas/schemas/vocabulary.schema.json', async () => {
  await access(CANONICAL);
});

test('vocabulary schema declares the canonical $id (matching $ref targets across all schemas)', async () => {
  const text = await readFile(CANONICAL, 'utf8');
  const parsed = JSON.parse(text);
  assert.equal(parsed.$id, 'https://testatlas.dev/schemas/v1/vocabulary.schema.json');
  assert.equal(parsed.$schema, 'https://json-schema.org/draft/2020-12/schema');
});

test('vocabulary schema has the expected $defs entries (severity, confidence, issueStatus, issueType, kebabSlug)', async () => {
  const text = await readFile(CANONICAL, 'utf8');
  const parsed = JSON.parse(text);
  for (const key of ['severity', 'confidence', 'issueStatus', 'issueType', 'kebabSlug']) {
    assert.ok(parsed.$defs?.[key], `expected $defs.${key} in vocabulary schema`);
  }
});

test('legacy top-level path .testatlas/vocabulary.json is absent (single source of truth)', async () => {
  let exists = true;
  try {
    await access(LEGACY);
  } catch {
    exists = false;
  }
  assert.equal(
    exists,
    false,
    'Legacy .testatlas/vocabulary.json detected. The canonical path is .testatlas/schemas/vocabulary.schema.json (Quick-260507-vn2 consolidation).',
  );
});
