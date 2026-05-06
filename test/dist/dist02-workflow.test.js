// test/dist/dist02-workflow.test.js
//
// Plan 07-05 Task 1 — DIST-02 release-pipeline workflow validity tests.
//
// Verifies `.github/workflows/release.yml` is structurally correct for npm
// Trusted Publishing (OIDC) + provenance + post-publish install.sh sync +
// GitHub Release with sigstore bundle. Uses regex-grammar inspection rather
// than a YAML parser dependency (consistent with test/ci-yaml.test.js
// rationale: GitHub Actions itself catches syntax errors at run time).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const RELEASE_YML = path.join(
  import.meta.dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'release.yml',
);

test('release.yml: file exists and is non-empty', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.ok(buf.length > 200, 'release.yml is empty or too small');
});

test('release.yml: declares id-token: write permission (OIDC)', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /id-token:\s*write/, 'missing id-token: write permission');
});

test('release.yml: declares contents: write permission (sed-and-commit)', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /contents:\s*write/, 'missing contents: write permission');
});

test('release.yml: sets NPM_CONFIG_PROVENANCE: "true"', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /NPM_CONFIG_PROVENANCE:\s*"true"/, 'missing NPM_CONFIG_PROVENANCE');
});

test('release.yml: declares workflow_dispatch with dry-run input', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /workflow_dispatch:/, 'missing workflow_dispatch trigger');
  assert.match(buf, /dry-run:/, 'missing dry-run input');
});

test('release.yml: declares release:published trigger', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /release:/, 'missing release trigger');
  assert.match(buf, /-\s*published/, 'missing release:published type');
});

test('release.yml: has dry-run path that runs npm pack --dry-run', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /npm pack --dry-run/, 'missing npm pack --dry-run step');
});

test('release.yml: has dry-run path that runs npm publish --dry-run', async () => {
  // Quick 260506-npm: replaced `pnpm changeset publish --dry-run` with direct
  // `npm publish --dry-run` per npm support guidance (changesets/pnpm wrappers
  // bypass npm's OIDC token-exchange flow — root cause of v1.1.0–v1.2.0 E404).
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /npm publish --dry-run/, 'missing npm publish --dry-run step');
});

test('release.yml: contains a Sync install.sh step (post-publish sed)', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /Sync install\.sh/, 'missing "Sync install.sh" step name');
  assert.match(buf, /sed -i.*VERSION=/, 'missing sed for VERSION=');
  assert.match(buf, /TARBALL_SHA256=/, 'missing TARBALL_SHA256= sed target');
});

test('release.yml: contains a softprops/action-gh-release step (GH Release create)', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /softprops\/action-gh-release/, 'missing softprops/action-gh-release usage');
});

test('release.yml: GitHub Release attaches tarball + sha256 + sigstore.json', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /testatlas-\*\.tgz/, 'missing tarball asset glob');
  assert.match(buf, /testatlas-\*\.tgz\.sha256/, 'missing sha256 sidecar asset glob');
  assert.match(
    buf,
    /testatlas-\*\.tgz\.sigstore\.json/,
    'missing sigstore.json sidecar asset glob',
  );
});

test('release.yml: direct npm publish path with required OIDC pre-conditions', async () => {
  // Quick 260506-npm: replaced changesets/action wrapper with direct `npm
  // publish` per npm support guidance. Trusted Publishing OIDC requires:
  //   1. npm CLI ≥ 11 (Node 22 ships ~10.x — must `npm i -g npm@11`)
  //   2. .npmrc auth-token lines stripped (presence forces token-auth path)
  //   3. NO NPM_TOKEN/NODE_AUTH_TOKEN in publish step env
  //   4. Direct `npm publish` (not via lerna/pnpm -r/changesets wrappers)
  // Each pre-condition has a dedicated step we assert here.
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(buf, /npm install -g --force npm@11/, 'missing npm@11 pin step');
  assert.match(
    buf,
    /Delete any auto-written \.npmrc files/,
    'missing .npmrc deletion step (defense-in-depth alongside dropping setup-node registry-url)',
  );
  // Per npm support: setup-node's `registry-url` auto-writes .npmrc + sets
  // NODE_AUTH_TOKEN env. Both bypass OIDC. The fix is to drop registry-url.
  assert.doesNotMatch(
    buf,
    /^\s*registry-url:\s*https:\/\/registry\.npmjs\.org\s*$/m,
    'setup-node registry-url must be omitted (forces token-auth path, bypasses OIDC)',
  );
  assert.match(
    buf,
    /npm publish --access public --provenance --loglevel verbose/,
    'missing direct `npm publish` invocation with verbose OIDC logging',
  );
  // Negative assertion: changesets/action MUST NOT be present anymore.
  assert.doesNotMatch(
    buf,
    /uses:\s*changesets\/action@/,
    'changesets/action publish wrapper must be removed (npm support: it bypasses OIDC)',
  );
});

test('release.yml: workflow_dispatch dry-run is gated on dry-run != true for real publish', async () => {
  const buf = await readFile(RELEASE_YML, 'utf8');
  assert.match(
    buf,
    /github\.event\.inputs\.dry-run\s*!=\s*'true'/,
    'missing dry-run gate on real publish steps',
  );
});
