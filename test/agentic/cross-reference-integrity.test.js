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
  // V2 (Phase 14 Wave 5): commands now live in either `.testatlas/commands/<name>.md`
  // (V1 flat) or `.testatlas/commands/<category>/<name>.md` (V2 categorized).
  // A `/atlas:<name>` reference resolves if a matching `.md` file exists at
  // either layout.
  const { listCategorizedCommandFiles, listCommandFiles } = await import(
    '../../scripts/lib/list-command-files.js'
  );
  const flat = await listCommandFiles({ cwd: REPO_ROOT });
  const categorized = await listCategorizedCommandFiles({ cwd: REPO_ROOT });
  const validNames = new Set([
    ...flat.map((p) => path.basename(p, '.md')),
    ...categorized.map((c) => c.basename),
  ]);

  const files = await collectMdFiles();
  const missing = [];
  // Only count `/atlas:<name>` references where the captured name is a complete
  // command identifier followed by a NON-WORD terminator (end-of-line,
  // punctuation, or markup). Excludes:
  //   - V2 wildcard prose: `/atlas:explore-*` (asterisk; name ends with `-`)
  //   - parameterized invocations: `/atlas:generate scenarios`,
  //     `/atlas:test critical-flows` (space + alphanumeric sub-arg) — these
  //     name a sub-action that's hand-typed at the slash-command prompt, not
  //     a separate command file.
  //   - markdown-formatted refs: `/atlas:foo.md` etc. are normalized via the
  //     terminator class.
  const refRe = /\/atlas:([a-z][a-z0-9-]*[a-z0-9])(?=$|[).,;:`'"!?\]>]|\s(?:$|[^a-z0-9-]))/gm;
  // V2 forward references — commands that V2 templates and registries point at
  // before the command file itself ships. Plans 14-06/07/08 land these. The
  // references are intentional and tracked here as a known allowlist so the
  // integrity gate stays useful (catches typos / stale refs) without blocking
  // legitimate forward-pointing prose. Each entry must be removed from this
  // allowlist when its command source ships.
  const KNOWN_FORWARD_REFS = new Set([
    'create-persona', // referenced in .testatlas/agents/registry.md
    'brain-drift', // referenced in .testatlas/templates/reports/drift.md
  ]);

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(refRe)) {
      const name = m[1];
      if (name.endsWith('-')) continue; // wildcard prose, not a command name
      if (KNOWN_FORWARD_REFS.has(name)) continue; // V2 forward ref — not yet shipped
      if (!validNames.has(name)) {
        missing.push(
          `${path.relative(REPO_ROOT, file)} → /atlas:${name} (no .testatlas/commands/**/${name}.md)`,
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
  // (where 19 of the 20 schemas live); fall back to `.testatlas/<name>.json`
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
