// test/create-evidence-record.test.js
//
// Plan 05-01 Task 2 tests for scripts/create-evidence-record.js.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createEvidenceRecord } from '../scripts/create-evidence-record.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';
import { makeValidationFixture } from './_helpers.js';

const EVIDENCE_SCHEMA = 'https://testatlas.dev/schemas/v1/evidence.schema.json';

test('createEvidenceRecord: emits a valid evidence record with redacted:false default', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await createEvidenceRecord({
    cwd: fx.cwd,
    type: 'screenshot',
    description: 'Login form after blank-submit.',
    domain: 'domain-auth',
    flow: 'FLOW-auth-login',
  });

  const ajv = await loadAllSchemas({ cwd: fx.cwd });
  const v = ajv.getSchema(EVIDENCE_SCHEMA);
  const json = JSON.parse(await readFile(r.jsonPath, 'utf8'));
  assert.ok(v(json), `evidence must validate; errors: ${JSON.stringify(v.errors)}`);
  assert.equal(json.redacted, false);
  assert.match(json.id, /^EVIDENCE-\d{3,}/);
});

test("createEvidenceRecord: assertNotUpdate('command') is the FIRST call", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await createEvidenceRecord(
    {
      cwd: fx.cwd,
      type: 'log',
      description: 'spy',
      dryRun: true,
    },
    {
      assertNotUpdate: (ctx) => {
        calls.push(ctx);
      },
    },
  );
  assert.equal(calls[0], 'command');
});
