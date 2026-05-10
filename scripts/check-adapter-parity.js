#!/usr/bin/env node
// scripts/check-adapter-parity.js
//
// Plan 06-02: VAL-05 adapter-parity gate (CLI runner).
//
// Wraps scripts/lib/adapters/parity.js#enumerate() with a printable summary
// + an exit code suitable for CI. Two modes:
//
//   Default (transitional, used by Plans 06-02 → 06-04):
//     Exit 1 only on `no-marker | hash-mismatch | hand-edit` drift, OR if
//     nothing is found at all (`found === 0`). `missing` drift is tolerated
//     because Plans 06-03 and 06-04 ship the remaining 6 adapters.
//
//   --strict (used by Plan 06-05 once every adapter has shipped):
//     Exit 1 on any drift kind, including `missing`. Equivalent to
//     "coverage must be 1.0".
//
// CLI:
//   node scripts/check-adapter-parity.js                    # default mode
//   node scripts/check-adapter-parity.js --strict           # full coverage
//   node scripts/check-adapter-parity.js --workspace <path> # alt cwd
//   node scripts/check-adapter-parity.js --json             # machine-readable
//
// IMPORTANT: This file's MERE EXISTENCE flips the Phase 5 stub (which lives
// at test/adapter-parity-stub.test.js) from passes-trivially to the real
// gate. See 06-RESEARCH.md §Pitfall 4. This script is committed atomically
// with the parity library + the rewritten stub.

import path from 'node:path';
import { enumerate } from './lib/adapters/parity.js';
import { isMainModule } from './lib/is-main.js';

/**
 * Re-export so `import { enumerate } from 'scripts/check-adapter-parity.js'`
 * keeps working for any caller that imported the canonical CLI module.
 */
export { enumerate };

const USAGE = `Usage: node scripts/check-adapter-parity.js [options]

Options:
  --workspace <path>  Workspace root (default: cwd).
  --strict            Fail on any drift kind, including 'missing' (Plan 06-05).
  --json              Emit machine-readable JSON instead of the human summary.
  -h, --help          Show this help.

Drift kinds:
  missing       expected file does not exist
  no-marker     file exists but no <!-- TESTATLAS:GENERATED:* --> envelope
  hash-mismatch source command edited; adapter not regenerated
  hand-edit     derived file edited directly (re-render byte-compare)

Exit codes:
  0   no fatal drift (default mode also tolerates 'missing')
  1   fatal drift detected
  2   bad CLI args
`;

/**
 * @param {string[]} argv
 */
async function runCli(argv) {
  const opts = { workspace: undefined, strict: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') {
      opts.workspace = argv[++i];
    } else if (a === '--strict') {
      opts.strict = true;
    } else if (a === '--json') {
      opts.json = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      process.stderr.write(`check-adapter-parity: unknown arg "${a}"\n${USAGE}`);
      process.exit(2);
    }
  }

  const repoRoot = path.resolve(opts.workspace ?? process.cwd());
  const result = await enumerate({ repoRoot });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printSummary(result, repoRoot);
  }

  // Exit code logic.
  const fatalKinds = new Set(
    opts.strict
      ? ['missing', 'no-marker', 'hash-mismatch', 'hand-edit']
      : ['no-marker', 'hash-mismatch', 'hand-edit'],
  );
  const fatalCount = result.drift.filter((d) => fatalKinds.has(d.kind)).length;
  const exitCode = fatalCount > 0 ? 1 : result.found === 0 ? 1 : 0;
  process.exit(exitCode);
}

/**
 * @param {import('./lib/adapters/parity.js').EnumerateResult} result
 * @param {string} repoRoot
 */
function printSummary(result, repoRoot) {
  const pct = (result.coverage * 100).toFixed(1);
  process.stdout.write(
    `Parity: ${result.found}/${result.expected} obligations satisfied (${pct}% coverage)\n`,
  );

  // Group drift by adapter, then by kind.
  /** @type {Map<string, Map<string, number>>} */
  const byAdapter = new Map();
  for (const d of result.drift) {
    if (!byAdapter.has(d.adapter)) byAdapter.set(d.adapter, new Map());
    const inner = byAdapter.get(d.adapter);
    inner.set(d.kind, (inner.get(d.kind) ?? 0) + 1);
  }

  if (byAdapter.size === 0) {
    process.stdout.write('No drift detected.\n');
    return;
  }

  process.stdout.write('\nDrift by adapter:\n');
  const adapterNames = [...byAdapter.keys()].sort();
  for (const name of adapterNames) {
    const inner = byAdapter.get(name);
    const parts = [...inner.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k}=${n}`);
    process.stdout.write(`  ${name}: ${parts.join(', ')}\n`);
  }

  // Surface every non-`missing` drift entry verbatim — those are the dangerous
  // ones (always fatal regardless of mode).
  const nonMissing = result.drift.filter((d) => d.kind !== 'missing');
  if (nonMissing.length > 0) {
    process.stdout.write('\nNon-missing drift entries:\n');
    for (const d of nonMissing) {
      const rel = path.relative(repoRoot, d.expectedPath);
      const extra =
        d.kind === 'hash-mismatch' && d.expectedHash && d.actualHash
          ? `  expected=${d.expectedHash} actual=${d.actualHash}`
          : '';
      process.stdout.write(`  [${d.kind}] ${rel}${extra}\n`);
    }
  }
}
if (isMainModule(import.meta.url)) {
  await runCli(process.argv.slice(2));
}
