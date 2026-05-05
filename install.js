#!/usr/bin/env node
// install.js
//
// Plan 07-01 Task 2. Top-level entry point for the git-clone install path:
//
//   git clone https://github.com/CryptVenture/TestAtlas
//   cd testatlas
//   node install.js /path/to/target-repo
//
// Thin wrapper around `scripts/lib/install-core.js`; commits no behavior of
// its own beyond argv parsing. Both this entry and `bin/testatlas.js init`
// converge on `runInit` from the kernel.

import os from 'node:os';
import path from 'node:path';
import { program } from 'commander';

import { palette, symbol } from './scripts/lib/colors.js';
import { ALL_ADAPTERS, runInit } from './scripts/lib/install-core.js';

// Suite root is the directory this file lives in.
const SUITE_ROOT = import.meta.dirname;

program
  .name('install.js')
  .description('Install TestAtlas (git-clone path).')
  .argument('[target]', 'Target repo directory (default: cwd, or $HOME with --global)')
  .option('--all-adapters', `Install all ${ALL_ADAPTERS.length} adapters regardless of detection`)
  .option('--force', 'Overwrite existing .testatlas/ (preserves _testatlas/)')
  .option('--dry-run', 'Print planned actions without writing')
  .option(
    '--global',
    'Install adapter command files into user-home (~/.claude/, ~/.cursor/, etc.) ' +
      'so every coding agent in every project picks up /atlas:* commands.',
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ node install.js .                             # install into current dir',
      '  $ node install.js /path/to/my-app               # install into a sibling repo',
      '  $ node install.js --all-adapters --force .      # reinstall with every adapter',
      '  $ node install.js --global                      # install command files into ~/.claude/, ~/.cursor/, etc.',
      '',
    ].join('\n'),
  )
  .action(async (targetArg, opts) => {
    const isGlobal = Boolean(opts.global);
    // Argument default falls back to cwd; in --global mode, prefer $HOME if
    // the caller didn't pass an explicit positional target.
    const explicit = targetArg && targetArg !== process.cwd() ? targetArg : null;
    const target = path.resolve(explicit ?? (isGlobal ? os.homedir() : process.cwd()));
    await runInit({
      target,
      suiteRoot: SUITE_ROOT,
      allAdapters: Boolean(opts.allAdapters),
      force: Boolean(opts.force),
      dryRun: Boolean(opts.dryRun),
      global: isGlobal,
    });
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  // Mirror bin/testatlas.js trimmed-stack error path (Quick 260504-pjh).
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
