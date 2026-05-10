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
import { runAddAdapter } from '../scripts/lib/add-adapter-core.js';
import { renderBanner } from '../scripts/lib/banner.js';
import { palette, symbol } from '../scripts/lib/colors.js';
import { ALL_ADAPTERS, runInit } from '../scripts/lib/install-core.js';
import { runUpdate } from '../scripts/lib/update-core.js';
import { runUninstall } from '../scripts/uninstall.js';
import { validateWorkspace } from '../scripts/validate-workspace.js';

// Plan 12-01 (post-Phase-12 reality):
//   --verify-signature → kernels invoke `cosign verify-blob-attestation` via
//                        scripts/lib/tarball.js (npx path) and via
//                        install.sh:79-104 (curl-pipe path). Both flows use
//                        the same OIDC-issuer + cert-identity-regexp pins.
//   --verify-checksum  → kernels fetch the `.sha256` sidecar from GitHub
//                        Releases (npm-attestation bundle as fallback) and
//                        call tarball.verifyChecksum with the expected SHA.
//                        Halts with TESTATLAS_CHECKSUM_MISMATCH on mismatch
//                        or TESTATLAS_SHA_SIDECAR_UNAVAILABLE if the sidecar
//                        can't be fetched. Both flags are opt-in (default
//                        behavior preserved). When --verify-signature is
//                        passed, this top-level probe is a fast-fail to avoid
//                        downloading anything when the cosign binary is
//                        absent on PATH.
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
  .option('--all-adapters', `Install all ${ALL_ADAPTERS.length} adapters regardless of detection`)
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
  .option(
    '--verify-checksum',
    'Verify the release tarball SHA-256 against the GitHub Release .sha256 sidecar',
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
      verifyChecksum: Boolean(opts.verifyChecksum),
      global: isGlobal,
    });
    process.exitCode = result.status === 'dry-run' || result.filesWritten >= 0 ? 0 : 1;
  });

program
  .command('add-adapter <names...>')
  .description(
    'Add one or more adapters to an existing TestAtlas install (does not ' +
      'overwrite the suite tree).',
  )
  .option('--target <dir>', 'Target repo directory (default: cwd)')
  .option('--global', 'Operate on the global ~/.testatlas/ install instead of cwd')
  .option('--dry-run', 'Print planned file additions without writing')
  .option('--force', 'Re-copy adapter files even if already present')
  .option(
    '--verify-signature',
    'Verify the release tarball cosign attestation (requires cosign on PATH)',
  )
  .option(
    '--verify-checksum',
    'Verify the release tarball SHA-256 against the GitHub Release .sha256 sidecar',
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ testatlas add-adapter cline                       # add a single adapter to cwd install',
      '  $ testatlas add-adapter windsurf zed roo-code       # add multiple adapters',
      '  $ testatlas add-adapter cline --global              # add adapter to global install',
      '  $ testatlas add-adapter cline --dry-run             # preview without writing',
      '',
    ].join('\n'),
  )
  .action(async (names, opts) => {
    if (opts.verifySignature) {
      probeCosignOrExit();
    }
    const isGlobal = Boolean(opts.global);
    const explicitTarget = opts.target ? path.resolve(opts.target) : null;
    const target = explicitTarget ?? (isGlobal ? os.homedir() : process.cwd());
    const result = await runAddAdapter({
      target,
      suiteRoot: SUITE_ROOT,
      adapters: names,
      dryRun: Boolean(opts.dryRun),
      force: Boolean(opts.force),
      verifySignature: Boolean(opts.verifySignature),
      verifyChecksum: Boolean(opts.verifyChecksum),
      global: isGlobal,
    });
    process.exitCode =
      result.status === 'added' || result.status === 'no-op' || result.status === 'dry-run' ? 0 : 1;
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
  .option(
    '--verify-checksum',
    'Verify the downloaded tarball SHA-256 against the GitHub Release .sha256 sidecar',
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
      verifyChecksum: Boolean(opts.verifyChecksum),
      // v2.0.1: CLI invocation = explicit user consent → bypass the
      // destructive-fs capability gate so default safeMode:true does not
      // block `npx ... update --force-reinstall`. Programmatic / sub-agent
      // callers do NOT pass this flag and remain config-gated.
      bypassSafetyGate: true,
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
      // v2.0.1: CLI invocation = explicit user consent → bypass the
      // destructive-fs capability gate so default safeMode:true does not
      // block `npx ... uninstall`. Programmatic / sub-agent callers do
      // NOT pass this flag and remain config-gated.
      bypassSafetyGate: true,
    });
  });

program
  .command('validate')
  .description(
    'Validate a TestAtlas workspace against PRD §33 checks (canonical files, ' +
      'schemas, broken links, orphaned evidence, etc.). Exits 1 on any failing ' +
      'check.',
  )
  .option('--target <dir>', 'Target repo directory (default: cwd)')
  .option('--auto-heal', 'Apply safe auto-heals (HEAL-01..04). Writes by default.')
  .option('--dry-run', 'Preview mode: do not write reports or autoheal changes')
  .option('--apply', '(deprecated: redundant when --auto-heal is set; will be removed in v2)')
  .option(
    '--apply-suggestions',
    'Apply suggestion-tier heals (HEAL-05 missing-evidence-ref, HEAL-06 additional-property strip). Implies --auto-heal.',
  )
  .option('--json', 'Emit the JSON report to stdout instead of the markdown report')
  .option('--output <file>', 'Write the markdown report to <file> + JSON to <file>.json')
  .option('--only <ids>', 'Comma-separated list of check ids to run (e.g. schemas,broken-links)')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  $ testatlas validate                          # validate cwd workspace',
      '  $ testatlas validate --target ./my-app        # validate a sibling repo',
      '  $ testatlas validate --json                   # machine-readable JSON to stdout',
      '  $ testatlas validate --auto-heal              # repair safely-fixable findings in place',
      '  $ testatlas validate --auto-heal --dry-run    # preview heals without writing',
      '  $ testatlas validate --apply-suggestions      # apply HEAL-05 + HEAL-06 (implies --auto-heal)',
      '  $ testatlas validate --output report.md       # write markdown + JSON report files',
      '',
    ].join('\n'),
  )
  .action(async (opts, cmd) => {
    const target = path.resolve(opts.target ?? process.cwd());
    const only =
      typeof opts.only === 'string'
        ? opts.only
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    // GAP-1 (Quick 260506-nj2): --auto-heal applies by default; --dry-run
    // inverts to preview. Mirror runCli's default-flip here because the npx
    // CLI dispatches via bin/testatlas.js → validateWorkspace() directly,
    // bypassing runCli where the original flip lived. Detect "--apply was
    // user-provided" via the raw argv slice (not Boolean(opts.apply), which
    // would treat the auto-flip as user-set).
    const _userArgs = Array.isArray(cmd?.args) ? cmd.args : [];
    const rawArgv = process.argv.slice(2);
    const userPassedApply = rawArgv.includes('--apply');
    const userPassedDryRun = rawArgv.includes('--dry-run');
    // Quick 260506-vaq: --apply-suggestions implies --auto-heal so the
    // autoheal loop runs at all. Mirrors the runCli flip in
    // scripts/validate-workspace.js.
    const applySuggestions = Boolean(opts.applySuggestions);
    let autoHeal = Boolean(opts.autoHeal);
    if (applySuggestions && !autoHeal) autoHeal = true;
    let apply = Boolean(opts.apply);
    if (autoHeal && !userPassedDryRun && !userPassedApply) {
      apply = true; // bare --auto-heal → apply
    }
    if (autoHeal && userPassedApply) {
      process.stderr.write(
        'testatlas validate: --apply is now redundant when --auto-heal is set; remove it from your invocation.\n',
      );
    }
    const result = await validateWorkspace({
      cwd: target,
      autoHeal,
      apply,
      applySuggestions,
      dryRun: Boolean(opts.dryRun),
      only,
      report: opts.output,
    });
    if (result.message) {
      process.stdout.write(`${result.message}\n`);
      process.exitCode = result.exitCode;
      return;
    }
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result.reportJson, null, 2)}\n`);
    } else {
      process.stdout.write(result.reportMarkdown ?? '');
    }
    process.exitCode = result.exitCode;
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
