#!/usr/bin/env node
// scripts/update.js
//
// Plan 07-03 Task 3 — top-level CLI entry for `node scripts/update.js`.
// Mirrors the `install.js` pattern: thin wrapper around `runUpdate` from
// scripts/lib/update-core.js. The same kernel powers `bin/testatlas.js update`.
//
// Note: until Plan 07-04 lands the GitHub Releases update-check (TTL cache,
// pinning), `latestVersion` must be supplied explicitly via `--latest-version`
// or inferred as equal to `currentVersion` (no-op). The flag exists today so
// the integration story end-to-end (runUpdate behavior) is testable in isolation.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { renderBanner } from './lib/banner.js';
import { runUpdate } from './lib/update-core.js';

const PKG_PATH = path.join(import.meta.dirname, '..', 'package.json');
const pkg = JSON.parse(await readFile(PKG_PATH, 'utf8'));

async function cliMain() {
  const program = new Command();
  program
    .name('testatlas-update')
    .description('Self-update the TestAtlas suite (atomic stage → migrate → swap → backup)')
    .version(pkg.version)
    .addHelpText('beforeAll', () => renderBanner({ version: pkg.version }))
    .showHelpAfterError()
    .option('--target <dir>', 'Target repo (default: cwd)')
    .option('--force-reinstall', 'Re-extract latest even when current version matches')
    .option('--dry-run', 'Print planned actions; do not write')
    .option('--no-update-check', 'Skip GitHub Releases TTL check (Plan 07-04 wires this)')
    .option(
      '--latest-version <ver>',
      'Override target version (defaults to currentVersion until 07-04 lands update-check)',
    )
    .parse(process.argv);

  const opts = program.opts();
  // Brand polish: show banner at the top of the action flow (matches the
  // bin/testatlas.js + install.js pattern). Self-gates on color/unicode env.
  process.stdout.write(renderBanner({ version: pkg.version }));
  const target = path.resolve(opts.target ?? process.cwd());
  const result = await runUpdate({
    target,
    currentVersion: pkg.version,
    latestVersion: opts.latestVersion,
    forceReinstall: Boolean(opts.forceReinstall),
    dryRun: Boolean(opts.dryRun),
    noUpdateCheck: opts.updateCheck === false,
  });
  // Quick 260506-jsc: 'install-missing' and 'drift-detected' are actionable
  // user-facing conditions that must NOT exit 0. They surface explicit
  // remediation text in runUpdate's logger output.
  process.exitCode =
    result.status === 'updated' || result.status === 'up-to-date' || result.status === 'dry-run'
      ? 0
      : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await cliMain();
}
