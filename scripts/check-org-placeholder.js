#!/usr/bin/env node
// scripts/check-org-placeholder.js
//
// Plan 08-05 Task 1 — pre-flight check that the literal `<org>` placeholder
// is fully purged from active code before the v1.0.0 cut.
//
// Walks the repo (excluding heavy/runtime/planning dirs), greps file contents
// for the literal string `<org>`, and exits non-zero if any are found. Output
// is sorted (file,line) for stable CI logs.
//
// Excluded directories: node_modules, .git, .planning, dist, build, coverage,
// .next, .expo, .tmp-* (test scratch), .testatlas.bak.*

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.planning',
  'dist',
  'build',
  'coverage',
  '.next',
  '.expo',
]);

const EXCLUDED_DIR_PREFIXES = ['.testatlas.bak.'];

const PLACEHOLDER = '<org>';
const NUL = 0;
const BIN_PROBE_BYTES = 1024;

function isExcludedDir(name) {
  if (EXCLUDED_DIRS.has(name)) return true;
  for (const prefix of EXCLUDED_DIR_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

async function isBinary(filePath) {
  try {
    const fd = await readFile(filePath);
    const len = Math.min(fd.length, BIN_PROBE_BYTES);
    for (let i = 0; i < len; i++) {
      if (fd[i] === NUL) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  // Sort entries lexically for deterministic output.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (isExcludedDir(e.name)) continue;
      yield* walk(abs);
    } else if (e.isFile()) {
      yield abs;
    }
  }
}

async function main() {
  const findings = [];
  for await (const file of walk(REPO_ROOT)) {
    // Skip the checker itself + its test (they intentionally mention the
    // placeholder string).
    const rel = path.relative(REPO_ROOT, file);
    if (
      rel === path.join('scripts', 'check-org-placeholder.js') ||
      rel === path.join('test', 'release', 'org-placeholder.test.js')
    ) {
      continue;
    }
    if (await isBinary(file)) continue;
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes(PLACEHOLDER)) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(PLACEHOLDER)) {
        findings.push({ file: rel, line: i + 1, content: lines[i].trim() });
      }
    }
  }
  if (findings.length === 0) {
    console.log('check-org-placeholder: OK (no <org> placeholders in active code)');
    return 0;
  }
  console.error(`check-org-placeholder: FOUND ${findings.length} <org> placeholder(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}: ${f.content}`);
  }
  console.error('\nReplace <org> with the canonical GitHub org/owner before publishing v1.0.0.');
  return 1;
}

const code = await main();
process.exit(code);

export { main };
