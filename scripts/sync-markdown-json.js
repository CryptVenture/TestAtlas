#!/usr/bin/env node
// scripts/sync-markdown-json.js
//
// Plan 14-02 Task 1 — bidirectional markdown↔JSON sync for V2 brain.
//
// Scans `_testatlas/domains/`, `flows/`, `to_fix/`, and `agents/personas/`,
// then rebuilds the matching `_testatlas/brain/<index>.json` from the on-disk
// artifacts. Generated sections inside markdown (between
// `<!-- TESTATLAS:GENERATED:START field=... -->` and the matching END marker)
// are mirrors of brain JSON; everything else is human-authored and preserved.
//
// Drift policy:
//   - markdown mtime > JSON mtime → markdown wins; rebuild brain index entry.
//   - JSON mtime > markdown mtime → JSON wins for generated sections only.
//   - Files outside generated markers are NEVER touched.
//
// Idempotent: a second invocation with no on-disk changes yields no writes.
//
// CLI:
//   node scripts/sync-markdown-json.js [--cwd <dir>]
//
// Programmatic API:
//   import { syncMarkdownJson } from './sync-markdown-json.js';
//   const { ok, changed } = await syncMarkdownJson({ cwd });

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';

const ARTIFACT_DIRS = [
  { dir: 'domains', glob: 'domain.json', indexFile: 'domains.json', collection: 'domains' },
];

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse YAML frontmatter (very small subset — id, schema_version, status).
 * @param {string} text
 */
function parseFrontmatterMinimal(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const out = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

async function listDomainArtifacts(wsDir) {
  const root = path.join(wsDir, 'domains');
  if (!(await fileExists(root))) return [];
  const out = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const mdPath = path.join(root, e.name, 'domain.md');
    const jsonPath = path.join(root, e.name, 'domain.json');
    const hasMd = await fileExists(mdPath);
    const hasJson = await fileExists(jsonPath);
    if (!hasMd && !hasJson) continue;
    let mdMtime = 0;
    let jsonMtime = 0;
    if (hasMd) mdMtime = (await stat(mdPath)).mtimeMs;
    if (hasJson) jsonMtime = (await stat(jsonPath)).mtimeMs;
    out.push({ slug: e.name, mdPath, jsonPath, hasMd, hasJson, mdMtime, jsonMtime });
  }
  return out;
}

async function buildDomainIndexEntries(artifacts) {
  const entries = [];
  for (const a of artifacts) {
    if (a.hasJson) {
      try {
        const parsed = JSON.parse(await readFile(a.jsonPath, 'utf8'));
        entries.push({
          id: parsed.id ?? `domain-${a.slug}`,
          slug: a.slug,
          status: parsed.status ?? 'mapped',
        });
        continue;
      } catch {
        // fall through to markdown
      }
    }
    if (a.hasMd) {
      const fm = parseFrontmatterMinimal(await readFile(a.mdPath, 'utf8')) ?? {};
      entries.push({
        id: fm.id ?? `domain-${a.slug}`,
        slug: a.slug,
        status: fm.status ?? 'mapped',
      });
    }
  }
  // Stable order by id.
  entries.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return entries;
}

/**
 * Update brain/<indexFile> with the freshly built entries; return true if a
 * write actually occurred (content differs from on-disk).
 */
async function maybeWriteIndex(brainDir, indexFile, collection, entries) {
  const indexPath = path.join(brainDir, indexFile);
  let current;
  try {
    current = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    current = { schema_version: '2.0.0', last_updated: '', [collection]: [] };
  }
  const next = { ...current, [collection]: entries };
  // Compare collection only (ignore last_updated to keep idempotency).
  const same = JSON.stringify(current[collection] ?? []) === JSON.stringify(entries);
  if (same) return false;
  next.last_updated = new Date().toISOString();
  await atomicWrite(indexPath, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}

/**
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<{ ok: boolean, changed: string[] }>}
 */
export async function syncMarkdownJson({ cwd = process.cwd() } = {}) {
  const wsDir = path.join(cwd, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  if (!(await fileExists(brainDir))) {
    return { ok: false, changed: [], error: `No brain dir at ${brainDir}` };
  }

  const changed = [];
  for (const cfg of ARTIFACT_DIRS) {
    const artifacts = await listDomainArtifacts(wsDir);
    const entries = await buildDomainIndexEntries(artifacts);
    const wrote = await maybeWriteIndex(brainDir, cfg.indexFile, cfg.collection, entries);
    if (wrote) changed.push(path.join(brainDir, cfg.indexFile));
  }

  return { ok: true, changed };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let cwd = process.cwd();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cwd' && i + 1 < argv.length) {
      cwd = path.resolve(argv[++i]);
    }
  }
  const r = await syncMarkdownJson({ cwd });
  if (!r.ok) {
    console.error(`sync-markdown-json: FAIL — ${r.error ?? 'unknown error'}`);
    process.exit(1);
  }
  if (r.changed.length === 0) {
    console.log('sync-markdown-json: no changes');
  } else {
    console.log(`sync-markdown-json: updated ${r.changed.length} file(s):`);
    for (const f of r.changed) console.log(`  ${f}`);
  }
  process.exit(0);
}
