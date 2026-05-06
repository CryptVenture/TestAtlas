// test/scripts/extract-tarball-strips-package-wrapper.test.js
//
// Quick 260506-jsh — extractTarball must strip the `package/.testatlas/`
// wrapper so dstDir receives the suite content directly, matching the
// contract every test fixture in the repo already assumes.
//
// User-observed scenario (post-v1.1.3 ship): `npx @webventures/testatlas
// update --force-reinstall` on a real tarball. After the swap:
//
//   $ ls ~/tmp/.testatlas
//   package
//
// The actual suite was at ~/tmp/.testatlas/package/.testatlas/. Catastrophic
// — every consumer-side update has shipped a broken installation since
// v1.0.0 (the bug only surfaces post-update; a fresh install via the npx
// CLI uses runInit which reads from the unwrapped npx package directly,
// so the bug was invisible until users actually ran `update`).
//
// The npm tarball convention is `package/<contents>/`. Our suite content
// inside the tarball is at `package/.testatlas/<files>`. extractTarball
// must therefore use --strip-components=2 + a path filter to land just
// the suite content at dstDir.
//
// migrations live at .testatlas/migrations/ (so package/.testatlas/migrations/
// in the tarball; stageDir/migrations/ post-strip — which is what
// update-core's applyMigrations expects).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { extractTarball } from '../../scripts/lib/tarball.js';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a fake npm-shape tarball at <tarball>:
 *   package/.testatlas/bootstrap.md
 *   package/.testatlas/migrations/v1-to-v2.js
 *   package/.testatlas/adapters/claude-code/init.md
 *   package/package.json    ← outside .testatlas/, must NOT extract
 *   package/scripts/x.js    ← outside .testatlas/, must NOT extract
 *
 * Mirrors the layout of `npm pack @webventures/testatlas`.
 */
async function buildFakeNpmTarball(tarballPath, scratchDir) {
  await mkdir(path.join(scratchDir, 'package', '.testatlas', 'migrations'), { recursive: true });
  await mkdir(path.join(scratchDir, 'package', '.testatlas', 'adapters', 'claude-code'), {
    recursive: true,
  });
  await mkdir(path.join(scratchDir, 'package', 'scripts'), { recursive: true });
  await writeFile(
    path.join(scratchDir, 'package', '.testatlas', 'bootstrap.md'),
    '# bootstrap content\n',
  );
  await writeFile(
    path.join(scratchDir, 'package', '.testatlas', 'migrations', 'v1-to-v2.js'),
    'export default function () {}\n',
  );
  await writeFile(
    path.join(scratchDir, 'package', '.testatlas', 'adapters', 'claude-code', 'init.md'),
    '# claude-code init\n',
  );
  await writeFile(path.join(scratchDir, 'package', 'package.json'), '{"name":"fake"}\n');
  await writeFile(path.join(scratchDir, 'package', 'scripts', 'x.js'), '// out-of-suite content\n');
  const r = spawnSync('tar', ['-czf', tarballPath, '-C', scratchDir, 'package'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`tar failed: ${r.stderr}`);
  }
}

test('extractTarball strips package/.testatlas/ wrapper and leaves suite content at dstDir', async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-strip-scratch-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-strip-dst-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  const tarball = path.join(scratch, 'fake.tgz');
  await buildFakeNpmTarball(tarball, scratch);

  await extractTarball(tarball, dst);

  // Suite content MUST be at dstDir directly (no package/.testatlas/ wrapper).
  assert.equal(
    await exists(path.join(dst, 'bootstrap.md')),
    true,
    'extractTarball must place .testatlas/bootstrap.md at dstDir/bootstrap.md (no wrapper)',
  );
  assert.equal(
    await exists(path.join(dst, 'migrations', 'v1-to-v2.js')),
    true,
    'migrations must land at dstDir/migrations/ (so update-core can find them)',
  );
  assert.equal(
    await exists(path.join(dst, 'adapters', 'claude-code', 'init.md')),
    true,
    'adapters must land at dstDir/adapters/',
  );
});

test('extractTarball does NOT extract files outside package/.testatlas/', async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-strip-scratch2-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-strip-dst2-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  const tarball = path.join(scratch, 'fake.tgz');
  await buildFakeNpmTarball(tarball, scratch);
  await extractTarball(tarball, dst);

  // Out-of-suite files must NOT extract.
  assert.equal(
    await exists(path.join(dst, 'package.json')),
    false,
    'tarball-root package.json must NOT land at dstDir/package.json (only suite content)',
  );
  assert.equal(
    await exists(path.join(dst, 'scripts', 'x.js')),
    false,
    'tarball-root scripts/ must NOT extract (not part of installed suite tree)',
  );
  assert.equal(
    await exists(path.join(dst, 'package')),
    false,
    'no `package/` wrapper at dstDir post-extract',
  );
});

test('extractTarball post-extract layout matches what runUpdate atomic-swap expects', async (t) => {
  // Sanity end-to-end: post-extract, the dstDir has the same shape that the
  // existing test fixtures produce via the _testHooks.extractTarball mock.
  // Specifically: dstDir/bootstrap.md, dstDir/migrations/, etc. — never
  // dstDir/package/...
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-shape-scratch-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-shape-dst-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  await buildFakeNpmTarball(path.join(scratch, 'fake.tgz'), scratch);
  await extractTarball(path.join(scratch, 'fake.tgz'), dst);

  // Pin the exact contract: rename(dstDir → target/.testatlas) is correct
  // post-fix because dstDir IS the .testatlas content.
  const { readdir } = await import('node:fs/promises');
  const top = (await readdir(dst, { withFileTypes: true })).map((e) => e.name).sort();
  // Should contain: adapters, bootstrap.md, migrations
  assert.deepStrictEqual(
    top,
    ['adapters', 'bootstrap.md', 'migrations'],
    `dstDir top-level must be the suite content directly; got: ${top.join(',')}`,
  );
});
