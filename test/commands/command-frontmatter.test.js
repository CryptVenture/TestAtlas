// test/commands/command-frontmatter.test.js
//
// CMD-04: every command file's YAML frontmatter validates against
// .testatlas/schemas/command-instruction.schema.json. Empty-dir tolerant.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { formatErrors } from '../../scripts/lib/ajv-instance.js';
import { listCommandFiles } from '../../scripts/lib/list-command-files.js';
import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';

const SCHEMA_ID = 'https://testatlas.dev/schemas/v1/command-instruction.schema.json';

test('CMD-04: every command frontmatter validates against command-instruction schema', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const ajv = await loadAllSchemas({ cwd: process.cwd() });
  const validate = ajv.getSchema(SCHEMA_ID);
  assert.ok(validate, `Schema ${SCHEMA_ID} not registered in AJV singleton`);

  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    let fm;
    try {
      fm = parseFrontmatter(text);
    } catch (err) {
      failures.push(`${path.basename(file)}: ${err.message}`);
      continue;
    }
    if (!validate(fm)) {
      failures.push(`${path.basename(file)}: ${formatErrors(validate.errors).join('; ')}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('CMD-04: every frontmatter `command` field equals the filename', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const fm = parseFrontmatter(text);
    const expected = path.basename(file, '.md');
    if (fm.command !== expected) {
      failures.push(`${path.basename(file)}: command="${fm.command}" expected "${expected}"`);
    }
  }
  assert.deepEqual(failures, []);
});
