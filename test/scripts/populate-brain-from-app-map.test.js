// test/scripts/populate-brain-from-app-map.test.js
//
// Plan 22-01 Task 2 — DEC-002 regression test.
//
// Pins: brain/{components,routes,commands}.json must be populated from
// _testatlas/12_app_map.json. Wave 1 Task 2 creates scripts/populate-brain-from-app-map.js.
//
// RED-bar: scripts/populate-brain-from-app-map.js does NOT exist yet.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'populate-brain-from-app-map.js');

async function setupWorkspace(opts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-populate-app-map-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });

  // Seed empty brain index files.
  await writeFile(
    path.join(brainDir, 'components.json'),
    `${JSON.stringify({ schema_version: '2.0.0', components: [], last_updated: '' }, null, 2)}\n`,
  );
  await writeFile(
    path.join(brainDir, 'routes.json'),
    `${JSON.stringify({ schema_version: '2.0.0', routes: [], last_updated: '' }, null, 2)}\n`,
  );
  await writeFile(
    path.join(brainDir, 'commands.json'),
    `${JSON.stringify({ schema_version: '2.0.0', commands: [], last_updated: '' }, null, 2)}\n`,
  );

  if (opts.appMap !== undefined) {
    await writeFile(
      path.join(wsDir, '12_app_map.json'),
      `${JSON.stringify(opts.appMap, null, 2)}\n`,
    );
  }

  return { dir, wsDir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: populates components/routes/commands from 12_app_map.json', async () => {
  const ctx = await setupWorkspace({
    appMap: {
      schema_version: '2.0.0',
      components: [
        { id: 'comp-1', path: 'src/a.js', name: 'A' },
        { id: 'comp-2', path: 'src/b.js', name: 'B' },
        { id: 'comp-3', path: 'src/c.js', name: 'C' },
      ],
      routes: [{ id: 'route-1', method: 'GET', path: '/health' }],
      cliCommands: [
        { id: 'cmd-1', name: 'init' },
        { id: 'cmd-2', name: 'validate' },
      ],
    },
  });
  try {
    const { populateBrainFromAppMap } = await import(pathToFileURL(SCRIPT).href);
    await populateBrainFromAppMap({ cwd: ctx.dir });
    const components = JSON.parse(
      await readFile(path.join(ctx.brainDir, 'components.json'), 'utf8'),
    );
    const routes = JSON.parse(await readFile(path.join(ctx.brainDir, 'routes.json'), 'utf8'));
    const commands = JSON.parse(await readFile(path.join(ctx.brainDir, 'commands.json'), 'utf8'));
    assert.equal(components.components.length, 3);
    assert.equal(routes.routes.length, 1);
    assert.equal(commands.commands.length, 2);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: each written index has schema_version + last_updated', async () => {
  const ctx = await setupWorkspace({
    appMap: {
      schema_version: '2.0.0',
      components: [{ id: 'c1', path: 'x.js', name: 'X' }],
      routes: [],
      cliCommands: [],
    },
  });
  try {
    const { populateBrainFromAppMap } = await import(pathToFileURL(SCRIPT).href);
    await populateBrainFromAppMap({ cwd: ctx.dir });
    for (const fname of ['components.json', 'routes.json', 'commands.json']) {
      const obj = JSON.parse(await readFile(path.join(ctx.brainDir, fname), 'utf8'));
      assert.equal(typeof obj.schema_version, 'string', `${fname} must have schema_version`);
      assert.equal(typeof obj.last_updated, 'string', `${fname} must have last_updated`);
      assert.match(
        obj.last_updated,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        `${fname}.last_updated must be ISO-8601`,
      );
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: idempotent — repeat run reports changed:[]', async () => {
  const ctx = await setupWorkspace({
    appMap: {
      schema_version: '2.0.0',
      components: [{ id: 'c1', path: 'x.js', name: 'X' }],
      routes: [],
      cliCommands: [],
    },
  });
  try {
    const { populateBrainFromAppMap } = await import(pathToFileURL(SCRIPT).href);
    await populateBrainFromAppMap({ cwd: ctx.dir });
    const r2 = await populateBrainFromAppMap({ cwd: ctx.dir });
    assert.deepEqual(r2.changed, [], 'second run must report no changed files');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: empty app-map → empty arrays in brain indexes (no error)', async () => {
  const ctx = await setupWorkspace({
    appMap: { schema_version: '2.0.0', components: [], routes: [], cliCommands: [] },
  });
  try {
    const { populateBrainFromAppMap } = await import(pathToFileURL(SCRIPT).href);
    const r = await populateBrainFromAppMap({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    const components = JSON.parse(
      await readFile(path.join(ctx.brainDir, 'components.json'), 'utf8'),
    );
    assert.deepEqual(components.components, []);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: missing app-map → graceful skip (ok:true, changed:[])', async () => {
  const ctx = await setupWorkspace({}); // no appMap written
  try {
    const { populateBrainFromAppMap } = await import(pathToFileURL(SCRIPT).href);
    const r = await populateBrainFromAppMap({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    assert.deepEqual(r.changed, []);
  } finally {
    await ctx.cleanup();
  }
});
