// Wave 0 — Bucket #5 (every command file has "## What's Next" with 1-4
// /atlas:* link entries) + Bucket #6 (cross-cutting docs have tail nav).
//
// SF-2: apostrophe regexes accept both ASCII (U+0027 ') and Unicode right
// single quotation mark (U+2019, ’) via the `['’]` character class — some
// markdown tooling silently retypographs `What's` → `What’s`.
//
// Buckets these tests cover (red-bar contract for Plan 09-04):
//   #5 every .testatlas/commands/*.md has `## What's Next` + 1-4 entries
//   #6 README + GETTING_STARTED + INSTALL + UPDATE have tail navigation

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// "What's Next" H2 — accepts ASCII apostrophe AND U+2019.
const WHATS_NEXT_H2 = /^##\s+What['’]s Next\s*$/m;

// Tail navigation for cross-cutting docs — accepts multiple canonical headings.
const TAIL_NAV_HEADING = /^##\s+(What['’]s Next|Next Steps|Where to go next|See also)\s*$/im;

// 1-4 bullet entries, each a bold `/atlas:foo` link followed by em-dash or
// hyphen rationale. Allows wrapped lines so the rationale may continue.
// Pattern: `- **/atlas:foo** — rationale` (with optional backticks around
// the slash command). Each entry occupies 1+ source line.
const WHATS_NEXT_ENTRY = /^[-*]\s+\*\*`?\/atlas:[a-z][a-z0-9-]+`?\*\*\s+[—-]\s+.+$/m;

const CROSS_CUTTING_DOCS = [
  'README.md',
  'docs/GETTING_STARTED.md',
  'docs/INSTALL.md',
  'docs/UPDATE.md',
];

test('every .testatlas/commands/*.md file has a "## What\'s Next" H2 section', async () => {
  const files = await listCommandFiles({ cwd: REPO_ROOT });
  assert.ok(files.length > 0, 'expected listCommandFiles to return >0 results');
  const missing = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (!WHATS_NEXT_H2.test(text)) {
      missing.push(path.relative(REPO_ROOT, file));
    }
  }
  assert.equal(
    missing.length,
    0,
    `Files missing "## What's Next" H2 (need ['’] apostrophe match): ${missing.join(', ')}`,
  );
});

test('every "## What\'s Next" section has 1-4 entries with /atlas: links', async () => {
  const files = await listCommandFiles({ cwd: REPO_ROOT });
  const violations = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const match = text.match(WHATS_NEXT_H2);
    if (!match) {
      // Already reported by the H2 existence test above; skip here so we
      // don't double-fail. The structure test only applies when the H2 exists.
      continue;
    }
    const sectionStart = text.indexOf(match[0]);
    const after = text.slice(sectionStart + match[0].length);
    const nextH2 = after.search(/^##\s+/m);
    const section = nextH2 === -1 ? after : after.slice(0, nextH2);
    // Count bullet entries that point to /atlas: commands.
    const entries =
      section.match(/^[-*]\s+\*\*`?\/atlas:[a-z][a-z0-9-]+`?\*\*\s+[—-]\s+.+$/gm) || [];
    if (entries.length < 1 || entries.length > 4) {
      violations.push(
        `${path.relative(REPO_ROOT, file)}: found ${entries.length} entries (must be 1-4)`,
      );
    }
    // The first entry must match the canonical pattern (ensures shape, not just count).
    if (entries.length > 0 && !WHATS_NEXT_ENTRY.test(section)) {
      violations.push(
        `${path.relative(REPO_ROOT, file)}: entries do not match the canonical "- **/atlas:foo** — rationale" pattern`,
      );
    }
  }
  assert.equal(
    violations.length,
    0,
    `What's Next section structure violations: \n  ${violations.join('\n  ')}`,
  );
});

test('cross-cutting docs (README + GETTING_STARTED + INSTALL + UPDATE) have tail navigation', async () => {
  const violations = [];
  for (const rel of CROSS_CUTTING_DOCS) {
    const file = path.join(REPO_ROOT, rel);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      violations.push(`${rel}: file does not exist (${err.code})`);
      continue;
    }
    const navMatch = text.match(TAIL_NAV_HEADING);
    if (!navMatch) {
      violations.push(`${rel}: no tail-navigation heading found`);
      continue;
    }
    // Must be in the last 25% of the file (near the end).
    const idx = text.indexOf(navMatch[0]);
    const tailThreshold = Math.floor(text.length * 0.75);
    if (idx < tailThreshold) {
      violations.push(
        `${rel}: tail-navigation heading "${navMatch[0].trim()}" is at ${idx}/${text.length} ` +
          `(needs to appear in the last 25% of the file, after byte ${tailThreshold})`,
      );
    }
  }
  assert.equal(
    violations.length,
    0,
    `Cross-cutting tail-navigation violations: \n  ${violations.join('\n  ')}`,
  );
});
