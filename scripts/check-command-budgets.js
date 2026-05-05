#!/usr/bin/env node
// scripts/check-command-budgets.js
//
// CI driver — enumerates .testatlas/commands/*.md and runs check-token-budget.js
// against each with maxWords=1800. Exits 0 if all files are under budget OR the
// directory is missing/empty (Wave-0 tolerance: Plan 03-01 ships this gate
// before Plans 03-02/03-03 author the command files).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { argv, cwd, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { listCommandFiles } from './lib/list-command-files.js';
import { assertCapability } from './lib/safety.js';

const MAX_WORDS = 1800;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_BUDGET_SCRIPT = path.join(__dirname, 'check-token-budget.js');
const root = argv[2] || cwd();
const files = await listCommandFiles({ cwd: root });

if (files.length === 0) {
  console.log(`OK: no command files under .testatlas/commands/ (Phase 3 still in progress).`);
  exit(0);
}

// ISSUE-014 defense-in-depth: this script is internal CI tooling that fans
// out child node processes. Capability tag: 'spawn'. Permissive default —
// budget checking is a developer/CI workflow that has implicitly opted in.
const __cap = assertCapability({ safeMode: false, allowDestructiveActions: true }, 'spawn');
if (!__cap.allowed) {
  console.error(`check-command-budgets: ${__cap.reason}`);
  exit(2);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync('node', [TOKEN_BUDGET_SCRIPT, file, String(MAX_WORDS)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) failed++;
}

if (failed > 0) {
  console.error(`FAIL: ${failed} command file(s) over the ${MAX_WORDS}-word budget.`);
  exit(1);
}
exit(0);
