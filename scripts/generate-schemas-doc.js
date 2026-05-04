#!/usr/bin/env node
// scripts/generate-schemas-doc.js
//
// Plan 08-05 Task 1 — auto-generate `docs/SCHEMAS.md` from
// `.testatlas/schemas/*.schema.json`.
//
// For each schema file:
//   - parse JSON.
//   - emit a section:
//
//       ## <title>
//
//       <description>
//
//       **$id:** `<id>`
//
//       **Top-level properties:** `prop1`, `prop2`, …
//
//       [Source](.testatlas/schemas/<file>)
//
// Sorted lexically (deterministic).
//
// Flags:
//   --stdout   Print to stdout instead of writing the file.
//   --check    Drift detection — exit 1 if generated text differs from disk.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortedReaddir } from './lib/determinism.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.testatlas', 'schemas');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'SCHEMAS.md');

function formatProps(props) {
  if (!props || typeof props !== 'object') return '_(none)_';
  const keys = Object.keys(props).filter((k) => k !== '$schema');
  if (keys.length === 0) return '_(none)_';
  return keys.map((k) => `\`${k}\``).join(', ');
}

async function buildDoc() {
  const entries = await sortedReaddir(SCHEMAS_DIR);
  const files = entries.filter((n) => typeof n === 'string' && n.endsWith('.schema.json')).sort();

  const lines = [];
  lines.push('# TestAtlas JSON Schemas');
  lines.push('');
  lines.push(
    '_Auto-generated from `.testatlas/schemas/*.schema.json` by `scripts/generate-schemas-doc.js`. Do not edit by hand._',
  );
  lines.push('');
  lines.push(
    `Every machine-readable artifact in TestAtlas is governed by a JSON Schema (Draft 2020-12). \`validate-workspace\` enforces these schemas across the \`_testatlas/\` workspace tree. This index covers all ${files.length} schemas shipped with v1.`,
  );
  lines.push('');
  lines.push(
    'See [docs/COMMANDS.md](./COMMANDS.md) for the commands that consume and produce these schemas.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const file of files) {
    const abs = path.join(SCHEMAS_DIR, file);
    const text = await readFile(abs, 'utf8');
    let schema;
    try {
      schema = JSON.parse(text);
    } catch (err) {
      throw new Error(`generate-schemas-doc: ${file}: ${err.message}`);
    }
    const title = schema.title || file.replace(/\.schema\.json$/, '');
    const desc = (schema.description || '').replace(/\s+/g, ' ').trim();
    const id = schema.$id || '_(no $id)_';
    const props = formatProps(schema.properties);

    lines.push(`## ${title}`);
    lines.push('');
    if (desc) {
      lines.push(desc);
      lines.push('');
    }
    lines.push(`**\`$id\`:** \`${id}\``);
    lines.push('');
    lines.push(`**Top-level properties:** ${props}`);
    lines.push('');
    lines.push(`[Source](../.testatlas/schemas/${file})`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

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
        'docs/SCHEMAS.md is stale. Run `node scripts/generate-schemas-doc.js` to regenerate.',
      );
      return 1;
    }
    console.log('docs/SCHEMAS.md: up to date');
    return 0;
  }
  await writeFile(OUT_PATH, out, 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
  return 0;
}

const code = await main();
process.exit(code);
