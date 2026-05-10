// test/scripts/explore-codebase-integrations.test.js
//
// Phase 11 Plan 02 (RED → GREEN): regression tests for the new
// `scripts/explore-codebase.js` integration detector. Closes ISSUE-012
// (G-02) — `_testatlas/12_app_map.json` was missing 5+ external touchpoints
// (5 GitHub Actions Marketplace deps, the system `tar` binary, and the
// consumer-side npm hop at `install.sh:166`).
//
// Detection paths covered:
//   1. External GitHub Marketplace Actions in `.github/workflows/*.yml`
//      (skip local `./...` actions and `docker://` refs).
//   2. System binaries spawned via `child_process.spawn` / `execFile` in
//      `scripts/**.js` (skip the internal `node` binary and absolute paths).
//   3. Consumer-side npm hop: `npm install` line in `install.sh` → emits
//      `consumer-npm-hop` with `direction: consumer-outbound`.
//   4. Real-repo invocation: detector finds ≥6 distinct GitHub Actions when
//      run against the suite repo's own workflows.
//   5. Schema validation: detector output (when wrapped in a complete
//      app-map) validates against the (widened) `app-map.schema.json`.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DETECTOR_PATH = path.resolve(REPO_ROOT, 'scripts/explore-codebase.js');

async function loadDetector() {
  try {
    return await import(pathToFileURL(DETECTOR_PATH).href);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail(
        'scripts/explore-codebase.js not yet on disk — Task 2 of plan 11-02 must create it',
      );
    }
    throw err;
  }
}

/**
 * Build a tmp fixture directory from a `{ relPath: contents }` map.
 * @param {Record<string, string>} layout
 * @returns {Promise<string>} absolute fixture root path
 */
async function makeFixture(layout) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tatlas-fixture-'));
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
  return dir;
}

test('detects external GitHub Actions, skips local + docker refs', async (t) => {
  const { detectIntegrations } = await loadDetector();
  const dir = await makeFixture({
    '.github/workflows/x.yml': [
      'jobs:',
      '  a:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: ./local-action',
      '      - uses: docker://alpine:3',
      '',
    ].join('\n'),
  });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const out = await detectIntegrations({ rootDir: dir });
  const ghActions = out.filter((i) => i.type === 'github-action');
  assert.equal(ghActions.length, 1, `expected exactly 1 github-action, got ${ghActions.length}`);
  assert.equal(ghActions[0].name, 'actions/checkout@v4');
  assert.equal(ghActions[0].direction, 'build-time');
});

test('detects system binaries spawned via child_process.spawn, skips node + absolute paths', async (t) => {
  const { detectIntegrations } = await loadDetector();
  const dir = await makeFixture({
    'scripts/foo.js': [
      "import { spawn } from 'node:child_process';",
      "const p = spawn('tar', ['-xzf', 'x.tgz']);",
      "const q = spawn('node', ['child.js']);",
      "const r = spawn('/usr/local/bin/somebin', []);",
      '',
    ].join('\n'),
  });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const out = await detectIntegrations({ rootDir: dir });
  const sysBins = out.filter((i) => i.type === 'system-binary');
  assert.equal(sysBins.length, 1, `expected exactly 1 system-binary, got ${sysBins.length}`);
  assert.equal(sysBins[0].name, 'tar');
  assert.match(sysBins[0].source ?? '', /scripts\/foo\.js:2$/);
});

test('detects consumer-npm-hop in install.sh with direction consumer-outbound', async (t) => {
  const { detectIntegrations } = await loadDetector();
  const dir = await makeFixture({
    'install.sh': [
      '#!/bin/sh',
      'set -eu',
      '# resolve runtime deps',
      'npm install --omit=dev --no-audit --no-fund --silent',
      '',
    ].join('\n'),
  });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const out = await detectIntegrations({ rootDir: dir });
  const npmHop = out.find((i) => i.name === 'consumer-npm-hop');
  assert.ok(npmHop, 'expected a consumer-npm-hop entry');
  assert.equal(npmHop.type, 'network-runtime');
  assert.equal(npmHop.direction, 'consumer-outbound');
  assert.equal(npmHop.source, 'install.sh:4');
});

test('real-repo invocation surfaces ≥6 distinct external GitHub Actions', async () => {
  const { detectIntegrations } = await loadDetector();
  const out = await detectIntegrations({ rootDir: REPO_ROOT });
  const ghActions = out.filter((i) => i.type === 'github-action');
  const names = new Set(ghActions.map((g) => g.name.split('@')[0]));
  // Sanity: each of the 6 known marketplace deps surfaces.
  // Quick 260506-npm: changesets/action removed from release.yml per npm
  // support guidance (it bypasses OIDC token-exchange, root cause of
  // v1.1.0–v1.2.0 E404 publish failures). sigstore/cosign-installer takes
  // its slot in the expected-actions list.
  for (const expected of [
    'actions/checkout',
    'actions/setup-node',
    'pnpm/action-setup',
    'sigstore/cosign-installer',
    'softprops/action-gh-release',
    'actions/upload-artifact',
  ]) {
    assert.ok(
      names.has(expected),
      `expected real-repo detector to surface ${expected}; got: ${[...names].join(', ')}`,
    );
  }
  assert.ok(ghActions.length >= 6, `expected ≥6 github-action entries, got ${ghActions.length}`);
});

test('detector output (full app-map) validates against widened app-map.schema.json', async () => {
  const detector = await loadDetector();
  assert.ok(
    typeof detector.buildAppMap === 'function',
    'explore-codebase.js must export buildAppMap()',
  );
  const appMap = await detector.buildAppMap({ rootDir: REPO_ROOT });

  // Use the same AJV singleton + schema-loader as validate-workspace.
  const { loadAllSchemas } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'scripts/lib/schema-loader.js')).href
  );
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const validate = ajv.getSchema('https://testatlas.dev/schemas/v1/app-map.schema.json');
  assert.ok(validate, 'app-map.schema.json must be loaded into AJV');

  const ok = validate(appMap);
  assert.ok(
    ok,
    `built app-map failed schema validation: ${JSON.stringify(validate.errors, null, 2)}`,
  );

  // Sanity: at least one detected integration is the new object shape.
  const hasObjectIntegration = (appMap.integrations ?? []).some(
    (it) => typeof it === 'object' && it !== null,
  );
  assert.ok(hasObjectIntegration, 'expected at least one object-shaped integration entry');
});
