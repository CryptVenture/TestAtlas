#!/usr/bin/env node
// bin/testatlas.js
//
// Plan 07-01 Task 2. Commander v14 CLI binary entry point — `npx testatlas
// <init|update|uninstall>`. The `init` subcommand wraps the install kernel
// (`scripts/lib/install-core.js`); `update` and `uninstall` are stubs that
// Plans 07-03 and 07-02 replace with real implementations.

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { program } from 'commander';

import { runInit } from '../scripts/lib/install-core.js';
import { runUpdate } from '../scripts/lib/update-core.js';
import { runUninstall } from '../scripts/uninstall.js';

// Plan 07-04 (UPDATE-07). When --verify-signature is passed, probe for cosign
// on PATH; abort with an actionable error if missing. The actual cosign
// invocation is owned by install.sh (curl-pipe path) and tarball.js (npx
// path); this top-level probe is a fast-fail to avoid downloading anything
// when the verifier isn't available.
function probeCosignOrExit() {
  const probe = spawnSync('cosign', ['version'], { stdio: 'ignore' });
  if (probe.status === 0) return;
  process.stderr.write(
    '[testatlas] cosign not found on PATH. Install: ' +
      'https://docs.sigstore.dev/cosign/installation/\n',
  );
  process.exit(1);
}

// Node 20.11+ exposes `import.meta.dirname` natively — no fileURLToPath shim.
const PKG_PATH = path.join(import.meta.dirname, '..', 'package.json');
const SUITE_ROOT = path.join(import.meta.dirname, '..');

const pkg = JSON.parse(await readFile(PKG_PATH, 'utf8'));

program
  .name('testatlas')
  .description('Agent-agnostic AI product testing & quality intelligence framework')
  .version(pkg.version);

program
  .command('init')
  .description('Install the TestAtlas suite into the current repo (or --target dir).')
  .option('--all-adapters', 'Install all 7 adapters regardless of detection')
  .option('--force', 'Overwrite existing .testatlas/ (preserves _testatlas/)')
  .option('--no-update-check', 'Skip the GitHub Releases version check')
  .option('--target <dir>', 'Target repo directory (default: cwd)')
  .option('--dry-run', 'Print planned actions without writing')
  .option(
    '--verify-signature',
    'Verify the release tarball cosign attestation (requires cosign on PATH)',
  )
  .action(async (opts) => {
    if (opts.verifySignature) {
      probeCosignOrExit();
    }
    const target = path.resolve(opts.target ?? process.cwd());
    const result = await runInit({
      target,
      suiteRoot: SUITE_ROOT,
      allAdapters: Boolean(opts.allAdapters),
      force: Boolean(opts.force),
      noUpdateCheck: opts.updateCheck === false,
      dryRun: Boolean(opts.dryRun),
      verifySignature: Boolean(opts.verifySignature),
    });
    process.exitCode = result.status === 'dry-run' || result.filesWritten >= 0 ? 0 : 1;
  });

program
  .command('update')
  .description('Self-update the suite (atomic stage → migrate → swap → backup).')
  .option('--target <dir>', 'Target repo directory (default: cwd)')
  .option('--force-reinstall', 'Re-extract latest even when current version matches')
  .option('--dry-run', 'Print planned actions; do not write')
  .option('--no-update-check', 'Skip GitHub Releases TTL check')
  .option(
    '--latest-version <ver>',
    'Override the target version (skips the GH Releases auto-check)',
  )
  .option(
    '--verify-signature',
    'Verify the release tarball cosign attestation (requires cosign on PATH)',
  )
  .action(async (opts) => {
    if (opts.verifySignature) {
      probeCosignOrExit();
    }
    const target = path.resolve(opts.target ?? process.cwd());
    const result = await runUpdate({
      target,
      currentVersion: pkg.version,
      latestVersion: opts.latestVersion,
      forceReinstall: Boolean(opts.forceReinstall),
      dryRun: Boolean(opts.dryRun),
      noUpdateCheck: opts.updateCheck === false,
      verifySignature: Boolean(opts.verifySignature),
    });
    process.exitCode =
      result.status === 'updated' ||
      result.status === 'up-to-date' ||
      result.status === 'dry-run' ||
      result.status === 'pinned-skip'
        ? 0
        : 1;
  });

program
  .command('uninstall')
  .description('Remove the TestAtlas suite from the current repo.')
  .option('--target <dir>', 'Target repo (default: cwd)')
  .option('--purge', 'Also remove _testatlas/ workspace state (DESTRUCTIVE)')
  .option('--force-untracked', 'Allow uninstall when manifest is missing/corrupt')
  .option('--dry-run', 'Print planned removals; do not delete')
  .action(async (opts) => {
    await runUninstall({
      target: opts.target,
      purge: Boolean(opts.purge),
      forceUntracked: Boolean(opts.forceUntracked),
      dryRun: Boolean(opts.dryRun),
    });
  });

await program.parseAsync(process.argv);
