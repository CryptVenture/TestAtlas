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
 *   package/package.json        ← outside .testatlas/ + outside scripts/, must NOT extract
 *   package/scripts/x.js        ← agent accelerator, MUST extract to dstDir/scripts/x.js (v2.0.2)
 *   package/scripts/lib/y.js    ← script lib, MUST extract to dstDir/scripts/lib/y.js (v2.0.2)
 *   package/scripts/e2e/z.js    ← test infrastructure, must NOT extract (parity with copyValidatorScripts)
 *
 * Mirrors the layout of `npm pack @webventures/testatlas`.
 */
async function buildFakeNpmTarball(tarballPath, scratchDir) {
  await mkdir(path.join(scratchDir, 'package', '.testatlas', 'migrations'), { recursive: true });
  await mkdir(path.join(scratchDir, 'package', '.testatlas', 'adapters', 'claude-code'), {
    recursive: true,
  });
  await mkdir(path.join(scratchDir, 'package', 'scripts', 'lib'), { recursive: true });
  await mkdir(path.join(scratchDir, 'package', 'scripts', 'e2e'), { recursive: true });
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
  await writeFile(
    path.join(scratchDir, 'package', 'scripts', 'x.js'),
    '// agent accelerator content\n',
  );
  await writeFile(
    path.join(scratchDir, 'package', 'scripts', 'lib', 'y.js'),
    '// script lib helper\n',
  );
  await writeFile(
    path.join(scratchDir, 'package', 'scripts', 'e2e', 'z.js'),
    '// test infra — must NOT extract\n',
  );
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

test('extractTarball does NOT extract package.json or `package/` wrapper', async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-strip-scratch2-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-strip-dst2-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  const tarball = path.join(scratch, 'fake.tgz');
  await buildFakeNpmTarball(tarball, scratch);
  await extractTarball(tarball, dst);

  assert.equal(
    await exists(path.join(dst, 'package.json')),
    false,
    'tarball-root package.json must NOT land at dstDir/package.json',
  );
  assert.equal(
    await exists(path.join(dst, 'package')),
    false,
    'no `package/` wrapper at dstDir post-extract',
  );
});

// v2.0.2 — package/scripts/ MUST extract to dstDir/scripts/ so the staged
// tree mirrors a fully-installed `.testatlas/`. Pre-v2.0.2 the script
// subtree was dropped on the floor, wiping `<target>/.testatlas/scripts/`
// on every `update --force-reinstall` and forcing every `/atlas:*` command
// into its slow manual fallback path.
test('extractTarball lands package/scripts/ at dstDir/scripts/ (v2.0.2)', async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-scripts-scratch-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-scripts-dst-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  const tarball = path.join(scratch, 'fake.tgz');
  await buildFakeNpmTarball(tarball, scratch);
  await extractTarball(tarball, dst);

  assert.equal(
    await exists(path.join(dst, 'scripts', 'x.js')),
    true,
    'package/scripts/x.js MUST land at dstDir/scripts/x.js (v2.0.2 fix)',
  );
  assert.equal(
    await exists(path.join(dst, 'scripts', 'lib', 'y.js')),
    true,
    'nested package/scripts/lib/y.js MUST land at dstDir/scripts/lib/y.js',
  );
});

// v2.0.2 — scripts/e2e/ must remain excluded. copyValidatorScripts() in
// install-core.js skips e2e/ on the init path; the update path mirrors that.
test('extractTarball excludes scripts/e2e/ (parity with copyValidatorScripts)', async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-e2e-scratch-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-e2e-dst-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  const tarball = path.join(scratch, 'fake.tgz');
  await buildFakeNpmTarball(tarball, scratch);
  await extractTarball(tarball, dst);

  assert.equal(
    await exists(path.join(dst, 'scripts', 'e2e', 'z.js')),
    false,
    'scripts/e2e/ must NOT extract (test infrastructure, not runtime)',
  );
  assert.equal(
    await exists(path.join(dst, 'scripts', 'e2e')),
    false,
    'the empty scripts/e2e/ directory must not exist either',
  );
});

test('extractTarball post-extract layout matches what runUpdate atomic-swap expects', async (t) => {
  // Post-extract, dstDir IS what `<target>/.testatlas/` will become after
  // the atomic swap. Top-level must include: adapters/ + bootstrap.md +
  // migrations/ (from package/.testatlas/) AND scripts/ (from
  // package/scripts/, v2.0.2).
  const scratch = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-shape-scratch-'));
  const dst = await mkdtemp(path.join(tmpdir(), 'testatlas-extract-shape-dst-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
    await rm(dst, { recursive: true, force: true });
  });

  await buildFakeNpmTarball(path.join(scratch, 'fake.tgz'), scratch);
  await extractTarball(path.join(scratch, 'fake.tgz'), dst);

  const { readdir } = await import('node:fs/promises');
  const top = (await readdir(dst, { withFileTypes: true })).map((e) => e.name).sort();
  assert.deepStrictEqual(
    top,
    ['adapters', 'bootstrap.md', 'migrations', 'scripts'],
    `dstDir top-level must include scripts/ (v2.0.2); got: ${top.join(',')}`,
  );
});
