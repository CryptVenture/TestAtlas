// Tests for Phase 1 — BOOT-06 (config defaults + loader + deep-merge),
// BOOT-07 (schema $id + AJV validation paths).

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getAjv } from '../scripts/lib/ajv-instance.js';
import { loadConfig } from '../scripts/lib/load-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

/**
 * Make a self-contained config fixture directory: copies suite defaults and
 * schema into a temp dir, optionally writes an override file. Returns the
 * fixture cwd.
 */
async function makeFixture({ override } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cfg-'));
  await mkdir(path.join(dir, '.testatlas'), { recursive: true });
  await cp(
    path.join(repoRoot, '.testatlas/default.config.json'),
    path.join(dir, '.testatlas/default.config.json'),
  );
  await cp(
    path.join(repoRoot, '.testatlas/config.schema.json'),
    path.join(dir, '.testatlas/config.schema.json'),
  );
  if (override !== undefined) {
    await writeFile(
      path.join(dir, 'testatlas.config.json'),
      typeof override === 'string' ? override : JSON.stringify(override, null, 2),
      'utf8',
    );
  }
  return dir;
}

// ---- BOOT-06: defaults file shape ----
test('BOOT-06: default.config.json contains all PRD §10 fields plus 3 update fields', async () => {
  const defaults = await readJson(path.join(repoRoot, '.testatlas/default.config.json'));
  const required = [
    'suiteName',
    'workspaceDir',
    'instructionDir',
    'defaultEnvironment',
    'safeMode',
    'allowDestructiveActions',
    'allowProductionTesting',
    'evidence',
    'explorers',
    'qualityBars',
    'adapters',
    'pinnedVersion',
    'disableUpdateCheck',
    'updateCheckTtlHours',
  ];
  for (const field of required) {
    assert.ok(field in defaults, `default.config.json missing field "${field}"`);
  }
});

// ---- BOOT-06: locked default values ----
test('BOOT-06: defaults lock safeMode=true, allowDestructiveActions=false, allowProductionTesting=false', async () => {
  const defaults = await readJson(path.join(repoRoot, '.testatlas/default.config.json'));
  assert.equal(defaults.safeMode, true);
  assert.equal(defaults.allowDestructiveActions, false);
  assert.equal(defaults.allowProductionTesting, false);
  assert.equal(defaults.pinnedVersion, null);
  assert.equal(defaults.disableUpdateCheck, false);
  assert.equal(defaults.updateCheckTtlHours, 24);
});

// ---- BOOT-06: loader returns frozen defaults when no override ----
test('BOOT-06: loadConfig() returns frozen defaults when override is absent', async () => {
  const cwd = await makeFixture();
  const cfg = await loadConfig({ cwd });
  assert.ok(Object.isFrozen(cfg), 'config must be frozen');
  assert.equal(cfg.safeMode, true);
  assert.equal(cfg.evidence.screenshots, true);
});

// ---- BOOT-06: deep-merge preserves sibling defaults ----
test('BOOT-06: override on a nested leaf does not drop sibling defaults', async () => {
  const cwd = await makeFixture({ override: { evidence: { videos: true } } });
  const cfg = await loadConfig({ cwd });
  assert.equal(cfg.evidence.videos, true, 'override applied');
  assert.equal(cfg.evidence.screenshots, true, 'sibling default survived deep-merge');
  assert.equal(cfg.evidence.network, true, 'sibling default survived deep-merge');
  assert.equal(cfg.evidence.db, false, 'unchanged sibling default preserved');
});

// ---- BOOT-07: schema $id locked ----
test('BOOT-07: config.schema.json has the locked $id and Draft 2020-12 $schema', async () => {
  const schema = await readJson(path.join(repoRoot, '.testatlas/config.schema.json'));
  assert.equal(schema.$id, 'https://testatlas.dev/schemas/v1/config.schema.json');
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
});

// ---- BOOT-07: defaults validate against schema (Pitfall 4) ----
test('BOOT-07: default.config.json validates against config.schema.json with no errors', async () => {
  const ajv = getAjv();
  const schema = await readJson(path.join(repoRoot, '.testatlas/config.schema.json'));
  const defaults = await readJson(path.join(repoRoot, '.testatlas/default.config.json'));
  if (!ajv.getSchema(schema.$id)) ajv.addSchema(schema);
  const validate = ajv.getSchema(schema.$id);
  const ok = validate(defaults);
  assert.ok(ok, `defaults must validate; errors: ${JSON.stringify(validate.errors)}`);
});

// ---- BOOT-07: type-error on override surfaces field path + AJV message ----
test('BOOT-07: invalid type in override produces TESTATLAS_INVALID_CONFIG naming /safeMode and "must be boolean"', async () => {
  const cwd = await makeFixture({ override: { safeMode: 'yes' } });
  await assert.rejects(
    () => loadConfig({ cwd }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_INVALID_CONFIG');
      assert.match(err.message, /safeMode/);
      assert.match(err.message, /must be boolean/);
      return true;
    },
  );
});

// ---- BOOT-07: unknown property in override is rejected by additionalProperties: false ----
test('BOOT-07: unknown property in override produces additionalProperties error naming "saffeMode"', async () => {
  const cwd = await makeFixture({ override: { saffeMode: true } });
  await assert.rejects(
    () => loadConfig({ cwd }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_INVALID_CONFIG');
      assert.match(err.message, /saffeMode/);
      assert.match(err.message, /must NOT have additional properties/i);
      return true;
    },
  );
});

// ---- BOOT-07: malformed JSON in override surfaces TESTATLAS_INVALID_JSON ----
test('BOOT-07: malformed override JSON produces TESTATLAS_INVALID_JSON with file path and "JSON" keyword', async () => {
  const cwd = await makeFixture({ override: '{ "safeMode": true,, }' });
  await assert.rejects(
    () => loadConfig({ cwd }),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_INVALID_JSON');
      assert.match(err.message, /testatlas\.config\.json/);
      assert.match(err.message, /JSON/);
      return true;
    },
  );
});

// ---- BOOT-07: pinnedVersion accepts null, exact semver, and range pattern ----
test('BOOT-07: pinnedVersion accepts null / exact semver / range pattern; rejects garbage', async () => {
  for (const valid of [null, '1.2.3', '1.2.3-beta.1', '1.x', '1.2.x']) {
    const cwd = await makeFixture({ override: { pinnedVersion: valid } });
    await assert.doesNotReject(
      loadConfig({ cwd }),
      `should accept pinnedVersion=${JSON.stringify(valid)}`,
    );
  }
  // Garbage is rejected.
  const cwd = await makeFixture({ override: { pinnedVersion: 'banana' } });
  await assert.rejects(loadConfig({ cwd }), { code: 'TESTATLAS_INVALID_CONFIG' });
});
