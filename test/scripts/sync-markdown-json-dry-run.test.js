// test/scripts/sync-markdown-json-dry-run.test.js
//
// Plan 20-02 / ISSUE-050 — sync-markdown-json.js --dry-run flag.
//
// Contract pinned by these tests:
//   - Running `sync-markdown-json.js --dry-run --cwd <fixture>` exits 0.
//   - Stdout contains a "DRY RUN" banner (case-insensitive) AND lists at
//     least one planned write path.
//   - Under --dry-run, every md/json file's mtime + content hash is
//     UNCHANGED (no fs.writeFile / atomic-write / rename actually runs).
//   - Without --dry-run, the same fixture DOES mutate (regression guard:
//     don't break the happy path).

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'sync-markdown-json.js');

/**
 * Walk a directory recursively and return [{path, mtimeMs, sha256}, ...]
 * for every regular file. Used to assert no mutation under --dry-run.
 */
async function snapshotTree(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const st = await stat(full);
        const buf = await readFile(full);
        const sha = createHash('sha256').update(buf).digest('hex');
        out.push({ path: full, mtimeMs: st.mtimeMs, sha });
      }
    }
  }
  await walk(root);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

/**
 * Set up a fixture workspace with a domain whose markdown is *newer* than
 * its JSON sibling, so `sync-markdown-json.js` would normally rewrite the
 * brain index (`brain/domains.json`).
 */
async function setupDriftFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-sync-md-dryrun-'));
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await mkdir(path.join(wsDir, 'domains'), { recursive: true });

  // Empty domains index — script will populate it (= mutation).
  await writeFile(
    path.join(wsDir, 'brain', 'domains.json'),
    `${JSON.stringify({ schema_version: '2.0.0', last_updated: '', domains: [] }, null, 2)}\n`,
  );

  // One domain with markdown drift (mtime newer than JSON).
  const domainDir = path.join(wsDir, 'domains', 'auth');
  await mkdir(domainDir, { recursive: true });
  await writeFile(
    path.join(domainDir, 'domain.md'),
    '---\nid: domain-auth\nschema_version: 2.0.0\nstatus: mapped\n---\n# Domain: Auth\n',
  );
  await writeFile(
    path.join(domainDir, 'domain.json'),
    JSON.stringify({ id: 'domain-auth', schema_version: '2.0.0', status: 'mapped' }),
  );
  // Force markdown to look newer than JSON (drift the script must reconcile).
  const newer = new Date(Date.now() + 60_000);
  await utimes(path.join(domainDir, 'domain.md'), newer, newer);

  return { dir, wsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: --dry-run exits 0 and prints DRY RUN banner', async () => {
  const ctx = await setupDriftFixture();
  try {
    const r = spawnSync('node', [SCRIPT, '--dry-run', '--cwd', ctx.dir], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, `exit non-zero. stdout=${r.stdout} stderr=${r.stderr}`);
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    assert.ok(/DRY RUN/i.test(out), `expected DRY RUN banner in output, got: ${out}`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: --dry-run lists at least one planned write path', async () => {
  const ctx = await setupDriftFixture();
  try {
    const r = spawnSync('node', [SCRIPT, '--dry-run', '--cwd', ctx.dir], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0);
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    // Expect a path-shaped string referencing the brain index that WOULD be written.
    assert.ok(
      /domains\.json/.test(out),
      `expected planned-write path mentioning domains.json, got: ${out}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: --dry-run mutates NOTHING (mtime + content hash invariant)', async () => {
  const ctx = await setupDriftFixture();
  try {
    const before = await snapshotTree(ctx.wsDir);
    const r = spawnSync('node', [SCRIPT, '--dry-run', '--cwd', ctx.dir], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0);
    const after = await snapshotTree(ctx.wsDir);
    assert.equal(
      after.length,
      before.length,
      `file count changed: before=${before.length} after=${after.length}`,
    );
    for (let i = 0; i < before.length; i++) {
      assert.equal(after[i].path, before[i].path);
      assert.equal(
        after[i].sha,
        before[i].sha,
        `content hash changed for ${before[i].path} under --dry-run`,
      );
      assert.equal(
        after[i].mtimeMs,
        before[i].mtimeMs,
        `mtime changed for ${before[i].path} under --dry-run`,
      );
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: regression — without --dry-run the same fixture DOES mutate', async () => {
  const ctx = await setupDriftFixture();
  try {
    const before = await snapshotTree(ctx.wsDir);
    const r = spawnSync('node', [SCRIPT, '--cwd', ctx.dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, `happy-path exit non-zero. stderr=${r.stderr}`);
    const after = await snapshotTree(ctx.wsDir);
    // Some file's hash MUST differ (the brain/domains.json index gets populated).
    const changed = after.some((a) => {
      const b = before.find((x) => x.path === a.path);
      return !b || b.sha !== a.sha;
    });
    assert.ok(
      changed,
      'expected at least one file to be mutated WITHOUT --dry-run, but tree was unchanged',
    );
  } finally {
    await ctx.cleanup();
  }
});
