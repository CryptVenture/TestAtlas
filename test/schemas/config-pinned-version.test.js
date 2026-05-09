// test/schemas/config-pinned-version.test.js
//
// Regression test for ISSUE-028 (closed 2026-05-09): config.schema.json
// `pinnedVersion` previously rejected `^1.0.0` / `~1.0.0` semver-range syntax
// despite update-core.js's runtime semver-satisfies check happily accepting
// them. This test pins the widened oneOf patterns: caret, tilde, comparator
// ranges all accepted; obvious garbage still rejected.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const SCHEMA = path.join(repoRoot, '.testatlas/config.schema.json');
const DEFAULT = path.join(repoRoot, '.testatlas/default.config.json');

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA, 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return { validate: ajv.compile(schema), base: JSON.parse(await readFile(DEFAULT, 'utf8')) };
}

test('ISSUE-028: pinnedVersion accepts caret / tilde / comparator ranges', async () => {
  const { validate, base } = await loadValidator();
  const valid = [
    null,
    '1.2.6',
    '1.2.6-rc.1',
    '1.x',
    '1.2.x',
    '^1.0.0',
    '^1.2.6',
    '~1.0.0',
    '~1.2.6',
    '>=1.2.0',
    '>1.0.0',
    '<2.0.0',
    '<=2.0.0',
  ];
  for (const v of valid) {
    const cfg = { ...base, pinnedVersion: v };
    const ok = validate(cfg);
    const pinErr = (validate.errors || []).find((e) => e.instancePath === '/pinnedVersion');
    assert.ok(ok, `pinnedVersion=${JSON.stringify(v)} should validate; got: ${pinErr?.message}`);
  }
});

test('ISSUE-028: pinnedVersion still rejects obviously-malformed strings', async () => {
  const { validate, base } = await loadValidator();
  const bad = ['garbage', 'not-a-version', '1', 'v1.2.3', '1.2.3.4'];
  for (const v of bad) {
    const cfg = { ...base, pinnedVersion: v };
    const ok = validate(cfg);
    assert.ok(!ok, `pinnedVersion=${JSON.stringify(v)} should fail validation`);
  }
});
