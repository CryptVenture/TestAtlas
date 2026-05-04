// test/install/manifest.test.js
//
// Plan 07-01 Task 1 — Install manifest read/write/validate tests.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INSTALL_MANIFEST_PATH } from '../../scripts/lib/constants.js';
import {
  buildManifest,
  loadAndValidateManifest,
  writeManifest,
} from '../../scripts/lib/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function makeTmp() {
  const t = await mkdtemp(path.join(tmpdir(), 'testatlas-manifest-'));
  await mkdir(path.join(t, '.testatlas'), { recursive: true });
  return t;
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

async function writeSourceFile(target, relPath, contents) {
  const abs = path.join(target, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, contents);
  return abs;
}

test('manifest: writeManifest writes a valid JSON file at .testatlas/.install-manifest.json', async (t) => {
  await withTmp(t, async (target) => {
    const fileAbs = await writeSourceFile(target, '.testatlas/bootstrap.md', '# hello\n');
    await writeManifest(
      target,
      {
        suiteVersion: '0.1.0-pre',
        schemaVersion: 1,
        adapters: ['claude-code', 'generic'],
        files: [{ absPath: fileAbs, source: '.testatlas/bootstrap.md', type: 'suite' }],
      },
      { cwd: REPO_ROOT },
    );

    const written = JSON.parse(await readFile(path.join(target, INSTALL_MANIFEST_PATH), 'utf8'));
    assert.equal(written.manifestVersion, '1');
    assert.equal(written.suiteVersion, '0.1.0-pre');
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.target, target);
    assert.deepStrictEqual(written.adapters, ['claude-code', 'generic']);
    assert.equal(written.files.length, 1);
    assert.equal(written.files[0].path, '.testatlas/bootstrap.md');
    assert.equal(written.files[0].type, 'suite');
    assert.match(written.files[0].hash, /^[0-9a-f]{16}$/);
  });
});

test('manifest: round-trip via loadAndValidateManifest', async (t) => {
  await withTmp(t, async (target) => {
    const a = await writeSourceFile(target, '.testatlas/a.md', 'a\n');
    const b = await writeSourceFile(target, '.testatlas/b.md', 'b\n');
    await writeManifest(
      target,
      {
        suiteVersion: '0.1.0-pre',
        schemaVersion: 1,
        adapters: ['generic'],
        files: [
          { absPath: a, source: '.testatlas/a.md', type: 'suite' },
          { absPath: b, source: '.testatlas/b.md', type: 'adapter' },
        ],
      },
      { cwd: REPO_ROOT },
    );
    const loaded = await loadAndValidateManifest(target, { cwd: REPO_ROOT });
    assert.equal(loaded.files.length, 2);
    const types = loaded.files.map((f) => f.type).sort();
    assert.deepStrictEqual(types, ['adapter', 'suite']);
  });
});

test('manifest: paths use forward-slashes even when input has OS-native separators', async (t) => {
  await withTmp(t, async (target) => {
    // Build a file in a nested dir; manifest should record `a/b/c.md` regardless
    // of platform `path.sep`. (On Windows, path.relative returns backslashes;
    // we explicitly join() with platform sep then verify the manifest stores `/`.)
    const abs = await writeSourceFile(target, path.join('.testatlas', 'a', 'b', 'c.md'), 'x\n');
    const built = await buildManifest(
      target,
      {
        suiteVersion: '0.1.0-pre',
        schemaVersion: 1,
        adapters: ['generic'],
        files: [
          // simulate Windows-style source path; toPosix should normalize
          { absPath: abs, source: path.join('.testatlas', 'a', 'b', 'c.md'), type: 'suite' },
        ],
      },
      { cwd: REPO_ROOT },
    );
    assert.equal(built.files[0].path, '.testatlas/a/b/c.md');
    assert.equal(built.files[0].source, '.testatlas/a/b/c.md');
    assert.match(built.files[0].path, /^[^/].*/);
    assert.ok(!built.files[0].path.includes('\\'), 'path must not contain backslash');
  });
});

test('manifest: loadAndValidateManifest throws ENOENT-coded error when missing', async (t) => {
  await withTmp(t, async (target) => {
    await assert.rejects(
      () => loadAndValidateManifest(target, { cwd: REPO_ROOT }),
      (err) => err.code === 'TESTATLAS_MANIFEST_MISSING',
    );
  });
});

test('manifest: loadAndValidateManifest rejects malformed/invalid JSON shape', async (t) => {
  await withTmp(t, async (target) => {
    // Write a JSON file that drops the required `files` field.
    const partial = {
      manifestVersion: '1',
      suiteVersion: '0.1.0-pre',
      schemaVersion: 1,
      installedAt: '2026-05-04T12:00:00.000Z',
      target,
      adapters: ['generic'],
      // files: missing
    };
    await writeFile(path.join(target, INSTALL_MANIFEST_PATH), JSON.stringify(partial, null, 2));
    await assert.rejects(
      () => loadAndValidateManifest(target, { cwd: REPO_ROOT }),
      (err) => err.code === 'TESTATLAS_MANIFEST_INVALID_SHAPE' && /files/.test(err.message),
    );
  });
});

test('manifest: writeManifest fails AJV when schemaVersion is not >= 1', async (t) => {
  await withTmp(t, async (target) => {
    const a = await writeSourceFile(target, '.testatlas/a.md', 'a\n');
    await assert.rejects(
      () =>
        writeManifest(
          target,
          {
            suiteVersion: '0.1.0-pre',
            schemaVersion: 0,
            adapters: ['generic'],
            files: [{ absPath: a, source: '.testatlas/a.md', type: 'suite' }],
          },
          { cwd: REPO_ROOT },
        ),
      /AJV validation/,
    );
  });
});
