// Phase 10 Plan 02: regression guard — no `.md` artifact under _testatlas/ may
// contain unrendered {{key}} placeholders. Pinned by Plan 10-01 fix to
// scripts/lib/emitter.js (drop-line-on-missing semantics + flattenSubstitutions
// empty-string-as-missing). Plan 10-02 back-fills the 30 broken artifacts
// already on disk using the now-fixed applyTemplate(); this test ensures
// future regressions cannot re-introduce placeholder leaks.
//
// Skip-guard: when `_testatlas/` does not exist (e.g. fresh clone in CI before
// any dogfood explore has run), the test SKIPS rather than fails. The dogfood
// workspace is gitignored in this self-dogfood repo.

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKSPACE = path.join(REPO_ROOT, '_testatlas');
const TO_FIX_DIR = path.join(WORKSPACE, 'to_fix');
const EVIDENCE_DIR = path.join(WORKSPACE, 'evidence');

// Matches `{{key}}` exactly (no surrounding whitespace tolerated). Mirrors the
// canonical placeholder shape used in `.testatlas/templates/{issues,flows,evidence}/*.md`.
const PLACEHOLDER_RE = /\{\{[a-zA-Z_$][\w-]*\}\}/;

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Return the first line in `text` matching `re`, or null. */
function firstMatchingLine(text, re) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return { lineNumber: i + 1, line: lines[i] };
  }
  return null;
}

/** Walk all .md files directly under `dir` (non-recursive). */
async function listIssueMd(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.startsWith('ISSUE-') && e.name.endsWith('.md'))
    .map((e) => path.join(dir, e.name));
}

/** Walk EVIDENCE-<id>/evidence.md under `dir`. */
async function listEvidenceMd(dir) {
  const out = [];
  const subdirs = await readdir(dir, { withFileTypes: true });
  for (const d of subdirs) {
    if (!d.isDirectory() || !d.name.startsWith('EVIDENCE-')) continue;
    const p = path.join(dir, d.name, 'evidence.md');
    if (await exists(p)) out.push(p);
  }
  return out;
}

test('no `{{key}}` placeholders leak into _testatlas/to_fix/ISSUE-*.md', async (t) => {
  if (!(await exists(TO_FIX_DIR))) {
    t.skip('_testatlas/to_fix/ does not exist (fresh clone) — skipping placeholder-leak guard');
    return;
  }
  const files = await listIssueMd(TO_FIX_DIR);
  const offenders = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    const hit = firstMatchingLine(text, PLACEHOLDER_RE);
    if (hit) {
      offenders.push(`${path.relative(REPO_ROOT, f)}:${hit.lineNumber}: ${hit.line.trim()}`);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `${offenders.length} ISSUE-*.md file(s) contain unrendered placeholders:\n  ${offenders.join('\n  ')}`,
  );
});

test('no `{{key}}` placeholders leak into _testatlas/evidence/EVIDENCE-*/evidence.md', async (t) => {
  if (!(await exists(EVIDENCE_DIR))) {
    t.skip('_testatlas/evidence/ does not exist (fresh clone) — skipping placeholder-leak guard');
    return;
  }
  const files = await listEvidenceMd(EVIDENCE_DIR);
  const offenders = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    const hit = firstMatchingLine(text, PLACEHOLDER_RE);
    if (hit) {
      offenders.push(`${path.relative(REPO_ROOT, f)}:${hit.lineNumber}: ${hit.line.trim()}`);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `${offenders.length} evidence.md file(s) contain unrendered placeholders:\n  ${offenders.join('\n  ')}`,
  );
});
