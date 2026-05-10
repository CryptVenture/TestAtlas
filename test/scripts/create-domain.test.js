// test/scripts/create-domain.test.js
//
// Plan 14-02 Task 1 — create-domain.js (V2 wrapper). Note: V1 already has
// scripts/create-domain.js which writes V1 domain.json. The V2 enhancements
// here add: (a) ALSO write domain.md from .testatlas/templates/markdown/domain-v2.md,
// (b) update _testatlas/brain/domains.json index, (c) bump _testatlas/brain/state.json
// counts.domains.
//
// We test through the EXPORTED createDomain() function with V2 opts (i.e.
// pass cwd, but expect the side-effects in the V2 brain too).

import { strict as assert } from 'node:assert';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'create-domain.js');

async function setupV2Workspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-create-domain-v2-'));
  // create-domain.js calls loadConfig() which requires the suite tree.
  await cp(path.join(REPO_ROOT, '.testatlas'), path.join(dir, '.testatlas'), { recursive: true });
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await mkdir(path.join(wsDir, 'domains'), { recursive: true });
  // Minimal V1 manifest required by the existing V1 code path.
  await writeFile(
    path.join(wsDir, '11_workspace_manifest.json'),
    JSON.stringify({
      $schema: 'https://testatlas.dev/schemas/v1/workspace-manifest.schema.json',
      schemaVersion: '1.0.0',
      project: 'test',
      initializedAt: '2026-05-07T00:00:00Z',
      lastUpdatedAt: '2026-05-07T00:00:00Z',
      status: 'initialized',
      counts: {
        domains: 0,
        flows: 0,
        issues: 0,
        evidence: 0,
        runs: 0,
        reports: 0,
      },
      generatedSections: {},
    }),
  );
  // V2 brain skeleton
  await writeFile(
    path.join(wsDir, 'brain', 'domains.json'),
    JSON.stringify({ schema_version: '2.0.0', last_updated: '', domains: [] }),
  );
  await writeFile(
    path.join(wsDir, 'brain', 'state.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      project: { name: 'test', repo_root: '.', primary_stack: [] },
      status: { phase: 'i', last_updated: '', active_environment: 'local' },
      counts: {
        domains: 0,
        flows: 0,
        issues: 0,
        critical_issues: 0,
        high_issues: 0,
        evidence_artifacts: 0,
        council_sessions: 0,
      },
      confidence: { overall: 'unknown', highest_risk_domains: [], stale_domains: [] },
    }),
  );
  return { dir, wsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: createDomain (V2) updates brain/domains.json index', async () => {
  const ctx = await setupV2Workspace();
  try {
    const { createDomain } = await import(pathToFileURL(SCRIPT).href);
    await createDomain({
      cwd: ctx.dir,
      // Tell the V2 path: also write to brain index. The script auto-detects
      // _testatlas/brain/ presence.
      name: 'Auth',
      purpose: 'User sign-in',
    });
    const idx = JSON.parse(await readFile(path.join(ctx.wsDir, 'brain', 'domains.json'), 'utf8'));
    assert.ok(Array.isArray(idx.domains) && idx.domains.length === 1);
    assert.equal(idx.domains[0].id, 'domain-auth');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: createDomain (V2) bumps brain/state.json counts.domains', async () => {
  const ctx = await setupV2Workspace();
  try {
    const { createDomain } = await import(pathToFileURL(SCRIPT).href);
    await createDomain({ cwd: ctx.dir, name: 'Billing', purpose: 'Charge cards' });
    const state = JSON.parse(await readFile(path.join(ctx.wsDir, 'brain', 'state.json'), 'utf8'));
    assert.equal(state.counts.domains, 1);
  } finally {
    await ctx.cleanup();
  }
});
