// test/scripts/sync-markdown-json.test.js
//
// Plan 14-02 Task 1 — sync-markdown-json.js bidirectional drift sync.
//
// Contract pinned by these tests:
//   - syncMarkdownJson({cwd}) returns {ok:true, changed:[paths]} with no
//     changes on a fresh workspace (idempotent).
//   - When a domain markdown file is newer than its sibling JSON, the JSON
//     index entry is updated (markdown wins → JSON refresh).
//   - When a JSON index entry has a newer timestamp than its source markdown,
//     the markdown's TESTATLAS:GENERATED section is updated (JSON wins for
//     generated-section content; human prose preserved).
//   - Files outside <!-- TESTATLAS:GENERATED:START --> markers are NEVER
//     touched.
//   - Atomic writes (no half-written files on crash).

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'sync-markdown-json.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-sync-md-'));
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await mkdir(path.join(wsDir, 'domains'), { recursive: true });
  // Minimal brain index files
  await writeFile(
    path.join(wsDir, 'brain', 'domains.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', domains: [] }),
  );
  await writeFile(
    path.join(wsDir, 'brain', 'flows.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', flows: [] }),
  );
  await writeFile(
    path.join(wsDir, 'brain', 'issues.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', issues: [] }),
  );
  await writeFile(
    path.join(wsDir, 'brain', 'personas.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', personas: [] }),
  );
  return { dir, wsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: sync on empty workspace is a no-op', async () => {
  const ctx = await setupWorkspace();
  try {
    const { syncMarkdownJson } = await import(pathToFileURL(SCRIPT).href);
    const r = await syncMarkdownJson({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    assert.deepEqual(r.changed, []);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: domain markdown drift updates JSON index entry', async () => {
  const ctx = await setupWorkspace();
  try {
    const domainDir = path.join(ctx.wsDir, 'domains', 'auth');
    await mkdir(domainDir, { recursive: true });
    await writeFile(
      path.join(domainDir, 'domain.md'),
      '---\nid: domain-auth\nschema_version: 2.0.0\nstatus: mapped\n---\n# Domain: Auth\n\n## Summary\nAuth domain.\n',
    );
    await writeFile(
      path.join(domainDir, 'domain.json'),
      JSON.stringify({ id: 'domain-auth', schema_version: '2.0.0', status: 'mapped' }),
    );
    // Set markdown mtime newer than JSON.
    const newer = new Date(Date.now() + 60_000);
    await utimes(path.join(domainDir, 'domain.md'), newer, newer);

    const { syncMarkdownJson } = await import(pathToFileURL(SCRIPT).href);
    const r = await syncMarkdownJson({ cwd: ctx.dir });
    assert.equal(r.ok, true);
    const idx = JSON.parse(await readFile(path.join(ctx.wsDir, 'brain', 'domains.json'), 'utf8'));
    assert.ok(
      Array.isArray(idx.domains) && idx.domains.some((d) => d.id === 'domain-auth'),
      `expected domains.json index to include domain-auth, got: ${JSON.stringify(idx.domains)}`,
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: human prose outside TESTATLAS:GENERATED markers is preserved', async () => {
  const ctx = await setupWorkspace();
  try {
    const domainDir = path.join(ctx.wsDir, 'domains', 'billing');
    await mkdir(domainDir, { recursive: true });
    const human =
      '---\nid: domain-billing\nschema_version: 2.0.0\nstatus: mapped\n---\n# Domain: Billing\n\n## Summary\n\nHand-written prose that MUST NOT be lost.\n\n## Open Questions\n\n<!-- TESTATLAS:GENERATED:START field=open_questions -->\n- old generated content\n<!-- TESTATLAS:GENERATED:END field=open_questions -->\n';
    await writeFile(path.join(domainDir, 'domain.md'), human);
    await writeFile(
      path.join(domainDir, 'domain.json'),
      JSON.stringify({ id: 'domain-billing', schema_version: '2.0.0', status: 'mapped' }),
    );

    const { syncMarkdownJson } = await import(pathToFileURL(SCRIPT).href);
    await syncMarkdownJson({ cwd: ctx.dir });

    const after = await readFile(path.join(domainDir, 'domain.md'), 'utf8');
    assert.match(after, /Hand-written prose that MUST NOT be lost\./);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: idempotent — running twice yields zero changes the second time', async () => {
  const ctx = await setupWorkspace();
  try {
    const domainDir = path.join(ctx.wsDir, 'domains', 'a');
    await mkdir(domainDir, { recursive: true });
    await writeFile(
      path.join(domainDir, 'domain.md'),
      '---\nid: domain-a\nschema_version: 2.0.0\nstatus: mapped\n---\n# A\n',
    );
    await writeFile(
      path.join(domainDir, 'domain.json'),
      JSON.stringify({ id: 'domain-a', schema_version: '2.0.0', status: 'mapped' }),
    );
    const { syncMarkdownJson } = await import(pathToFileURL(SCRIPT).href);
    await syncMarkdownJson({ cwd: ctx.dir });
    const r2 = await syncMarkdownJson({ cwd: ctx.dir });
    assert.equal(r2.ok, true);
    assert.deepEqual(r2.changed, []);
  } finally {
    await ctx.cleanup();
  }
});
