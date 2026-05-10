// test/scripts/_bump-version-helpers.js
//
// Shared helpers for Quick 260506-hqu bump-version test suite.
//
// Spins up an isolated temp git repo with a minimal TestAtlas-like surface
// (package.json, .testatlas/VERSION, adapter-capabilities.json, mcp manifest,
// CHANGELOG.md) so bump-version.js can run end-to-end without touching the
// real repo. Provides a `makeStubBin()` helper that creates fake `git`, `gh`,
// `npm`, and `pnpm` executables on a synthetic PATH which record their
// invocations to a JSONL log — letting tests assert "what would have been run"
// without any real network/disk side effects beyond the temp dir.

import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const BUMP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'bump-version.js');

/**
 * Build a temp project with the file shape bump-version.js mutates.
 * Initializes a real git repo (so `git diff --quiet` etc. work) and makes
 * one initial commit so HEAD exists. Optionally creates a bare repo at
 * <cwd>/../<basename>.origin and adds it as `origin` so `git push origin
 * <branch>` succeeds during tests that exercise the release pipeline.
 */
export async function makeBumpFixture({
  version = '1.0.0',
  changelog = defaultChangelog(),
  prefix = 'bump-',
  withOrigin = false,
} = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), prefix));

  // package.json
  await writeFile(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'fixture', version, type: 'module' }, null, 2)}\n`,
    'utf8',
  );

  // .testatlas/VERSION
  await mkdir(path.join(cwd, '.testatlas'), { recursive: true });
  await writeFile(path.join(cwd, '.testatlas', 'VERSION'), `${version}\n`, 'utf8');

  // .testatlas/adapters/adapter-capabilities.json
  await mkdir(path.join(cwd, '.testatlas', 'adapters'), { recursive: true });
  await writeFile(
    path.join(cwd, '.testatlas', 'adapters', 'adapter-capabilities.json'),
    `${JSON.stringify({ version, adapters: [] }, null, 2)}\n`,
    'utf8',
  );

  // .testatlas/adapters/mcp/mcp-server-manifest.json
  await mkdir(path.join(cwd, '.testatlas', 'adapters', 'mcp'), { recursive: true });
  await writeFile(
    path.join(cwd, '.testatlas', 'adapters', 'mcp', 'mcp-server-manifest.json'),
    `${JSON.stringify({ version, name: 'fixture' }, null, 2)}\n`,
    'utf8',
  );

  // CHANGELOG.md
  await writeFile(path.join(cwd, 'CHANGELOG.md'), changelog, 'utf8');

  // Initialize git so working-tree-clean checks succeed.
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd });
  spawnSync('git', ['add', '.'], { cwd });
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd });

  let originDir = null;
  if (withOrigin) {
    originDir = `${cwd}.origin`;
    await mkdir(originDir, { recursive: true });
    spawnSync('git', ['init', '--bare', '-q', '-b', 'main'], { cwd: originDir });
    spawnSync('git', ['remote', 'add', 'origin', originDir], { cwd });
    // Push initial commit so subsequent pushes have a baseline to fast-forward from.
    spawnSync('git', ['push', '-q', 'origin', 'main'], { cwd });
  }

  return {
    cwd,
    originDir,
    cleanup: async () => {
      await rm(cwd, { recursive: true, force: true });
      if (originDir) await rm(originDir, { recursive: true, force: true });
    },
  };
}

/**
 * Default CHANGELOG.md fixture content with non-trivial [Unreleased] body
 * including all three subsections, used by migration test.
 */
export function defaultChangelog() {
  return [
    '# Changelog',
    '',
    'All notable changes…',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Feature A: a new thing',
    '- Feature B: another thing',
    '',
    '### Changed',
    '',
    '- Internal refactor of widget X',
    '',
    '### Removed',
    '',
    '- Deprecated Y removed',
    '',
    '## [1.0.0] - 2026-05-04',
    '',
    'First production release.',
    '',
    '### Added',
    '',
    '- Initial GA shipped.',
    '',
  ].join('\n');
}

/**
 * Build a tmpdir of stub executables (git, gh, npm, pnpm) that record their
 * argv to a JSONL log. Returns:
 *   - `binDir`: directory to prepend to PATH
 *   - `logFile`: path to the JSONL log
 *   - `readLog()`: parses the JSONL log into an array of {bin, argv}
 *
 * `realBins` lets a test pass through specific binaries to the real system PATH
 * (e.g. real `git` for tag/state queries) by name. Default: all stubbed.
 *
 * Each stub:
 *   - records `{ bin, argv: [...], cwd }` to logFile
 *   - exits 0 by default
 *   - if `STUB_<UPPERCASE>_EXIT` env var is set, exits with that code
 *   - if `STUB_<UPPERCASE>_STDOUT` env var is set, prints it to stdout
 */
export async function makeStubBin({ realBins = [] } = {}) {
  const binDir = await mkdtemp(path.join(tmpdir(), 'bumpstub-'));
  const logFile = path.join(binDir, 'invocations.jsonl');
  await writeFile(logFile, '', 'utf8');

  const realPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';

  // Shared recorder script (Node-based, file-driven to avoid shell-quoting hell).
  const recorderPath = path.join(binDir, '_record.cjs');
  const recorderJs = `// Stub recorder: appends one JSONL entry to LOG_FILE.
const fs = require('fs');
const [, , bin, ...argv] = process.argv;
fs.appendFileSync(
  process.env.STUB_LOG_FILE,
  JSON.stringify({ bin, argv, cwd: process.cwd() }) + '\\n',
);
`;
  await writeFile(recorderPath, recorderJs, 'utf8');

  // Note: this stub harness emits POSIX `#!/bin/sh` wrappers and uses
  // `:` to join the PATH. It's fundamentally incompatible with Windows
  // (no `/bin/sh`, no `which`, PATH separator is `;`). Callers should
  // skip-on-Windows at the test level; we leave the helper as-is here
  // so the dev experience on macOS/Linux stays simple.
  for (const name of ['git', 'gh', 'npm', 'pnpm']) {
    const upper = name.toUpperCase();
    if (realBins.includes(name)) {
      // Wrapper that records argv then execs the real binary on the host PATH.
      const which = spawnSync('which', [name], {
        encoding: 'utf8',
        env: { PATH: realPath },
      });
      const realBin = which.stdout.trim();
      if (realBin) {
        const wrapper = `#!/bin/sh
STUB_LOG_FILE=${JSON.stringify(logFile)} node ${JSON.stringify(recorderPath)} ${name} "$@" || true
exec ${JSON.stringify(realBin)} "$@"
`;
        const stubPath = path.join(binDir, name);
        await writeFile(stubPath, wrapper, 'utf8');
        await chmod(stubPath, 0o755);
        continue;
      }
    }

    // Pure stub: record + emit STUB_*_STDOUT + exit STUB_*_EXIT.
    const stub = `#!/bin/sh
STUB_LOG_FILE=${JSON.stringify(logFile)} node ${JSON.stringify(recorderPath)} ${name} "$@" || true
if [ -n "\${STUB_${upper}_STDOUT:-}" ]; then
  printf '%s' "$STUB_${upper}_STDOUT"
fi
exit "\${STUB_${upper}_EXIT:-0}"
`;
    const stubPath = path.join(binDir, name);
    await writeFile(stubPath, stub, 'utf8');
    await chmod(stubPath, 0o755);
  }

  return {
    binDir,
    logFile,
    realPath,
    pathPrepended: `${binDir}:${realPath}`,
    readLog: async () => {
      const buf = await readFile(logFile, 'utf8');
      return buf
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    },
    cleanup: () => rm(binDir, { recursive: true, force: true }),
  };
}

/**
 * Run bump-version.js inside a fixture cwd with stubbed bins.
 * Returns spawnSync result.
 */
export function runBump(cwd, argv = [], { env = {}, pathPrepended } = {}) {
  return spawnSync('node', [BUMP_SCRIPT, ...argv], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      ...(pathPrepended ? { PATH: pathPrepended } : {}),
      // Tell bump-version.js it's running in test mode (allows skipping
      // gates that would call into the real repo from a temp cwd).
      BUMP_VERSION_TEST_MODE: '1',
      ...env,
    },
  });
}
