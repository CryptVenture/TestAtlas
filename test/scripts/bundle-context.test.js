// test/scripts/bundle-context.test.js
//
// Plan 14-02 Task 2 — bundle-context.js produces a context_bundle.md for a
// persona/session.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'bundle-context.js');

async function setupBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-bundle-ctx-'));
  const wsDir = path.join(dir, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });
  await mkdir(path.join(wsDir, 'agents', 'councils', 'sessions', 'COUNCIL-001'), {
    recursive: true,
  });
  await writeFile(
    path.join(brainDir, 'state.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      project: { name: 'demo', repo_root: '.', primary_stack: ['node'] },
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
  await writeFile(
    path.join(brainDir, 'coverage.json'),
    JSON.stringify({
      schema_version: '2.0.0',
      coverage: { routes: [], components: [], endpoints: [], commands: [] },
    }),
  );
  await writeFile(
    path.join(brainDir, 'evidence.json'),
    JSON.stringify({ schema_version: '2.0.0', evidence: [] }),
  );
  await writeFile(
    path.join(brainDir, 'quality_scores.json'),
    JSON.stringify({ schema_version: '2.0.0', scores: [] }),
  );
  return { dir, wsDir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: bundleContext writes a context_bundle.md', async () => {
  const ctx = await setupBrain();
  try {
    const { bundleContext } = await import(SCRIPT);
    const r = await bundleContext({
      cwd: ctx.dir,
      persona: 'security-reviewer',
      session: 'COUNCIL-001',
      scope: 'domain-auth',
    });
    assert.equal(r.ok, true);
    assert.match(r.outputPath, /context_bundle\.md$/);
    const text = await readFile(r.outputPath, 'utf8');
    assert.match(text, /Persona:.*security-reviewer/);
    assert.match(text, /Session:.*COUNCIL-001/);
    assert.match(text, /Scope:.*domain-auth/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: bundleContext fails gracefully when brain missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-bundle-ctx-empty-'));
  try {
    const { bundleContext } = await import(SCRIPT);
    await assert.rejects(bundleContext({ cwd: dir, persona: 'x', session: 'y', scope: 'z' }), (e) =>
      /brain|missing/i.test(e.message),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
