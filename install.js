#!/usr/bin/env node
// install.js
//
// Plan 07-01 Task 2. Top-level entry point for the git-clone install path:
//
//   git clone https://github.com/testatlas-dev/testatlas
//   cd testatlas
//   node install.js /path/to/target-repo
//
// Thin wrapper around `scripts/lib/install-core.js`; commits no behavior of
// its own beyond argv parsing. Both this entry and `bin/testatlas.js init`
// converge on `runInit` from the kernel.

import path from 'node:path';
import { program } from 'commander';

import { runInit } from './scripts/lib/install-core.js';

// Suite root is the directory this file lives in.
const SUITE_ROOT = import.meta.dirname;

program
  .name('install.js')
  .description('Install TestAtlas (git-clone path).')
  .argument('[target]', 'Target repo directory (default: cwd)', process.cwd())
  .option('--all-adapters', 'Install all 7 adapters regardless of detection')
  .option('--force', 'Overwrite existing .testatlas/ (preserves _testatlas/)')
  .option('--dry-run', 'Print planned actions without writing')
  .action(async (targetArg, opts) => {
    const target = path.resolve(targetArg ?? process.cwd());
    await runInit({
      target,
      suiteRoot: SUITE_ROOT,
      allAdapters: Boolean(opts.allAdapters),
      force: Boolean(opts.force),
      dryRun: Boolean(opts.dryRun),
    });
  });

await program.parseAsync(process.argv);
