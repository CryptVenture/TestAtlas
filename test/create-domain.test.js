// test/create-domain.test.js
//
// Plan 05-01 Task 2 tests for scripts/create-domain.js.

import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createDomain } from '../scripts/create-domain.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';
import { makeValidationFixture } from './_helpers.js';

const DOMAIN_SCHEMA = 'https://testatlas.dev/schemas/v1/domain.schema.json';

test('createDomain: emits domain.json + index.md + issues/index.md; domain.json validates', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await createDomain({
    cwd: fx.cwd,
    name: 'Billing',
    purpose: 'Invoices, subscriptions, payment methods.',
  });

  await access(r.domainJson);
  await access(r.indexMd);
  await access(r.issuesIndexMd);

  const ajv = await loadAllSchemas({ cwd: fx.cwd });
  const v = ajv.getSchema(DOMAIN_SCHEMA);
  const json = JSON.parse(await readFile(r.domainJson, 'utf8'));
  assert.ok(v(json), `domain must validate; errors: ${JSON.stringify(v.errors)}`);
  assert.equal(json.id, 'domain-billing');
});

test("createDomain: assertNotUpdate('command') is the FIRST call", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await createDomain(
    {
      cwd: fx.cwd,
      name: 'Settings',
      purpose: 'User account preferences.',
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
