// test/scripts/create-persona.test.js
//
// Plan 14-02 Task 1 — create-persona.js generates valid md+json pairs.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'create-persona.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-persona-'));
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await mkdir(path.join(wsDir, 'agents', 'personas'), { recursive: true });
  await writeFile(
    path.join(wsDir, 'brain', 'personas.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', personas: [] }),
  );
  return { dir, wsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: createPersona writes md+json under agents/personas/<type>/', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createPersona } = await import(SCRIPT);
    const r = await createPersona({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      name: 'Security Reviewer',
      type: 'system',
      mission: 'Review for OWASP Top 10 risks.',
      domains: ['domain-auth', 'domain-billing'],
    });
    assert.equal(r.ok, true);
    assert.match(r.mdPath, /agents\/personas\/system\/[a-z0-9-]+\.md$/);
    assert.match(r.jsonPath, /agents\/personas\/system\/[a-z0-9-]+\.json$/);
    const mdText = await readFile(r.mdPath, 'utf8');
    assert.match(mdText, /Mission/);
    const json = JSON.parse(await readFile(r.jsonPath, 'utf8'));
    assert.equal(json.type, 'system');
    assert.equal(json.name, 'Security Reviewer');
    assert.deepEqual(json.domains, ['domain-auth', 'domain-billing']);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: createPersona updates brain/personas.json index', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createPersona } = await import(SCRIPT);
    await createPersona({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      name: 'A11y Champion',
      type: 'project',
      mission: 'Push for WCAG AA on every flow.',
      domains: ['domain-ui'],
    });
    const idx = JSON.parse(await readFile(path.join(ctx.wsDir, 'brain', 'personas.json'), 'utf8'));
    assert.ok(Array.isArray(idx.personas));
    assert.equal(idx.personas.length, 1);
    assert.equal(idx.personas[0].name, 'A11y Champion');
    assert.equal(idx.personas[0].type, 'project');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: missing required flag throws TESTATLAS_INVALID_ARGS', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createPersona } = await import(SCRIPT);
    await assert.rejects(
      createPersona({ cwd: ctx.dir, suiteCwd: REPO_ROOT }),
      (e) => e.code === 'TESTATLAS_INVALID_ARGS',
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: createPersona emits $schema annotation on persona JSON (sub-finding #1)', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createPersona } = await import(SCRIPT);
    const r = await createPersona({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      name: 'Schema Annotated Persona',
      type: 'system',
      mission: 'verify $schema emission',
    });
    const json = JSON.parse(await readFile(r.jsonPath, 'utf8'));
    assert.equal(
      json.$schema,
      'https://testatlas.dev/schemas/v2/persona.schema.json',
      `expected persona JSON to carry $schema annotation; got ${JSON.stringify({ $schema: json.$schema })}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: invalid type fails AJV validation against persona.schema.json', async () => {
  const ctx = await setupWorkspace();
  try {
    const { createPersona } = await import(SCRIPT);
    await assert.rejects(
      createPersona({
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        name: 'X',
        type: 'not-a-real-type',
        mission: 'irrelevant',
      }),
      (e) => /TESTATLAS_INVALID|enum/i.test(String(e.code) + ' ' + String(e.message)),
    );
  } finally {
    await ctx.cleanup();
  }
});
