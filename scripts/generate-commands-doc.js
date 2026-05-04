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
import { sortedReaddir } from './lib/determinism.js';
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

async function buildDoc() {
  const entries = await sortedReaddir(COMMANDS_DIR);
  const files = entries
    .filter((n) => typeof n === 'string' && n.endsWith('.md') && n !== 'README.md')
    .sort();

  const lines = [];
  lines.push('# TestAtlas Commands');
  lines.push('');
  lines.push(
    '_Auto-generated from `.testatlas/commands/*.md` by `scripts/generate-commands-doc.js`. Do not edit by hand._',
  );
  lines.push('');
  lines.push(
    `This index covers every \`/atlas:*\` command shipped with TestAtlas (${files.length} commands). Click the source link under each entry for the full instruction file (rules, lifecycle, stop conditions).`,
  );
  lines.push('');
  lines.push(
    'See [docs/SCHEMAS.md](./SCHEMAS.md) for the JSON Schemas these commands consume and produce.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const file of files) {
    const abs = path.join(COMMANDS_DIR, file);
    const text = await readFile(abs, 'utf8');
    let fm;
    try {
      fm = parseFrontmatter(text);
    } catch (err) {
      throw new Error(`generate-commands-doc: ${file}: ${err.message}`);
    }
    const cmdName = fm.command || file.replace(/\.md$/, '');
    const desc = firstSentence(fm.description || '');
    const caps = formatCapabilities(fm.capabilities);

    lines.push(`## /atlas:${cmdName}`);
    lines.push('');
    if (desc) {
      lines.push(desc);
      lines.push('');
    }
    lines.push(`**Capabilities:** ${caps}`);
    lines.push('');
    lines.push(`[Source](../.testatlas/commands/${file})`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Always end with a single trailing newline (POSIX file convention) — no
  // trailing blank line beyond that. The lines array currently ends with `''`,
  // which when joined with `\n` yields the desired single trailing newline.
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const out = await buildDoc();
  if (argv.includes('--stdout')) {
    process.stdout.write(out);
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
