// Wave 0 — Bucket #10: stale-doc cleanup.
//
// Asserts that no tracked .md file (excluding .planning/ and CHANGELOG.md
// historical entries) contains "Phase X ships this; until then..." framing.
// These phrases were used during pre-v1.0 development and are obsolete after
// the milestone shipped (Quick 260504-r3q already killed them in
// validate-workspace.md; Plan 09-04 kills the rest).
//
// Whitelist anchor: any line containing `<!-- whats-next:keep -->` is exempt
// (escape hatch for legitimate forward-looking copy).

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const TRACKED_DIRS = ['.testatlas', 'docs', 'examples', 'scripts'];
const TRACKED_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'ADAPTER-OWNERS.md',
  'CLAUDE.md',
  // Note: CHANGELOG.md is NOT included — historical-phase entries are legitimate.
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.changeset', 'coverage', 'tmp']);

const BANNED_PATTERNS = [
  { name: 'Phase N ships this', re: /Phase \d+ ships this/i },
  { name: 'until Phase N ships', re: /until Phase \d+ ships/i },
  { name: 'TBD: Phase N', re: /TBD\s*[:—-]\s*Phase \d+/i },
  { name: '(deferred to v2)', re: /\(deferred to v2\)/i },
  { name: '(coming in Phase N)', re: /\(coming in Phase \d+\)/i },
  { name: 'Phase N not yet (installed|shipped)', re: /Phase \d+ not yet (installed|shipped)/i },
];

const KEEP_MARKER = /<!-- whats-next:keep -->/;

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
      /* ignore */
    }
  }
  for (const dir of TRACKED_DIRS) {
    for await (const f of walkMd(path.join(REPO_ROOT, dir))) {
      out.push(f);
    }
  }
  return out;
}

test('no tracked .md file contains banned stale-framing phrases', async () => {
  const files = await collectMdFiles();
  const violations = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (KEEP_MARKER.test(line)) continue;
      // Also exempt the line immediately before/after a keep marker (to allow
      // multi-line forward-looking blocks to mark themselves once).
      const prev = i > 0 ? lines[i - 1] : '';
      const next = i < lines.length - 1 ? lines[i + 1] : '';
      if (KEEP_MARKER.test(prev) || KEEP_MARKER.test(next)) continue;
      for (const { name, re } of BANNED_PATTERNS) {
        if (re.test(line)) {
          violations.push(
            `${path.relative(REPO_ROOT, file)}:${i + 1} matches "${name}" → ${line.trim().slice(0, 120)}`,
          );
        }
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `Stale-framing phrases found (use <!-- whats-next:keep --> to whitelist legitimate forward-looking copy):\n  ${violations.slice(0, 50).join('\n  ')}` +
      (violations.length > 50 ? `\n  …and ${violations.length - 50} more` : ''),
  );
});
