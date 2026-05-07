// test/schemas/vocabulary-dual-path.test.js
//
// ISSUE-001 follow-up: `.testatlas/vocabulary.json` (canonical, referenced
// by command bodies) and `.testatlas/schemas/vocabulary.schema.json` (static
// checker / dogfood-audit compatibility copy) MUST stay byte-identical.
//
// Background:
//   AJV resolves $ref by registered $id. Both files declare the same $id
//   (`https://testatlas.dev/schemas/v1/vocabulary.schema.json`) so AJV
//   double-add is prevented by `schema-loader.js` `addIfMissing`. Functionally
//   redundant. But a dogfood audit ran a static `$ref → filename` check and
//   flagged the absence of `.testatlas/schemas/vocabulary.schema.json` as a
//   defect. We added the copy to satisfy that check; this test guards against
//   drift between the two files (an editor changing one and not the other
//   would silently desync the schema set).
//
// On any drift: `cp .testatlas/vocabulary.json .testatlas/schemas/vocabulary.schema.json`.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CANONICAL = path.join(REPO_ROOT, '.testatlas', 'vocabulary.json');
const COPY = path.join(REPO_ROOT, '.testatlas', 'schemas', 'vocabulary.schema.json');

test('vocabulary.json and schemas/vocabulary.schema.json are byte-identical', async () => {
  const canonical = await readFile(CANONICAL, 'utf8');
  const copy = await readFile(COPY, 'utf8');
  assert.equal(
    copy,
    canonical,
    'Drift detected. Run: cp .testatlas/vocabulary.json .testatlas/schemas/vocabulary.schema.json',
  );
});

test('vocabulary copy declares the canonical $id (matching $ref targets across all schemas)', async () => {
  const text = await readFile(COPY, 'utf8');
  const parsed = JSON.parse(text);
  assert.equal(parsed.$id, 'https://testatlas.dev/schemas/v1/vocabulary.schema.json');
});

test('vocabulary copy has the expected $defs entries (severity, confidence, issueStatus, issueType, kebabSlug)', async () => {
  const text = await readFile(COPY, 'utf8');
  const parsed = JSON.parse(text);
  for (const key of ['severity', 'confidence', 'issueStatus', 'issueType', 'kebabSlug']) {
    assert.ok(parsed.$defs?.[key], `expected $defs.${key} in vocabulary schema copy`);
  }
});
