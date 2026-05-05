#!/usr/bin/env node
// scripts/bump-version.js
//
// Unified version bump for TestAtlas. Single source of truth: package.json.
// Syncs all downstream version references, updates CHANGELOG, commits,
// tags, and optionally publishes to npm + GitHub Releases.
//
// Usage:
//   node scripts/bump-version.js --patch
//   node scripts/bump-version.js --minor
//   node scripts/bump-version.js --major
//   node scripts/bump-version.js --version=1.2.3
//   node scripts/bump-version.js --patch --dry-run
//   node scripts/bump-version.js --patch --publish --github-release
//
// Safety:
//   - Refuses to run on a dirty git working tree (unless --force-dirty).
//   - Refuses to bump to an already-existing tag.
//   - Validates semver before any writes.

import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

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
    publish: false,
    githubRelease: false,
  };
  for (const a of argv) {
    if (a === '--major') opts.major = true;
    else if (a === '--minor') opts.minor = true;
    else if (a === '--patch') opts.patch = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force-dirty') opts.forceDirty = true;
    else if (a === '--no-commit') opts.noCommit = true;
    else if (a === '--no-tag') opts.noTag = true;
    else if (a === '--publish') opts.publish = true;
    else if (a === '--github-release') opts.githubRelease = true;
    else if (a.startsWith('--version=')) opts.explicitVersion = a.slice('--version='.length);
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/bump-version.js [options]

Options:
  --major           Bump major version (X.0.0)
  --minor           Bump minor version (0.X.0)
  --patch           Bump patch version (0.0.X) [default if none specified]
  --version=X.Y.Z   Set exact version
  --dry-run         Preview changes without writing
  --force-dirty     Allow bumping with uncommitted changes
  --no-commit       Skip the git commit step
  --no-tag          Skip the git tag step
  --publish         Publish to npm after bump (requires npm auth)
  --github-release  Create GitHub Release after tagging (requires gh CLI)
  --help            Show this message

Examples:
  node scripts/bump-version.js --patch
  node scripts/bump-version.js --minor --publish --github-release
  node scripts/bump-version.js --version=1.2.0 --dry-run`);
      process.exit(0);
    } else {
      console.error(`bump-version: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  return opts;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJson(p) {
  return readFile(p, 'utf8').then((t) => JSON.parse(t));
}

function writeJson(p, obj) {
  return writeFile(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT, ...opts }).trim();
}

function isDirty() {
  try {
    sh('git diff --quiet');
    sh('git diff --cached --quiet');
    return false;
  } catch {
    return true;
  }
}

function tagExists(tag) {
  try {
    sh(`git rev-parse --verify refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

async function readText(p) {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

// ─── CHANGELOG update ───────────────────────────────────────────────────────

function updateChangelog(text, newVersion, dateStr) {
  const header = `## [${newVersion}] - ${dateStr}`;
  // Replace the "## [Unreleased]" line with itself + the new release header
  return text.replace(/## \[Unreleased\]\n/, `## [Unreleased]\n\n${header}\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

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

  // 3. Safety checks
  if (!opts.forceDirty && isDirty()) {
    console.error(
      'bump-version: working tree is dirty. Commit or stash changes first, or pass --force-dirty.',
    );
    process.exit(1);
  }
  if (tagExists(tagName)) {
    console.error(`bump-version: tag ${tagName} already exists.`);
    process.exit(1);
  }

  console.log(`Bumping ${current} → ${target}`);

  // 4. Compute changes
  const changes = [];

  // 4a. package.json
  const nextPkg = { ...pkg, version: target };
  changes.push({ path: 'package.json', desc: `version: ${current} → ${target}` });

  // 4b. .testatlas/VERSION
  const oldVersionFile = (await readText(VERSION_FILE))?.trim() ?? '';
  if (oldVersionFile !== target) {
    changes.push({
      path: '.testatlas/VERSION',
      desc: `${oldVersionFile || '(empty)'} → ${target}`,
    });
  }

  // 4c. adapter-capabilities.json
  const caps = await readJson(ADAPTER_CAPS_PATH);
  const oldCapsVersion = caps.version;
  const nextCaps = { ...caps, version: target };
  if (oldCapsVersion !== target) {
    changes.push({
      path: '.testatlas/adapters/adapter-capabilities.json',
      desc: `version: ${oldCapsVersion} → ${target}`,
    });
  }

  // 4d. mcp-server-manifest.json
  const mcp = await readJson(MCP_MANIFEST_PATH);
  const oldMcpVersion = mcp.version;
  const nextMcp = { ...mcp, version: target };
  if (oldMcpVersion !== target) {
    changes.push({
      path: '.testatlas/adapters/mcp/mcp-server-manifest.json',
      desc: `version: ${oldMcpVersion} → ${target}`,
    });
  }

  // 4e. CHANGELOG.md
  const changelogText = await readText(CHANGELOG_PATH);
  const dateStr = new Date().toISOString().slice(0, 10);
  const nextChangelog = changelogText ? updateChangelog(changelogText, target, dateStr) : null;
  if (nextChangelog && nextChangelog !== changelogText) {
    changes.push({ path: 'CHANGELOG.md', desc: `add [${target}] release header` });
  }

  // 5. Dry-run preview
  if (opts.dryRun) {
    console.log('\n[dry-run] Would modify:');
    for (const c of changes) {
      console.log(`  ${c.path}: ${c.desc}`);
    }
    if (!opts.noCommit) {
      console.log(`\n[dry-run] Would commit with message: "chore(release): ${tagName}"`);
    }
    if (!opts.noTag) {
      console.log(`[dry-run] Would create tag: ${tagName}`);
    }
    if (opts.publish) {
      console.log('[dry-run] Would run: npm publish --provenance --access public');
    }
    if (opts.githubRelease) {
      console.log(`[dry-run] Would run: gh release create ${tagName} --generate-notes`);
    }
    console.log('\n[dry-run] No files modified.');
    process.exit(0);
  }

  // 6. Apply writes
  await writeJson(PKG_PATH, nextPkg);
  await writeFile(VERSION_FILE, `${target}\n`, 'utf8');
  await writeJson(ADAPTER_CAPS_PATH, nextCaps);
  await writeJson(MCP_MANIFEST_PATH, nextMcp);
  if (nextChangelog) {
    await writeFile(CHANGELOG_PATH, nextChangelog, 'utf8');
  }

  console.log(`\nUpdated ${changes.length} file(s):`);
  for (const c of changes) {
    console.log(`  ${c.path}`);
  }

  // 7. Commit
  if (!opts.noCommit) {
    sh('git add -A');
    sh(`git commit -m "chore(release): ${tagName}"`);
    console.log(`Committed: chore(release): ${tagName}`);
  }

  // 8. Tag
  if (!opts.noTag) {
    sh(`git tag -a ${tagName} -m "Release ${tagName}"`);
    console.log(`Tagged: ${tagName}`);
  }

  // 9. npm publish
  if (opts.publish) {
    console.log('\nPublishing to npm…');
    try {
      sh('npm publish --provenance --access public');
      console.log('Published to npm.');
    } catch (err) {
      console.error(`npm publish failed: ${err.message}`);
      console.error('You may need to run `npm login` or check your OTP.');
      process.exit(1);
    }
  }

  // 10. GitHub Release
  if (opts.githubRelease) {
    console.log('\nCreating GitHub Release…');
    try {
      sh(`gh release create ${tagName} --generate-notes --title "Release ${tagName}"`);
      console.log(`GitHub Release created: ${tagName}`);
    } catch (err) {
      console.error(`GitHub release failed: ${err.message}`);
      console.error('Ensure `gh` CLI is installed and authenticated (`gh auth status`).');
      process.exit(1);
    }
  }

  console.log(`\nDone. Version is now ${target}.`);
}

main().catch((err) => {
  console.error(`bump-version: ${err.message}`);
  process.exit(1);
});
