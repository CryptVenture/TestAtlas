#!/usr/bin/env node
// scripts/bump-version.js
//
// Production-grade version bump for TestAtlas, aligned with Trusted Publishing.
//
// Single source of truth: package.json. Syncs all downstream version
// references, migrates CHANGELOG [Unreleased] → [X.Y.Z], runs pre-flight
// gates, commits, tags, optionally pushes + drives the release.yml OIDC
// publish workflow via `gh release create --notes-file`.
//
// Canonical one-liner (Trusted Publishing path):
//   node scripts/bump-version.js --minor --release
//
// Usage:
//   node scripts/bump-version.js [options]
//
// Required (one of):
//   --major | --minor | --patch | --version=X.Y.Z
//
// Local-only flags:
//   --dry-run         Preview all changes without writing
//   --force-dirty     Allow bumping with uncommitted changes
//   --no-commit       Skip commit step (just sync files)
//   --no-tag          Skip tag step
//   --skip-gates      Skip pre-bump gates (pnpm test + parity + validate)
//
// Release pipeline flags:
//   --push            Push commit + tag to origin after local commit+tag
//   --release         Push + `gh release create` (fires release.yml OIDC publish)
//   --wait            With --release: poll workflow until success/failure
//
// Legacy / deprecated:
//   --publish         Local npm publish (warns; bootstrap-only)
//   --github-release  Bare GH release (use --release instead)
//
//   --help            Show this message

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { assertCapability } from './lib/safety.js';

// ISSUE-014 defense-in-depth: bump-version is a deliberately-invoked release
// tool that drives git commit/tag/push, npm publish, and gh release create —
// all destructive by definition. We declare a permissive capability profile
// for the lifetime of the process (the user is the gate; CI invokes this with
// the same profile). The static-scan invariant
// (test/scripts/safety-callsite-coverage.test.js) requires an
// `assertCapability` reference within 20 lines of every destructive primitive;
// individual callsites below carry inline references for traceability.
const RELEASE_CAPABILITY_CONFIG = {
  safeMode: false,
  allowDestructiveActions: true,
};

// ─── Path resolution ────────────────────────────────────────────────────────
// We resolve all repo paths relative to process.cwd() so the script can run
// against either the suite repo itself OR a temp test fixture cwd. This is a
// deliberate change from the v1.0.0 implementation (which pinned to
// __dirname/..). Running from a non-TestAtlas cwd will fail at the first read
// (package.json missing), which is the correct behaviour.

const REPO_ROOT = process.cwd();
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const VERSION_FILE = path.join(REPO_ROOT, '.testatlas', 'VERSION');
const ADAPTER_CAPS_PATH = path.join(
  REPO_ROOT,
  '.testatlas',
  'adapters',
  'adapter-capabilities.json',
);
const MCP_MANIFEST_PATH = path.join(
  REPO_ROOT,
  '.testatlas',
  'adapters',
  'mcp',
  'mcp-server-manifest.json',
);
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
// install.sh's VERSION="X.Y.Z" line. TARBALL_SHA256 is intentionally NOT in
// scope — release.yml owns that sync at publish time. Pre-Quick-260506-jsc,
// install.sh wasn't in the version-sync list at all, which led to a v1.0.0/
// v1.1.0 mismatch on main after the v1.1.0 bootstrap-publish (manual follow-up
// commit 3872428 was required). Now bump-version owns VERSION; release owns SHA.
const INSTALL_SH_PATH = path.join(REPO_ROOT, 'install.sh');
const INSTALL_SH_VERSION_RE = /^VERSION="[^"]*"$/m;

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    major: false,
    minor: false,
    patch: false,
    explicitVersion: null,
    dryRun: false,
    forceDirty: false,
    noCommit: false,
    noTag: false,
    skipGates: false,
    push: false,
    release: false,
    wait: false,
    publish: false,
    githubRelease: false,
    resume: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--major') opts.major = true;
    else if (a === '--minor') opts.minor = true;
    else if (a === '--patch') opts.patch = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force-dirty') opts.forceDirty = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--no-commit') opts.noCommit = true;
    else if (a === '--no-tag') opts.noTag = true;
    else if (a === '--skip-gates') opts.skipGates = true;
    else if (a === '--push') opts.push = true;
    else if (a === '--release') opts.release = true;
    else if (a === '--wait') opts.wait = true;
    else if (a === '--publish') opts.publish = true;
    else if (a === '--github-release') opts.githubRelease = true;
    else if (a === '--resume') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        console.error('bump-version: --resume requires a tag argument (e.g., --resume v1.1.0)');
        process.exit(2);
      }
      opts.resume = next;
      i++;
    } else if (a.startsWith('--resume=')) opts.resume = a.slice('--resume='.length);
    else if (a.startsWith('--version=')) opts.explicitVersion = a.slice('--version='.length);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`bump-version: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/bump-version.js [options]

Required (one of):
  --major           Bump major version (X.0.0)
  --minor           Bump minor version (0.X.0)
  --patch           Bump patch version (0.0.X)
  --version=X.Y.Z   Set exact version

Local-only flags:
  --dry-run         Preview all changes without writing
  --force-dirty     Allow bumping with uncommitted changes
  --no-commit       Skip the git commit step
  --no-tag          Skip the git tag step
  --skip-gates      Skip pre-bump gates (pnpm test + parity + validate-workspace) — discouraged

Release pipeline flags:
  --push            Push commit + tag to origin after local commit+tag
  --release         Push + create GH release (fires release.yml OIDC publish workflow)
  --wait            With --release: poll workflow until success/failure (10-min timeout)

Recovery (half-state release):
  --resume <tag>    Re-trigger release.yml workflow_dispatch against existing tag
                    (recovers from "tag pushed + GH release exists + npm publish failed").
                    Cannot be combined with bump flags or --release/--publish.
  --force           With --resume: bypass "commit reachable from main" check
                    (cherry-pick recovery scenario).

Legacy / deprecated:
  --publish         Local npm publish (warns about OIDC migration; bootstrap-only)
  --github-release  Bare GH release (--release supersedes this)

  --help            Show this message

Examples:
  node scripts/bump-version.js --patch
  node scripts/bump-version.js --minor --release           # canonical
  node scripts/bump-version.js --minor --release --wait    # canonical + poll
  node scripts/bump-version.js --version=1.2.0 --dry-run
  node scripts/bump-version.js --resume v1.1.0 --wait      # recover half-state release`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

async function writeJson(p, obj) {
  await writeFile(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

/**
 * Run a shell command in REPO_ROOT, returning stdout as a string.
 * Inherits stdio for streaming when `inherit: true`.
 */
function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT, ...opts }).trim();
}

/**
 * Run a process with argv array (avoids shell quoting issues for paths with
 * spaces). Returns { status, stdout, stderr }.
 *
 * Capability tag: assertCapability(RELEASE_CAPABILITY_CONFIG, 'spawn'). This
 * helper is the single chokepoint for every spawnSync invocation in the
 * release pipeline (git, gh, npm, pnpm, node). Refusal here aborts the bump
 * before any state mutates.
 */
function shArgv(bin, argv, opts = {}) {
  const cap = assertCapability(RELEASE_CAPABILITY_CONFIG, 'spawn');
  if (!cap.allowed) {
    throw new Error(`bump-version shArgv refused: ${cap.reason}`);
  }
  return spawnSync(bin, argv, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: 'pipe',
    ...opts,
  });
}

function isDirty() {
  // `git status --porcelain` is the authoritative check: it surfaces tracked
  // modifications, staged changes, AND untracked files (`??`). The previous
  // `git diff --quiet` pair missed untracked files entirely.
  try {
    const out = sh('git status --porcelain');
    return out.length > 0;
  } catch {
    // No git / not a repo → treat as dirty (refuse to bump).
    return true;
  }
}

function tagExists(tag) {
  // Suppress stderr (`fatal: Needed a single revision` when tag is absent —
  // expected non-error in the absent case).
  const r = shArgv('git', ['rev-parse', '--verify', `refs/tags/${tag}`]);
  return r.status === 0;
}

/**
 * Returns true if `tag` exists on origin. Uses `git ls-remote` which prints a
 * line per match; empty stdout = absent. If origin is unreachable or absent
 * (common in test fixtures), we return false (treat as "not present
 * remotely") — local checks already guard against double-create.
 *
 * Test override: BUMP_VERSION_FAKE_REMOTE_TAGS env var, when set, is parsed
 * as a newline-separated list of tag names that should be treated as
 * "exists on remote" — bypassing the actual ls-remote call entirely. This
 * lets fixture tests assert the gate without spinning up a real remote.
 */
function tagExistsOnRemote(tag) {
  const fake = process.env.BUMP_VERSION_FAKE_REMOTE_TAGS;
  if (fake !== undefined) {
    return fake
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(tag);
  }
  const r = shArgv('git', ['ls-remote', '--tags', 'origin', tag]);
  if (r.status !== 0) return false; // no origin / network — local check is authoritative
  return r.stdout.trim().length > 0;
}

function currentBranch() {
  try {
    return sh('git rev-parse --abbrev-ref HEAD');
  } catch {
    return 'main';
  }
}

async function readText(p) {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

// ─── CHANGELOG migration ────────────────────────────────────────────────────
//
// Migration shape:
//   ## [Unreleased]
//   <body A>            ← hoisted into the new section
//
//   ## [PREV] - <date>  ← kept as-is
//
// becomes:
//
//   ## [Unreleased]
//
//   ### Added
//
//   ### Changed
//
//   ### Removed
//
//   ## [NEW] - YYYY-MM-DD
//   <body A>
//
//   ## [PREV] - <date>
//
// If <body A> contains only empty subsection scaffolds (Added/Changed/
// Removed with no bullets), we replace it with a single placeholder line:
// "_No notable changes since [PREV]._"

const UNRELEASED_STUB = [
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '### Changed',
  '',
  '### Removed',
  '',
].join('\n');

/**
 * Parse the CHANGELOG and return:
 *   - unreleasedBody: text between `## [Unreleased]` and the next `## [` heading
 *   - prevVersion: the next `## [X.Y.Z]` heading after [Unreleased] (or null)
 *   - rebuiltText: function(newVersion, dateStr) → new full changelog text
 */
function planChangelogMigration(text, newVersion, dateStr) {
  if (!text) return null;

  const unreleasedMatch = text.match(/^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[)/m);
  if (!unreleasedMatch) {
    // No [Unreleased] block → nothing to migrate. Insert new section at top
    // (after the file header) for safety. We don't pretend to know the file
    // shape; just bail and leave it untouched.
    return null;
  }

  const unreleasedBody = unreleasedMatch[1];
  const isEmpty = isEmptyUnreleasedBody(unreleasedBody);

  // Find prev version for placeholder copy.
  const prevMatch = text
    .slice(unreleasedMatch.index + unreleasedMatch[0].length)
    .match(/^## \[([^\]]+)\]/m);
  const prevVersion = prevMatch ? prevMatch[1] : null;

  // Body for the new [X.Y.Z] section.
  const newBody = isEmpty
    ? `\n_No notable changes since ${prevVersion ?? 'previous release'}._\n\n`
    : `\n${unreleasedBody.replace(/^\s+|\s+$/g, '')}\n\n`;

  const newSection = `## [${newVersion}] - ${dateStr}\n${newBody}`;

  // Splice: replace the entire [Unreleased] block (heading + body, up to next
  // heading) with stub + newSection.
  const replacement = `${UNRELEASED_STUB}\n${newSection}`;
  const before = text.slice(0, unreleasedMatch.index);
  const after = text.slice(unreleasedMatch.index + unreleasedMatch[0].length);

  return {
    unreleasedBody,
    prevVersion,
    isEmpty,
    rebuiltText: `${before}${replacement}${after}`,
    extractedNotes: extractNotesFromBody(newBody.trim()),
  };
}

function isEmptyUnreleasedBody(body) {
  // Strip whitespace + section headers (### Added/Changed/Removed) and check
  // if anything remains.
  const stripped = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^### /.test(line));
  return stripped.length === 0;
}

function extractNotesFromBody(body) {
  // The notes file content for `gh release create --notes-file` is just the
  // body of the new section, no heading.
  return body.trim();
}

// ─── npm registry HTTP probe (for --resume "is it published?" check) ──────
//
// Returns a numeric HTTP status code from a HEAD/GET against
//   https://registry.npmjs.org/<pkgName>/<version>
// 200 = published, 404 = not published, anything else = treat as transient.
//
// Test override: BUMP_VERSION_FAKE_NPM_STATUS env var. Format is one or more
// `v<X.Y.Z>=<status>` entries separated by newlines or `;`. Bare versions
// (without the `v` prefix) also match. Default for any version not listed = 404.
async function probeNpmRegistryStatus(pkgName, version) {
  const fake = process.env.BUMP_VERSION_FAKE_NPM_STATUS;
  if (fake !== undefined) {
    const map = new Map();
    for (const entry of fake.split(/[\n;]/)) {
      const [k, v] = entry.split('=').map((s) => s?.trim());
      if (!k) continue;
      const norm = k.startsWith('v') ? k.slice(1) : k;
      map.set(norm, Number.parseInt(v ?? '404', 10));
    }
    return map.get(version) ?? 404;
  }
  const url = `https://registry.npmjs.org/${pkgName}/${version}`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      const r = await fetch(url, { signal: ac.signal });
      return r.status;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Network error → treat as transient (return 0, caller decides).
    return 0;
  }
}

// ─── Head-sha-filtered workflow-run finder (─wait bug fix) ────────────────
//
// Bug observed during v1.1.0 release: `gh run list --workflow=release.yml
// --limit 1` returned the previous v1.0.0 failed run because the new run
// took ~3-5sec to appear in the API after `release:published` fired.
//
// Fix: filter run-list by `--commit <sha>` AND retry every 1sec for up to
// `timeoutSec` (default 30s) before declaring "no run found".
//
// Returns the first matching run object (`{ databaseId, url, status, conclusion, createdAt }`).
//
// Quick 260506-jsc — the picker now prefers in-flight runs (in_progress /
// queued / waiting / requested) and falls back to newest completed. The
// previous --limit 1 + naive runs[0] could lock onto an OLDER completed-
// failure run on the same commit (a stale retry artifact), reporting the
// wrong status to the operator. With --limit raised to 10 + an explicit
// preference order, retries on the same tag pick the right run.
const IN_FLIGHT_STATUSES = new Set(['in_progress', 'queued', 'waiting', 'requested', 'pending']);

/**
 * Pick the most relevant run from a list returned by `gh run list`.
 *
 * Order of preference:
 *   1. Newest in-flight run (status ∈ IN_FLIGHT_STATUSES).
 *   2. Newest completed run.
 *   3. null when the list is empty.
 *
 * "Newest" = max `createdAt` (ISO-8601 string-compare works because UTC).
 * Exported for direct unit testing.
 *
 * @param {Array<{databaseId?: number|string, status?: string, createdAt?: string}>} runs
 */
export function pickPreferredRun(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const byCreatedDesc = (a, b) =>
    String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? ''));
  const inFlight = runs.filter((r) => IN_FLIGHT_STATUSES.has(String(r?.status ?? '')));
  if (inFlight.length > 0) {
    return [...inFlight].sort(byCreatedDesc)[0];
  }
  const completed = runs.filter((r) => String(r?.status ?? '') === 'completed');
  if (completed.length > 0) {
    return [...completed].sort(byCreatedDesc)[0];
  }
  // Unknown status (rare); just return the lexicographically-newest createdAt.
  return [...runs].sort(byCreatedDesc)[0];
}

export async function findReleaseRunForSha(sha, { timeoutSec } = {}) {
  const effectiveTimeout =
    timeoutSec ?? Number.parseInt(process.env.BUMP_VERSION_HEADSHA_TIMEOUT_SEC ?? '30', 10);
  const start = Date.now();
  while ((Date.now() - start) / 1000 < effectiveTimeout) {
    const r = shArgv('gh', [
      'run',
      'list',
      '--workflow=release.yml',
      '--commit',
      sha,
      '--limit',
      '10',
      '--json',
      'databaseId,status,conclusion,url,createdAt',
    ]);
    if (r.status === 0) {
      try {
        const runs = JSON.parse(r.stdout || '[]');
        const picked = pickPreferredRun(runs);
        if (picked) return picked;
      } catch {
        /* ignore parse errors and retry */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No release.yml run found for sha ${sha} after ${effectiveTimeout}s`);
}

// ─── --resume <tag> mode (Quick 260506-ilm) ────────────────────────────────
//
// Half-state release recovery: tag pushed + commit on main + GH release
// page exists, but npm publish failed. Re-fires release.yml against the tag
// without re-bumping the version.
//
// State detection (4 checks):
//   1. Tag exists on origin (`git ls-remote --tags origin <tag>`)
//   2. Commit reachable from origin/main (`git merge-base --is-ancestor`).
//      Bypassable with --force (cherry-pick scenario).
//   3. npm registry reports 404 for the version (not yet published).
//      If 200 → refuse (would create a sigstore double-signing collision).
//   4. GH release page exists (`gh release view <tag>`).
//
// On success: triggers `gh workflow run release.yml -f dry-run=false --ref <tag>`
// then (with --wait) polls via the same head-sha-filtered poll as --release.

const SEMVER_TAG_RE = /^v\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;

function refuseConflictingFlags(opts) {
  const conflicts = [];
  if (opts.major) conflicts.push('--major');
  if (opts.minor) conflicts.push('--minor');
  if (opts.patch) conflicts.push('--patch');
  if (opts.explicitVersion) conflicts.push(`--version=${opts.explicitVersion}`);
  if (opts.release) conflicts.push('--release');
  if (opts.publish) conflicts.push('--publish');
  if (opts.githubRelease) conflicts.push('--github-release');
  if (opts.push) conflicts.push('--push');
  if (conflicts.length > 0) {
    console.error(
      `bump-version: --resume cannot be combined with --minor/--major/--patch/--release/--publish (got: ${conflicts.join(', ')})`,
    );
    process.exit(2);
  }
}

async function runResume(opts) {
  const tag = opts.resume;

  // Tag-format gate — semver tag with optional pre-release suffix.
  if (!SEMVER_TAG_RE.test(tag)) {
    console.error(
      `bump-version: --resume tag "${tag}" has invalid tag format. Must match v<MAJOR>.<MINOR>.<PATCH>[-<pre>] (e.g., v1.1.0 or v2.0.0-rc.1).`,
    );
    process.exit(2);
  }

  refuseConflictingFlags(opts);

  const version = tag.slice(1); // strip leading 'v'
  console.log(`Resume mode: ${tag} (${version})`);
  console.log('');
  console.log('State detection:');

  // Check 1: tag exists on origin.
  const tagOnRemote = tagExistsOnRemote(tag);
  if (!tagOnRemote) {
    console.error(`  ✗ tag ${tag} not found on origin`);
    console.error('');
    console.error(
      `bump-version: ${tag} not found on origin. If you intended a fresh release, use --patch/--minor/--major --release.`,
    );
    process.exit(1);
  }

  // Resolve sha: try local rev-parse first (annotated tag → commit sha via ^{}).
  // Fall back to ls-remote output (which prefixes the tag's own object sha,
  // not necessarily the commit — for annotated tags this is the tag-object sha).
  // Sha resolution is best-effort here; if we can't get it locally, downstream
  // refusals (npm 200) still apply, and we error before any trigger.
  let sha = '';
  const localRev = shArgv('git', ['rev-parse', `${tag}^{}`]);
  if (localRev.status === 0) {
    sha = localRev.stdout.trim();
  } else {
    const lsr = shArgv('git', ['ls-remote', '--tags', 'origin', tag]);
    if (lsr.status === 0 && lsr.stdout.trim().length > 0) {
      sha = lsr.stdout.trim().split(/\s+/)[0] ?? '';
    }
  }
  if (sha) {
    console.log(`  ✓ tag exists at commit ${sha.slice(0, 7)}`);
  } else {
    console.log(
      `  ⚠ tag exists on origin but local sha resolution failed (run \`git fetch --tags\`)`,
    );
  }

  // Check 2: reachable from origin/main. We only refuse if we can confirm the
  // commit is _not_ an ancestor of an existing origin/main ref. If origin/main
  // can't be resolved (test fixture, local-only repo) OR sha resolution failed,
  // we soft-pass with a notice — the user can still pass --force.
  const originMainExists =
    shArgv('git', ['rev-parse', '--verify', '--quiet', 'origin/main']).status === 0;
  if (!sha) {
    console.log('  ⚠ reachability check skipped (no local sha)');
  } else if (!originMainExists) {
    console.log('  ⚠ origin/main not present locally; reachability check skipped');
  } else {
    const r = shArgv('git', ['merge-base', '--is-ancestor', sha, 'origin/main']);
    const reachable = r.status === 0;
    if (reachable) {
      console.log(`  ✓ commit reachable from main`);
    } else if (opts.force) {
      console.log(`  ⚠ commit NOT reachable from origin/main (bypassed via --force)`);
    } else {
      console.log(`  ✗ commit NOT reachable from origin/main`);
      console.error('');
      console.error(
        'bump-version: tag commit is not reachable from origin/main. This is a cherry-pick scenario; pass --force to proceed if intentional.',
      );
      process.exit(1);
    }
  }

  // Check 3: npm registry probe.
  const pkg = await readJson(PKG_PATH);
  const pkgName = pkg.name ?? '@webventures/testatlas';
  const status = await probeNpmRegistryStatus(pkgName, version);
  if (status === 200) {
    console.log(`  ✗ npm: ${pkgName}@${version} ALREADY PUBLISHED (registry returns 200)`);
    console.error('');
    console.error(
      `bump-version: Already published. v${version} is live on npm; nothing to resume.`,
    );
    process.exit(1);
  }
  if (status === 404) {
    console.log(`  ✗ npm: ${pkgName}@${version} NOT published (registry returns 404)`);
  } else {
    console.log(
      `  ⚠ npm: ${pkgName}@${version} probe returned HTTP ${status} (treating as not-published; verify manually)`,
    );
  }

  // Check 4: GH release page.
  const ghView = shArgv('gh', ['release', 'view', tag, '--json', 'tagName,assets']);
  let assetCount = 0;
  if (ghView.status === 0) {
    try {
      const view = JSON.parse(ghView.stdout || '{}');
      assetCount = Array.isArray(view.assets) ? view.assets.length : 0;
    } catch {
      assetCount = 0;
    }
    console.log(`  ✓ GH release page exists (${assetCount} assets)`);
  } else {
    console.log(`  ⚠ GH release page check failed (gh release view exited ${ghView.status})`);
  }

  // Plan
  console.log('');
  if (opts.dryRun) {
    console.log(`[dry-run] Would run: gh workflow run release.yml -f dry-run=false --ref ${tag}`);
    if (opts.wait) {
      const shaPreview = sha ? sha.slice(0, 7) : '<sha-from-tag>';
      console.log(
        `[dry-run] Would poll: gh run list --workflow=release.yml --commit ${shaPreview} (10-min timeout, 30s find-retry)`,
      );
    }
    process.exit(0);
  }

  // For real (non-dry-run) trigger, sha is required for downstream poll.
  if (!sha) {
    console.error(
      `bump-version: cannot resolve commit sha for ${tag} locally; run \`git fetch --tags\` and retry.`,
    );
    process.exit(1);
  }

  // Execute the trigger.
  console.log(`Triggering release.yml workflow_dispatch against ${tag}…`);
  const trig = shArgv('gh', [
    'workflow',
    'run',
    'release.yml',
    '-f',
    'dry-run=false',
    '--ref',
    tag,
  ]);
  if (trig.status !== 0) {
    console.error(`gh workflow run FAILED:\n${trig.stderr}`);
    console.error('Ensure `gh auth status` is green and you have write access.');
    process.exit(1);
  }
  console.log('✓ workflow_dispatch triggered.');

  if (opts.wait) {
    await pollWorkflow(tag, sha);
  } else {
    // Surface the run URL once it appears (best-effort; non-fatal).
    try {
      const located = await findReleaseRunForSha(sha);
      if (located?.url) {
        console.log(`  Workflow run: ${located.url}`);
      }
    } catch {
      console.log('  (run did not appear within 30s; check GH Actions UI)');
    }
  }

  console.log(`\nDone. Resume submitted for ${tag}.`);
}

// ─── Pre-flight gates ───────────────────────────────────────────────────────

function runGates({ dryRun }) {
  if (dryRun) {
    console.log('[dry-run] Would run pre-flight gates:');
    console.log('[dry-run]   pnpm test');
    console.log('[dry-run]   node scripts/check-adapter-parity.js --strict');
    console.log('[dry-run]   node scripts/validate-workspace.js (if _testatlas/ present)');
    return;
  }

  console.log('Running pre-flight gates…');

  console.log('  → pnpm test');
  const t = shArgv('pnpm', ['test'], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (t.status !== 0) {
    console.error('bump-version: pnpm test FAILED — aborting before any writes.');
    process.exit(1);
  }

  // check-adapter-parity is suite-only; skip if absent (e.g., consumer repo
  // running bump-version against their own package.json).
  const parityPath = path.join(REPO_ROOT, 'scripts', 'check-adapter-parity.js');
  if (existsSync(parityPath)) {
    console.log('  → node scripts/check-adapter-parity.js --strict');
    const p = shArgv('node', [parityPath, '--strict'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (p.status !== 0) {
      console.error('bump-version: adapter parity check FAILED — aborting before any writes.');
      process.exit(1);
    }
  } else {
    console.log('  → check-adapter-parity: SKIPPED (script not present)');
  }

  // validate-workspace requires a workspace (`_testatlas/`); skip if absent.
  const validatePath = path.join(REPO_ROOT, 'scripts', 'validate-workspace.js');
  const workspacePresent = (() => {
    try {
      return readFileSync(path.join(REPO_ROOT, '_testatlas', 'manifest.json'), 'utf8').length > 0;
    } catch {
      return false;
    }
  })();

  if (workspacePresent && existsSync(validatePath)) {
    console.log('  → node scripts/validate-workspace.js');
    const v = shArgv('node', [validatePath], { stdio: ['ignore', 'inherit', 'inherit'] });
    if (v.status !== 0) {
      console.error('bump-version: validate-workspace FAILED — aborting before any writes.');
      process.exit(1);
    }
  } else {
    console.log('  → validate-workspace: SKIPPED (no _testatlas/ workspace or script absent)');
  }

  console.log('Pre-flight gates: PASS');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // --resume <tag>: half-state release recovery (Quick 260506-ilm).
  // Short-circuits the normal bump flow.
  if (opts.resume !== null) {
    await runResume(opts);
    return;
  }

  // 1. Load current version
  const pkg = await readJson(PKG_PATH);
  const current = pkg.version;
  if (!semver.valid(current)) {
    console.error(`bump-version: package.json has invalid version "${current}"`);
    process.exit(1);
  }

  // 2. Determine target version
  let target;
  if (opts.explicitVersion) {
    target = opts.explicitVersion;
  } else if (opts.major) {
    target = semver.inc(current, 'major');
  } else if (opts.minor) {
    target = semver.inc(current, 'minor');
  } else {
    // default to patch
    target = semver.inc(current, 'patch');
  }

  if (!semver.valid(target)) {
    console.error(`bump-version: invalid target version "${target}"`);
    process.exit(1);
  }
  if (!semver.gt(target, current)) {
    console.error(`bump-version: target version ${target} is not greater than current ${current}`);
    process.exit(1);
  }

  const tagName = `v${target}`;

  // 3. Local safety checks (always; not skippable by --skip-gates).
  if (!opts.forceDirty && isDirty()) {
    console.error(
      'bump-version: working tree is dirty. Commit or stash changes first, or pass --force-dirty.',
    );
    process.exit(1);
  }
  if (tagExists(tagName)) {
    console.error(`bump-version: tag ${tagName} already exists locally.`);
    process.exit(1);
  }
  if (tagExistsOnRemote(tagName)) {
    console.error(
      `bump-version: tag ${tagName} already exists on remote origin. Run \`git fetch origin\` and verify.`,
    );
    process.exit(1);
  }

  // 4. Deprecation warning for --publish (loud + actionable).
  if (opts.publish) {
    console.warn(
      '⚠ --publish is deprecated. Trusted Publishing is configured for @webventures/testatlas;\n' +
        '  use --release to drive the OIDC publish workflow via release.yml.\n' +
        '  --publish remains as a bootstrap-only fallback for emergency scenarios.',
    );
  }

  // 5. Pre-flight gates (--release implies gates run; --skip-gates bypasses).
  if (!opts.skipGates) {
    runGates({ dryRun: opts.dryRun });
  } else if (!opts.dryRun) {
    console.warn('⚠ --skip-gates: skipping pnpm test + parity + validate-workspace.');
  }

  console.log(`Bumping ${current} → ${target}`);

  // 6. Compute changes
  const changes = [];

  // 6a. package.json
  const nextPkg = { ...pkg, version: target };
  changes.push({ path: 'package.json', desc: `version: ${current} → ${target}` });

  // 6b. .testatlas/VERSION
  const oldVersionFile = (await readText(VERSION_FILE))?.trim() ?? '';
  if (oldVersionFile !== target) {
    changes.push({
      path: '.testatlas/VERSION',
      desc: `${oldVersionFile || '(empty)'} → ${target}`,
    });
  }

  // 6c. adapter-capabilities.json (optional — only if file exists)
  let nextCaps = null;
  const capsExists = await readText(ADAPTER_CAPS_PATH);
  if (capsExists !== null) {
    const caps = JSON.parse(capsExists);
    nextCaps = { ...caps, version: target };
    if (caps.version !== target) {
      changes.push({
        path: '.testatlas/adapters/adapter-capabilities.json',
        desc: `version: ${caps.version} → ${target}`,
      });
    }
  }

  // 6d. mcp-server-manifest.json (optional — only if file exists)
  let nextMcp = null;
  const mcpExists = await readText(MCP_MANIFEST_PATH);
  if (mcpExists !== null) {
    const mcp = JSON.parse(mcpExists);
    nextMcp = { ...mcp, version: target };
    if (mcp.version !== target) {
      changes.push({
        path: '.testatlas/adapters/mcp/mcp-server-manifest.json',
        desc: `version: ${mcp.version} → ${target}`,
      });
    }
  }

  // 6e. install.sh — rewrite the `VERSION="..."` line. SKIPPED if install.sh
  // isn't in REPO_ROOT (consumer fixture / non-suite cwd). TARBALL_SHA256 is
  // intentionally NOT touched — release.yml owns that.
  const installShText = await readText(INSTALL_SH_PATH);
  let nextInstallShText = null;
  if (installShText !== null) {
    const m = installShText.match(INSTALL_SH_VERSION_RE);
    if (m) {
      const oldVer = m[0].slice('VERSION="'.length, -1);
      if (oldVer !== target) {
        nextInstallShText = installShText.replace(INSTALL_SH_VERSION_RE, `VERSION="${target}"`);
        changes.push({
          path: 'install.sh',
          desc: `VERSION: ${oldVer} → ${target}`,
        });
      }
    }
    // If the file exists but has no matching line, leave it alone — this is
    // a malformed install.sh state worth surfacing as a noop rather than
    // silently rewriting.
  }

  // 6f. CHANGELOG.md migration
  const changelogText = await readText(CHANGELOG_PATH);
  const dateStr = new Date().toISOString().slice(0, 10);
  const migration = changelogText ? planChangelogMigration(changelogText, target, dateStr) : null;
  if (migration && migration.rebuiltText !== changelogText) {
    changes.push({
      path: 'CHANGELOG.md',
      desc: `migrate [Unreleased] → [${target}] (${migration.isEmpty ? 'placeholder' : 'hoisted body'})`,
    });
  }

  // 7. Plan release pipeline (preview lines we surface in dry-run + later log).
  const branch = currentBranch();
  const releaseImpliesPush = opts.release;
  const willPush = opts.push || releaseImpliesPush;
  const willRelease = opts.release;
  const willGithubReleaseLegacy = opts.githubRelease && !opts.release;
  const willPublishLegacy = opts.publish;

  // 8. Dry-run preview
  if (opts.dryRun) {
    console.log('\n[dry-run] Would modify:');
    for (const c of changes) {
      console.log(`  ${c.path}: ${c.desc}`);
    }
    if (!opts.noCommit) {
      console.log(`\n[dry-run] Would commit: "chore(release): ${tagName}"`);
    }
    if (!opts.noTag) {
      console.log(`[dry-run] Would create annotated tag: ${tagName}`);
    }
    if (willPush) {
      console.log(`[dry-run] Would run: git push origin ${branch}`);
      console.log(`[dry-run] Would run: git push origin ${tagName}`);
    }
    if (willRelease) {
      const notesPath = path.join(tmpdir(), `release-notes-${tagName}.md`);
      console.log(
        `[dry-run] Would write release notes to: ${notesPath}\n` +
          `[dry-run] Would run: gh release create ${tagName} --title ${tagName} --notes-file ${notesPath}`,
      );
      console.log(
        `[dry-run] release.yml fires on release:published — handles OIDC npm publish + asset attachment.`,
      );
      if (opts.wait) {
        console.log(
          '[dry-run] Would poll: gh run list --workflow=release.yml --commit <HEAD> (10-min timeout, 30s find-retry)',
        );
      }
    }
    if (willGithubReleaseLegacy) {
      console.log(`[dry-run] Would run (legacy): gh release create ${tagName} --generate-notes`);
    }
    if (willPublishLegacy) {
      console.log('[dry-run] Would run (legacy / deprecated): npm publish --access public');
    }
    console.log('\n[dry-run] No files modified.');
    process.exit(0);
  }

  // 9. Apply writes (atomic — all gates already passed).
  await writeJson(PKG_PATH, nextPkg);
  await writeFile(VERSION_FILE, `${target}\n`, 'utf8');
  if (nextCaps) await writeJson(ADAPTER_CAPS_PATH, nextCaps);
  if (nextMcp) await writeJson(MCP_MANIFEST_PATH, nextMcp);
  if (nextInstallShText !== null) {
    await writeFile(INSTALL_SH_PATH, nextInstallShText, 'utf8');
  }
  if (migration && migration.rebuiltText !== changelogText) {
    await writeFile(CHANGELOG_PATH, migration.rebuiltText, 'utf8');
  }

  console.log(`\nUpdated ${changes.length} file(s):`);
  for (const c of changes) {
    console.log(`  ${c.path}`);
  }

  // 10. Commit
  if (!opts.noCommit) {
    sh('git add -A');
    sh(`git commit -m "chore(release): ${tagName}"`);
    console.log(`Committed: chore(release): ${tagName}`);
  }

  // 11. Tag (annotated; carries CHANGELOG extract for `git show <tag>` UX)
  if (!opts.noTag) {
    const tagBody = migration?.extractedNotes
      ? `Release ${tagName}\n\n${migration.extractedNotes}`
      : `Release ${tagName}`;
    // Pass via -F file to avoid shell-quoting hazards.
    const tagMsgFile = path.join(tmpdir(), `tag-msg-${tagName}.txt`);
    await writeFile(tagMsgFile, tagBody, 'utf8');
    try {
      sh(`git tag -a ${tagName} -F ${JSON.stringify(tagMsgFile)}`);
    } finally {
      // assertCapability(RELEASE_CAPABILITY_CONFIG, 'destructive-fs') —
      // tmp file cleanup; permissive profile declared at module top.
      await rm(tagMsgFile, { force: true });
    }
    console.log(`Tagged: ${tagName}`);
  }

  // 12. Push (--push or implied by --release)
  if (willPush) {
    console.log(`\nPushing ${branch} + ${tagName} to origin…`);
    const branchPush = shArgv('git', ['push', 'origin', branch]);
    if (branchPush.status !== 0) {
      console.error(`git push origin ${branch} FAILED:\n${branchPush.stderr}`);
      process.exit(1);
    }
    const tagPush = shArgv('git', ['push', 'origin', tagName]);
    if (tagPush.status !== 0) {
      console.error(`git push origin ${tagName} FAILED:\n${tagPush.stderr}`);
      process.exit(1);
    }
    console.log(`Pushed: ${branch} + ${tagName}`);
  }

  // 13. --release: drive release.yml via gh release create --notes-file
  if (willRelease) {
    const notesPath = path.join(tmpdir(), `release-notes-${tagName}.md`);
    const notesBody = migration?.extractedNotes ?? `Release ${tagName}`;
    await writeFile(notesPath, notesBody, 'utf8');
    console.log(`\nCreating GitHub Release ${tagName} (release.yml will fire on publish)…`);
    try {
      const r = shArgv('gh', [
        'release',
        'create',
        tagName,
        '--title',
        tagName,
        '--notes-file',
        notesPath,
      ]);
      if (r.status !== 0) {
        console.error(`gh release create FAILED:\n${r.stderr}`);
        console.error('Ensure `gh auth status` is green and you have write access.');
        process.exit(1);
      }
      const releaseUrl = `https://github.com/CryptVenture/TestAtlas/releases/tag/${tagName}`;
      console.log(`✓ GitHub Release created: ${releaseUrl}`);

      // Surface the run URL — filter by head sha so we don't grab a stale
      // run from a previous release (Quick 260506-ilm bug fix). Only attempt
      // the locate when we're going to --wait OR via a short non-blocking
      // probe; otherwise the 30s find-retry would block fire-and-forget runs.
      const headSha = (() => {
        try {
          return sh('git rev-parse HEAD');
        } catch {
          return '';
        }
      })();
      if (headSha && opts.wait) {
        // 14. --wait: poll until completion (head-sha-filtered). pollWorkflow
        // calls findReleaseRunForSha internally with the standard timeout.
        await pollWorkflow(tagName, headSha);
      } else if (headSha) {
        // Fire-and-forget: do a single (no-retry) probe so we can surface a
        // URL if the run is already visible, but don't block. Quick 260506-jsc:
        // request --limit 10 + createdAt and pick via the same picker as --wait.
        const probe = shArgv('gh', [
          'run',
          'list',
          '--workflow=release.yml',
          '--commit',
          headSha,
          '--limit',
          '10',
          '--json',
          'url,status,createdAt',
        ]);
        if (probe.status === 0) {
          try {
            const runs = JSON.parse(probe.stdout || '[]');
            const picked = pickPreferredRun(runs);
            if (picked?.url) {
              console.log(`  Workflow run: ${picked.url}`);
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } finally {
      // assertCapability(RELEASE_CAPABILITY_CONFIG, 'destructive-fs') —
      // notes file cleanup; permissive profile declared at module top.
      await rm(notesPath, { force: true });
    }
  }

  // 15. Legacy --github-release (only if --release NOT set).
  if (willGithubReleaseLegacy) {
    console.log('\nCreating GitHub Release (legacy --github-release)…');
    try {
      sh(`gh release create ${tagName} --generate-notes --title "Release ${tagName}"`);
      console.log(`GitHub Release created: ${tagName}`);
    } catch (err) {
      console.error(`gh release create failed: ${err.message}`);
      process.exit(1);
    }
  }

  // 16. Legacy --publish (deprecated; bootstrap-only).
  if (willPublishLegacy) {
    console.log('\n[deprecated] Running local npm publish…');
    const inOidc = !!process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const provenanceFlag = inOidc ? '--provenance' : '--provenance=false';
    if (!inOidc && !process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
      console.error(
        'bump-version: no NPM_TOKEN/NODE_AUTH_TOKEN env set and not in CI OIDC context.\n' +
          '  This is a bootstrap-only path. For normal releases use --release (Trusted Publishing).',
      );
      process.exit(1);
    }
    try {
      sh(`npm publish --access public ${provenanceFlag}`);
      console.log('Published to npm.');
    } catch (err) {
      console.error(`npm publish failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\nDone. Version is now ${target}.`);
}

// ─── --wait poll loop ───────────────────────────────────────────────────────
//
// Filters by `--commit <sha>` (Quick 260506-ilm fix). The previous
// implementation polled `--limit 1` with no sha filter, which returned a
// stale completed run from the previous release while the new run was still
// pending in the API (3-5sec window post-release:published).
//
// Step 1: locate the run for this sha (with 30s retry-until-found).
// Step 2: poll its status until `completed` (10m timeout).

async function pollWorkflow(tagName, sha) {
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const POLL_MS = 15 * 1000;
  console.log(`\nLocating release.yml run for sha ${sha.slice(0, 7)}…`);

  let run;
  try {
    run = await findReleaseRunForSha(sha);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  console.log(`  Run located: ${run.url} (id=${run.databaseId})`);
  console.log(`Polling release.yml workflow (timeout 10m)…`);

  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const r = shArgv('gh', [
      'run',
      'list',
      '--workflow=release.yml',
      '--commit',
      sha,
      '--limit',
      '10',
      '--json',
      'status,conclusion,databaseId,url,createdAt',
    ]);
    if (r.status === 0) {
      try {
        const runs = JSON.parse(r.stdout || '[]');
        const cur = pickPreferredRun(runs);
        if (cur) {
          if (cur.status === 'completed') {
            if (cur.conclusion === 'success') {
              console.log(`✓ Published @webventures/testatlas@${tagName.slice(1)} via OIDC.`);
              console.log(`  Run: ${cur.url}`);
              return;
            }
            console.error(
              `✗ Workflow failed (${cur.conclusion}). View logs: gh run view ${cur.databaseId}`,
            );
            process.exit(1);
          }
          process.stdout.write(`  status=${cur.status} conclusion=${cur.conclusion ?? '-'}\r`);
        }
      } catch {
        /* ignore parse errors */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  console.error(`\n✗ Workflow polling timed out after 10 minutes.`);
  process.exit(1);
}

// Quick 260506-jsc: gate main() so `import bump-version.js` from tests doesn't
// fire a real bump on the host repo. Standard ESM-CLI entrypoint pattern,
// matching update.js / install.js.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`bump-version: ${err.message}`);
    process.exit(1);
  });
}
