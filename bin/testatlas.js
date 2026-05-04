#!/usr/bin/env node
// bin/testatlas.js
//
// Plan 07-01 Task 2. Commander v14 CLI binary entry point — `npx @webventures/testatlas
// <init|update|uninstall>`. The `init` subcommand wraps the install kernel
// (`scripts/lib/install-core.js`); `update` and `uninstall` are stubs that
// Plans 07-03 and 07-02 replace with real implementations.

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { program } from 'commander';
import { renderBanner } from '../scripts/lib/banner.js';
import { palette, symbol } from '../scripts/lib/colors.js';
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
  .version(pkg.version)
  .addHelpText('beforeAll', () => renderBanner({ version: pkg.version }))
  .showHelpAfterError();

program
  .command('init')
  .description(
    'Install the TestAtlas suite into the current repo (or --target dir). After ' +
      'install, run `/atlas:init` inside your AI coding agent to bootstrap the ' +
      '_testatlas/ workspace.',
  )
  .option(
    '--adapter <name>',
    'Install only this adapter (repeatable; bypasses auto-detect)',
    (val, prev) => [...prev, val],
    [],
  )
  .option('--all-adapters', 'Install all 18 adapters regardless of detection')
  .option('--force', 'Overwrite existing .testatlas/ (preserves _testatlas/)')
  .option('--no-update-check', 'Skip the GitHub Releases version check')
  .option('--target <dir>', 'Target repo directory (default: cwd)')
  .option('--dry-run', 'Print planned actions without writing')
  .option(
    '--global',
    'Install adapter command files into user-home (~/.claude/, ~/.cursor/, ' +
      '~/.config/opencode/, etc.) so every coding agent in every project gets ' +
      '/atlas:* commands. Skips _testatlas/ workspace seed (workspace state is ' +
      'always project-local).',
  )
  .option(
    '--verify-signature',
    'Verify the release tarball cosign attestation (requires cosign on PATH)',
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ testatlas init                                # install into cwd, auto-detect adapters',
      '  $ testatlas init --target ./my-app              # install into a sibling repo',
      '  $ testatlas init --all-adapters --force         # reinstall with every adapter',
      '  $ testatlas init --adapter cline --adapter windsurf  # install only the named adapters',
      '  $ testatlas init --global                       # install command files into ~/.claude/, ~/.cursor/, etc.',
      '  $ testatlas init --dry-run                      # preview without writing',
      '',
    ].join('\n'),
  )
  .action(async (opts) => {
    if (opts.verifySignature) {
      probeCosignOrExit();
    }
    // In --global mode, default the target to os.homedir() unless the caller
    // overrides with --target. install-core.js does the same defaulting if
    // target is undefined; we resolve here so the manifest captures an
    // absolute path.
    const isGlobal = Boolean(opts.global);
    const explicitTarget = opts.target ? path.resolve(opts.target) : null;
    const target = explicitTarget ?? (isGlobal ? os.homedir() : process.cwd());
    const result = await runInit({
      target,
      suiteRoot: SUITE_ROOT,
      adapters: Array.isArray(opts.adapter) ? opts.adapter : [],
      allAdapters: Boolean(opts.allAdapters),
      force: Boolean(opts.force),
      noUpdateCheck: opts.updateCheck === false,
      dryRun: Boolean(opts.dryRun),
      verifySignature: Boolean(opts.verifySignature),
      global: isGlobal,
    });
    process.exitCode = result.status === 'dry-run' || result.filesWritten >= 0 ? 0 : 1;
  });

program
  .command('update')
  .description(
    'Self-update the suite to the latest GitHub release (atomic stage → ' +
      'migrate → swap → backup; rolls back on failure).',
  )
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
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ testatlas update                              # check GitHub Releases, update if newer',
      '  $ testatlas update --dry-run                    # preview the version transition',
      '  $ testatlas update --force-reinstall            # re-extract latest even if up to date',
      '  $ testatlas update --latest-version 1.2.3       # pin the target version explicitly',
      '',
    ].join('\n'),
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
  .description(
    'Remove the TestAtlas suite from the current repo. By default ' +
      '_testatlas/ workspace state is preserved; use --purge to delete it too.',
  )
  .option('--target <dir>', 'Target repo (default: cwd)')
  .option('--purge', 'Also remove _testatlas/ workspace state (DESTRUCTIVE)')
  .option('--force-untracked', 'Allow uninstall when manifest is missing/corrupt')
  .option('--dry-run', 'Print planned removals; do not delete')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ testatlas uninstall                           # remove suite; keep _testatlas/',
      '  $ testatlas uninstall --purge                   # also delete _testatlas/ workspace state',
      '  $ testatlas uninstall --dry-run                 # preview removals',
      '  $ testatlas uninstall --force-untracked         # nuke .testatlas/ even without manifest',
      '',
    ].join('\n'),
  )
  .action(async (opts) => {
    await runUninstall({
      target: opts.target,
      purge: Boolean(opts.purge),
      forceUntracked: Boolean(opts.forceUntracked),
      dryRun: Boolean(opts.dryRun),
    });
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  // Trimmed-stack error path (Quick 260504-pjh). Honors NO_COLOR/NO_UNICODE
  // via the colors.js helpers. Stack is limited to 3 'at' frames so the
  // user sees the failure without a full Node-internals dump.
  const sym = symbol('err');
  const head = palette.err(`${sym} Error:`);
  const message = err?.message ?? String(err);
  process.stderr.write(`${head} ${message}\n`);
  const stack = String(err?.stack ?? '');
  const frames = stack
    .split('\n')
    .filter((l) => l.trim().startsWith('at '))
    .slice(0, 3);
  if (frames.length > 0) {
    process.stderr.write(`${frames.join('\n')}\n`);
  }
  process.exit(1);
}
