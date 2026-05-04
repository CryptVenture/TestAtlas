// Wave 0 — Buckets #7 + #8 + #9 (cross-reference integrity).
//
//   #7  Every `/atlas:<name>` reference in any tracked .md file resolves to a
//       real `.testatlas/commands/<name>.md` file.
//   #8  Every relative .md link (`./...`, `../...`, `_testatlas/...`,
//       `docs/...`, `.testatlas/...`, `examples/...`) resolves on disk.
//   #9  Every `https://testatlas.dev/schemas/v1/<name>.schema.json` $id URL
//       in any tracked .md or schema file maps to a real
//       `.testatlas/schemas/<name>.schema.json` file.
//
// Walking strategy: recursive readdir over the TRACKED_ROOTS list; skip
// node_modules, .git, .changeset, coverage. The .planning/ tree is NOT
// scanned (planning artifacts are intentionally outside the suite contract).

import { strict as assert } from 'node:assert';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// Tracked surface for cross-reference assertions.
const TRACKED_DIRS = ['.testatlas', 'docs', 'examples', 'scripts'];
const TRACKED_FILES = [
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'ADAPTER-OWNERS.md',
  'CLAUDE.md',
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.changeset', 'coverage', 'tmp']);

async function* walkMd(start) {
  let entries;
  try {
    entries = await readdir(start, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkMd(path.join(start, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield path.join(start, entry.name);
    }
  }
}

async function collectMdFiles() {
  const out = [];
  for (const rel of TRACKED_FILES) {
    const p = path.join(REPO_ROOT, rel);
    try {
      const s = await stat(p);
      if (s.isFile()) out.push(p);
    } catch {
      /* ignore missing tracked file — separate test surface owns existence */
    }
  }
  for (const dir of TRACKED_DIRS) {
    for await (const f of walkMd(path.join(REPO_ROOT, dir))) {
      out.push(f);
    }
  }
  return out;
}

async function collectSchemaFiles() {
  const dir = path.join(REPO_ROOT, '.testatlas', 'schemas');
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries.filter((n) => n.endsWith('.schema.json')).map((n) => path.join(dir, n));
}

test('every /atlas:<name> reference resolves to a real command file', async () => {
  const files = await collectMdFiles();
  const missing = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/\/atlas:([a-z][a-z0-9-]+)/g)) {
      const name = m[1];
      const cmdFile = path.join(REPO_ROOT, '.testatlas', 'commands', `${name}.md`);
      try {
        await access(cmdFile);
      } catch {
        missing.push(
          `${path.relative(REPO_ROOT, file)} → /atlas:${name} (no ${path.relative(REPO_ROOT, cmdFile)})`,
        );
      }
    }
  }
  assert.equal(
    missing.length,
    0,
    `Unresolved /atlas: references: \n  ${missing.slice(0, 50).join('\n  ')}` +
      (missing.length > 50 ? `\n  …and ${missing.length - 50} more` : ''),
  );
});

test('every relative .md link resolves on disk', async () => {
  const files = await collectMdFiles();
  const missing = [];
  // Match markdown links whose target starts with `./`, `../`, `_testatlas/`,
  // `docs/`, `examples/`, `.testatlas/`, or `scripts/`. Strip any `#anchor`.
  const linkRe =
    /\[[^\]]+\]\(((?:\.\.?\/|_testatlas\/|docs\/|examples\/|\.testatlas\/|scripts\/)[^)#\s]+)/g;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const baseDir = path.dirname(file);
    for (const m of text.matchAll(linkRe)) {
      let target = m[1];
      // Strip query strings just in case.
      const q = target.indexOf('?');
      if (q !== -1) target = target.slice(0, q);
      // Resolve relative-to-file vs relative-to-repo-root.
      const resolved =
        target.startsWith('./') || target.startsWith('../')
          ? path.resolve(baseDir, target)
          : path.resolve(REPO_ROOT, target);
      try {
        await access(resolved);
      } catch {
        missing.push(`${path.relative(REPO_ROOT, file)} → ${target}`);
      }
    }
  }
  assert.equal(
    missing.length,
    0,
    `Unresolved relative links: \n  ${missing.slice(0, 50).join('\n  ')}` +
      (missing.length > 50 ? `\n  …and ${missing.length - 50} more` : ''),
  );
});

test('every schema $id URL maps to a real schema file', async () => {
  const mdFiles = await collectMdFiles();
  const schemaFiles = await collectSchemaFiles();
  const all = [...mdFiles, ...schemaFiles];
  const missing = [];
  const idRe = /https:\/\/testatlas\.dev\/schemas\/v1\/([a-z][a-z0-9-]*)\.schema\.json/g;
  // Resolution order: prefer the conventional `.testatlas/schemas/<name>.schema.json`
  // (where 18 of the 19 schemas live); fall back to `.testatlas/<name>.json`
  // for the lone vocabulary file which is intentionally root-anchored because
  // every schema-loader, slug helper, and adapter render-pass treats
  // `.testatlas/vocabulary.json` as canonical (see scripts/lib/schema-loader.js
  // VOCABULARY_PATH and the 100+ tracked references). Both forms count as
  // "the file exists on disk" for cross-reference integrity.
  for (const file of all) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(idRe)) {
      const name = m[1];
      const primary = path.join(REPO_ROOT, '.testatlas', 'schemas', `${name}.schema.json`);
      const fallback = path.join(REPO_ROOT, '.testatlas', `${name}.json`);
      let resolved = false;
      try {
        await access(primary);
        resolved = true;
      } catch {
        try {
          await access(fallback);
          resolved = true;
        } catch {
          /* still missing */
        }
      }
      if (!resolved) {
        missing.push(`${path.relative(REPO_ROOT, file)} → schemas/v1/${name}.schema.json`);
      }
    }
  }
  // Dedupe.
  const unique = [...new Set(missing)];
  assert.equal(
    unique.length,
    0,
    `Unresolved schema $id URLs: \n  ${unique.slice(0, 50).join('\n  ')}` +
      (unique.length > 50 ? `\n  …and ${unique.length - 50} more` : ''),
  );
});
