// Phase 11 Plan 01 / ISSUE-011 G-07 carve-out: enforce that the
// release.yml sigstore-bundle fetch is fail-closed AND that a post-publish
// assertion verifies the sidecar made it to the published GitHub Release.
//
// Background: the prior release.yml fetched the sigstore bundle with
// `continue-on-error: true`, so a transient registry hiccup would publish
// the .tgz to npm, push the GH Release with sha256 attached, and SILENTLY
// omit the .sigstore.json sidecar. Consumers running
// `testatlas init --verify-signature` would then hit a 404 fetching the
// sidecar — every install for that release would break, with no signal
// in CI. Fail-closed + post-publish assertion eliminates that failure mode.
//
// Three assertions:
//
//   1. release.yml MUST NOT have `continue-on-error: true` on any line
//      whose nearest preceding `- name:` (within 5 lines) mentions
//      `sigstore` or `attestation` (case-insensitive).
//   2. release.yml MUST contain a step named exactly
//      `Verify sigstore bundle published`.
//   3. That same step MUST be gated on
//      `github.event_name == 'release'` AND
//      `github.event.action == 'published'`.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const RELEASE_YML = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');

test('release.yml — no continue-on-error on sigstore/attestation steps', async () => {
  const text = await readFile(RELEASE_YML, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/continue-on-error:\s*true/i.test(lines[i])) continue;
    // Look back up to 5 lines for the step name.
    const window = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
    const isSigstore = /(?:- name:.*(?:sigstore|attestation))/i.test(window);
    assert.ok(
      !isSigstore,
      `release.yml:${i + 1} — sigstore/attestation step has continue-on-error: true (must be fail-closed)`,
    );
  }
});

test('release.yml — has post-publish "Verify sigstore bundle published" step', async () => {
  const text = await readFile(RELEASE_YML, 'utf8');
  assert.match(
    text,
    /- name:\s*Verify sigstore bundle published/,
    'release.yml missing required step "Verify sigstore bundle published"',
  );
});

test('release.yml — verify-sigstore step gated on release: published', async () => {
  const text = await readFile(RELEASE_YML, 'utf8');
  const idx = text.indexOf('- name: Verify sigstore bundle published');
  assert.ok(idx >= 0, 'verify-sigstore step not found');
  const block = text.slice(idx, idx + 600);
  assert.match(
    block,
    /github\.event_name\s*==\s*'release'/,
    "verify-sigstore step missing `event_name == 'release'` condition",
  );
  assert.match(
    block,
    /github\.event\.action\s*==\s*'published'/,
    "verify-sigstore step missing `action == 'published'` condition",
  );
});
