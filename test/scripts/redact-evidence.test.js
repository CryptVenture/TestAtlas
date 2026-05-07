// test/scripts/redact-evidence.test.js
//
// Plan 14-02 Task 2 — redact-evidence.js scans for known secret patterns,
// produces a redacted copy under evidence/redacted/, and flags sensitivity.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'redact-evidence.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-redact-evidence-'));
  const wsDir = path.join(dir, '_testatlas');
  await mkdir(path.join(wsDir, 'evidence'), { recursive: true });
  return { dir, wsDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const PATTERNS = [
  { name: 'AWS access key', payload: 'AKIAIOSFODNN7EXAMPLE' },
  { name: 'GitHub PAT', payload: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  { name: 'GitHub secret', payload: 'ghs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  { name: 'npm token', payload: 'npm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  { name: 'Slack token', payload: 'xoxb-1111-2222-aaaaaaaaaaaaaaaaaaaaaaaa' },
  { name: 'Slack user token', payload: 'xoxp-1111-2222-aaaaaaaaaaaaaaaaaaaaaaaa' },
  { name: 'URL token query', payload: 'https://example.com/api?token=secret123' },
  { name: 'JWT', payload: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMiJ9.signature' },
  {
    name: 'PRIVATE KEY',
    payload: '-----BEGIN PRIVATE KEY-----\nMIIBVQIBA\n-----END PRIVATE KEY-----',
  },
];

for (const { name, payload } of PATTERNS) {
  test(`Test: redacts ${name}`, async () => {
    const ctx = await setupWorkspace();
    try {
      const evidencePath = path.join(ctx.wsDir, 'evidence', 'EVIDENCE-001.txt');
      await writeFile(evidencePath, `prefix\n${payload}\nsuffix\n`);
      const { redactEvidence } = await import(SCRIPT);
      const r = await redactEvidence({ cwd: ctx.dir, evidenceId: 'EVIDENCE-001' });
      assert.equal(r.ok, true);
      assert.equal(r.sensitive, true);
      const redacted = await readFile(r.redactedPath, 'utf8');
      assert.notMatch(redacted, new RegExp(payload.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
      assert.match(redacted, /\[REDACTED/);
      // Original unchanged.
      const original = await readFile(evidencePath, 'utf8');
      assert.match(
        original,
        new RegExp(payload.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').slice(0, 12)),
      );
    } finally {
      await ctx.cleanup();
    }
  });
}

test('Test: clean evidence yields sensitive=false (no redacted copy)', async () => {
  const ctx = await setupWorkspace();
  try {
    const evidencePath = path.join(ctx.wsDir, 'evidence', 'EVIDENCE-001.txt');
    await writeFile(evidencePath, 'plain log line — nothing sensitive\n');
    const { redactEvidence } = await import(SCRIPT);
    const r = await redactEvidence({ cwd: ctx.dir, evidenceId: 'EVIDENCE-001' });
    assert.equal(r.ok, true);
    assert.equal(r.sensitive, false);
  } finally {
    await ctx.cleanup();
  }
});
