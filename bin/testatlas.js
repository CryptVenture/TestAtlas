#!/usr/bin/env node
// bin/testatlas.js
//
// Plan 07-01 Task 2. Commander v14 CLI binary entry point — `npx testatlas
// <init|update|uninstall>`. The `init` subcommand wraps the install kernel
// (`scripts/lib/install-core.js`); `update` and `uninstall` are stubs that
// Plans 07-03 and 07-02 replace with real implementations.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { program } from 'commander';

import { runInit } from '../scripts/lib/install-core.js';

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
  .action(async (opts) => {
    const target = path.resolve(opts.target ?? process.cwd());
    const result = await runInit({
      target,
      suiteRoot: SUITE_ROOT,
      allAdapters: Boolean(opts.allAdapters),
      force: Boolean(opts.force),
      noUpdateCheck: opts.updateCheck === false,
      dryRun: Boolean(opts.dryRun),
    });
    process.exitCode = result.status === 'dry-run' || result.filesWritten >= 0 ? 0 : 1;
  });

program
  .command('update')
  .description('Self-update the suite (Plan 07-03 lands the implementation).')
  .action(() => {
    process.stdout.write('testatlas update: stub. Plan 07-03 lands the update implementation.\n');
  });

program
  .command('uninstall')
  .description('Remove the suite (Plan 07-02 lands the implementation).')
  .action(() => {
    process.stdout.write(
      'testatlas uninstall: stub. Plan 07-02 lands the uninstall implementation.\n',
    );
  });

await program.parseAsync(process.argv);
