// test/create-flow.test.js
//
// Plan 05-01 Task 2 tests for scripts/create-flow.js.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createFlow } from '../scripts/create-flow.js';
import { loadAllSchemas } from '../scripts/lib/schema-loader.js';
import { makeValidationFixture } from './_helpers.js';

const FLOW_SCHEMA = 'https://testatlas.dev/schemas/v1/flow.schema.json';

test('createFlow: emits a flow that AJV-validates against flow.schema.json', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const r = await createFlow({
    cwd: fx.cwd,
    name: 'Sign Up',
    domain: 'domain-auth',
    persona: 'new-user',
    goal: 'Create a new account.',
  });

  const ajv = await loadAllSchemas({ cwd: fx.cwd });
  const v = ajv.getSchema(FLOW_SCHEMA);
  const json = JSON.parse(await readFile(r.jsonPath, 'utf8'));
  assert.ok(v(json), `flow must validate; errors: ${JSON.stringify(v.errors)}`);
  assert.match(json.id, /^FLOW-auth-sign-up$/);
});

test("createFlow: assertNotUpdate('command') is the FIRST call", async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  const calls = [];
  await createFlow(
    {
      cwd: fx.cwd,
      name: 'Spy Flow',
      domain: 'domain-auth',
      persona: 'p',
      goal: 'g',
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

test('createFlow: --dry-run writes ZERO files (atomicWrite spy never called)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  let writes = 0;
  await createFlow(
    {
      cwd: fx.cwd,
      name: 'Dry Flow',
      domain: 'domain-auth',
      persona: 'p',
      goal: 'g',
      dryRun: true,
    },
    {
      atomicWrite: async () => {
        writes++;
      },
    },
  );
  assert.equal(writes, 0);
});
