#!/usr/bin/env node
// scripts/check-token-budget.js
// Usage: node scripts/check-token-budget.js <file> <maxWords>
//
// Exits 0 if the file's word count is ≤ maxWords.
// Exits 1 with a FAIL message on stderr if over budget.
// Exits 2 with usage info on argv errors.
//
// Algorithm: whitespace-split via `countWords` from scripts/lib/word-count.js.
// Counts code blocks, tables, and HTML comments — that is intentional (see
// .planning/phases/01-bootstrap-constitution-config-layer/01-RESEARCH.md
// §"Anti-Patterns to Avoid": stripping creates a backdoor for hiding rules).

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { countWords } from './lib/word-count.js';

const [, , file, maxArg] = argv;
if (!file || !maxArg) {
  console.error('usage: check-token-budget.js <file> <maxWords>');
  exit(2);
}

const max = Number(maxArg);
if (!Number.isFinite(max) || max <= 0) {
  console.error(`invalid maxWords: ${maxArg}`);
  exit(2);
}

const text = await readFile(file, 'utf8');
const words = countWords(text);

if (words > max) {
  console.error(
    `FAIL: ${file} has ${words} words, exceeding the ${max}-word budget by ${words - max}.`,
  );
  console.error(
    'Move long-form rationale to .testatlas/reference/ and keep the file under budget.',
  );
  exit(1);
}

console.log(`OK: ${file} has ${words} words (budget: ${max}).`);
