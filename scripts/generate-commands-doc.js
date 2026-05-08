#!/usr/bin/env node
// scripts/generate-commands-doc.js
//
// Plan 08-05 Task 1 — auto-generate `docs/COMMANDS.md` from
// `.testatlas/commands/*.md`.
//
// For each command file (excluding README.md):
//   - parse YAML front-matter → `command`, `description`, `capabilities`.
//   - emit a section:
//
//       ## /atlas:<command>
//
//       <first sentence of description>
//
//       **Capabilities:** `cap1`, `cap2`
//
//       [Source](.testatlas/commands/<file>.md)
//
//       ---
//
// Sorted lexically (deterministic via `sortedReaddir`).
//
// Flags:
//   --stdout   Print generated text to stdout instead of writing the file.
//   --check    Regenerate to memory; exit 1 if it differs from the on-disk
//              `docs/COMMANDS.md` (drift gate).
//
// Default: write to `docs/COMMANDS.md`.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandBaseNameFromSource } from './lib/adapters/_shared.js';
import { sortedReaddir } from './lib/determinism.js';
import { V2_COMMAND_CATEGORIES } from './lib/list-command-files.js';
import { parseFrontmatter } from './lib/parse-frontmatter.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const COMMANDS_DIR = path.join(REPO_ROOT, '.testatlas', 'commands');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'COMMANDS.md');

/**
 * Extract the first sentence from a string, ending at the first `.`, `?`,
 * `!`, or end-of-string. Trims trailing whitespace. Always returns a single
 * line (newlines collapsed to spaces).
 *
 * @param {string} s
 * @returns {string}
 */
function firstSentence(s) {
  if (!s) return '';
  const collapsed = s.replace(/\s+/g, ' ').trim();
  const m = collapsed.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : collapsed).trim();
}

function formatCapabilities(caps) {
  if (!Array.isArray(caps) || caps.length === 0) return '_(none)_';
  return caps.map((c) => `\`${c}\``).join(', ');
}

/**
 * Render a single command entry. Returns the lines to push into the
 * document. Used for both flat V1 commands and V2 categorized commands.
 *
 * @param {string} relPath  Path relative to `.testatlas/commands/` (e.g.
 *                          `init.md` or `report/report-dashboard-data.md`).
 * @returns {Promise<string[]>}
 */
async function renderEntry(relPath) {
  const abs = path.join(COMMANDS_DIR, relPath);
  const text = await readFile(abs, 'utf8');
  let fm;
  try {
    fm = parseFrontmatter(text);
  } catch (err) {
    throw new Error(`generate-commands-doc: ${relPath}: ${err.message}`);
  }
  // Use the Phase 16 rendered slot name so the doc matches what the operator
  // actually types in installed adapters. `fm.command` carries the source
  // basename (e.g. `brain-validate`) but the installer emits
  // `atlas-core-brain-validate` for V2 categorized commands —
  // `commandBaseNameFromSource` accounts for the category-prefix rule.
  const cmdName = commandBaseNameFromSource(abs);
  const desc = firstSentence(fm.description || '');
  const caps = formatCapabilities(fm.capabilities);
  const out = [];
  out.push(`## /atlas:${cmdName}`);
  out.push('');
  if (desc) {
    out.push(desc);
    out.push('');
  }
  out.push(`**Capabilities:** ${caps}`);
  out.push('');
  out.push(`[Source](../.testatlas/commands/${relPath})`);
  out.push('');
  out.push('---');
  out.push('');
  return out;
}

async function buildDoc() {
  // V1 flat commands.
  const flatEntries = await sortedReaddir(COMMANDS_DIR);
  const flatFiles = flatEntries
    .filter((n) => typeof n === 'string' && n.endsWith('.md') && n !== 'README.md')
    .sort();

  // V2 categorized commands. Each subdirectory in V2_COMMAND_CATEGORIES is
  // walked; missing subdirs degrade to zero entries (Wave 5 contract).
  const categorizedFiles = [];
  for (const cat of V2_COMMAND_CATEGORIES) {
    const subDir = path.join(COMMANDS_DIR, cat);
    let entries;
    try {
      entries = await sortedReaddir(subDir);
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    for (const name of entries) {
      if (typeof name !== 'string') continue;
      if (!name.endsWith('.md')) continue;
      categorizedFiles.push(`${cat}/${name}`);
    }
  }
  categorizedFiles.sort();

  const total = flatFiles.length + categorizedFiles.length;

  const lines = [];
  lines.push('# TestAtlas Commands');
  lines.push('');
  lines.push(
    '_Auto-generated from `.testatlas/commands/*.md` (V1 flat + V2 categorized) by `scripts/generate-commands-doc.js`. Do not edit by hand._',
  );
  lines.push('');
  lines.push(
    `This index covers every \`/atlas:*\` command shipped with TestAtlas (${total} commands: ${flatFiles.length} V1 flat + ${categorizedFiles.length} V2 categorized in core/, explore/, test/, council/, brain/, report/, maintain/). Click the source link under each entry for the full instruction file (rules, lifecycle, stop conditions).`,
  );
  lines.push('');
  lines.push(
    'See [docs/SCHEMAS.md](./SCHEMAS.md) for the JSON Schemas these commands consume and produce.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  if (flatFiles.length > 0) {
    lines.push('## V1 Commands (flat)');
    lines.push('');
    for (const file of flatFiles) {
      lines.push(...(await renderEntry(file)));
    }
  }

  if (categorizedFiles.length > 0) {
    lines.push('## V2 Commands (categorized)');
    lines.push('');
    for (const relPath of categorizedFiles) {
      lines.push(...(await renderEntry(relPath)));
    }
  }

  // Always end with a single trailing newline (POSIX file convention) — no
  // trailing blank line beyond that. The lines array currently ends with `''`,
  // which when joined with `\n` yields the desired single trailing newline.
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const out = await buildDoc();
  if (argv.includes('--stdout')) {
    // Await stdout drain before returning. `process.stdout.write(blob)`
    // followed immediately by `process.exit()` can drop bytes when stdout
    // is a pipe (spawn from a parent test runner) because the kernel pipe
    // buffer hasn't flushed yet — observed as truncated macOS CI output.
    await new Promise((resolve) => process.stdout.write(out, () => resolve()));
    return 0;
  }
  if (argv.includes('--check')) {
    let onDisk;
    try {
      onDisk = await readFile(OUT_PATH, 'utf8');
    } catch {
      onDisk = '';
    }
    if (onDisk !== out) {
      console.error(
        'docs/COMMANDS.md is stale. Run `node scripts/generate-commands-doc.js` to regenerate.',
      );
      return 1;
    }
    console.log('docs/COMMANDS.md: up to date');
    return 0;
  }
  await writeFile(OUT_PATH, out, 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
  return 0;
}

const code = await main();
process.exit(code);
