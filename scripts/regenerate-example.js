#!/usr/bin/env node
// scripts/regenerate-example.js
//
// Plan 08-01. Deterministic replay CLI for examples/<name>/.
//
// Determinism env contract (FROZEN — see scripts/lib/determinism.js header):
//   TESTATLAS_DETERMINISTIC=1
//   TESTATLAS_FIXED_TIMESTAMP=<ISO-8601>
//   TESTATLAS_SUITE_VERSION=<semver>
//
// The orchestrator forces all three for child processes (the value of
// FIXED_TIMESTAMP comes from the script's `fixedTimestamp` field).
//
// Usage:
//   node scripts/regenerate-example.js <example-path> [--check]
//
// Behavior:
//   - default (no --check): wipe <example>/_testatlas/, replay every step
//     into it, run final update-indexes + sync-status, validate-workspace.
//   - --check: replay into a tempdir; diff bytes vs the checked-in tree;
//     exit nonzero on drift. Used by CI (08-04) for drift detection.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { isMainModule } from './lib/is-main.js';
import { regenerateExample } from './lib/regenerate-core.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const __thisFile = fileURLToPath(import.meta.url);

export async function main(argv = process.argv) {
  const program = new Command();
  program
    .name('regenerate-example')
    .description('Deterministically rebuild an example’s _testatlas/ workspace from its fixture')
    .argument('<example-path>', 'path to the example dir (e.g. examples/node-api)')
    .option('--check', 'verify checked-in tree matches replay output without writing')
    .action(async (examplePath, opts) => {
      const suiteRoot = path.resolve(path.dirname(__thisFile), '..');
      const ajv = await loadAllSchemas({ cwd: suiteRoot });
      const result = await regenerateExample({
        examplePath: path.resolve(examplePath),
        suiteRoot,
        check: opts.check ?? false,
        ajv,
        onLog: (m) => console.log(`regen: ${m}`),
      });
      if (!result.ok) {
        if (result.drift) {
          console.error(`regen: drift detected (${result.drift.length} entries)`);
          for (const d of result.drift) console.error(`  ${d.kind}: ${d.path}`);
        }
        if (result.errors) {
          for (const e of result.errors) console.error(`regen-error: ${e}`);
        }
        process.exit(1);
      }
      console.log('regen: ok');
    });

  await program.parseAsync(argv);
}

if (isMainModule(import.meta.url)) {
  await main();
}
