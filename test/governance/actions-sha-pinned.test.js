// Phase 11 Plan 01 / ISSUE-010 G-09 carve-out: enforce SHA-pinning on every
// external GitHub Actions reference.
//
// Tag pins (e.g. `actions/checkout@v4`) are mutable: if a maintainer (or an
// attacker who breaches one) re-points the tag, every workflow run on every
// repo using that tag silently picks up the new code. Pinning to a 40-char
// commit SHA closes that vector — a SHA is content-addressed and immutable.
//
// Two assertions:
//
//   1. Every `uses:` line in `.github/workflows/*.yml` that references an
//      external action (NOT a local action of the form `./<dir>`) MUST have
//      a 40-char lowercase-hex ref after the `@`.
//   2. Each SHA-pinned `uses:` line MUST be followed by a trailing
//      `# vN` comment so a human reviewer can see the human-readable tag at
//      a glance (and Dependabot's `actions` ecosystem can still bump them).
//
// Local actions (`uses: ./path/to/action`) are exempt because they live in
// the same repo and ship under the same review/branch-protection regime.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const WF_DIR = path.join(REPO_ROOT, '.github', 'workflows');
const SHA40 = /^[a-f0-9]{40}$/;
const USES_LINE = /^(\s*)uses:\s*(\S+)(.*)$/;

async function getWorkflows() {
  const files = await readdir(WF_DIR);
  return files.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

test('every external uses: reference is SHA-pinned (40 hex chars)', async () => {
  for (const wf of await getWorkflows()) {
    const text = await readFile(path.join(WF_DIR, wf), 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(USES_LINE);
      if (!m) continue;
      const ref = m[2];
      if (ref.startsWith('./')) continue; // local action exempt
      const at = ref.lastIndexOf('@');
      assert.ok(at > 0, `${wf}:${i + 1} — uses: ${ref} has no @ ref`);
      const refPart = ref.slice(at + 1);
      assert.match(
        refPart,
        SHA40,
        `${wf}:${i + 1} — uses: ${ref} is not SHA-pinned (got "${refPart}", want 40 hex chars)`,
      );
    }
  }
});

test('every SHA-pinned uses: line has a trailing tag comment', async () => {
  for (const wf of await getWorkflows()) {
    const text = await readFile(path.join(WF_DIR, wf), 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(USES_LINE);
      if (!m) continue;
      if (m[2].startsWith('./')) continue;
      const trailing = (m[3] ?? '').trim();
      assert.match(
        trailing,
        /^#\s*v\d/,
        `${wf}:${i + 1} — uses: line missing trailing "# vN" tag comment (got "${trailing}")`,
      );
    }
  }
});
