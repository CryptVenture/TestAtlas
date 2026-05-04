// test/examples/nextjs-saas-validate.test.js
//
// Plan 08-02 Task 2 — examples/nextjs-saas/ workspace-validity assertions.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { REPO_ROOT } from './_helpers.js';

const EXAMPLE = path.join(REPO_ROOT, 'examples', 'nextjs-saas');
const WS = path.join(EXAMPLE, '_testatlas');

test('nextjs-saas: validate-workspace exits 0 against the checked-in _testatlas', async () => {
  const { code, stdout, stderr } = await new Promise((resolve, reject) => {
    const c = spawn(
      'node',
      [path.join(REPO_ROOT, 'scripts/validate-workspace.js'), '--workspace', WS],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => {
      stdout += d.toString('utf8');
    });
    c.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });
    c.on('error', reject);
    c.on('close', (n) => resolve({ code: n ?? 0, stdout, stderr }));
  });
  assert.equal(
    code,
    0,
    `validate-workspace exited ${code}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
  );
});

test('nextjs-saas: _testatlas/domains has at least one artifact for auth, dashboard, marketing', async () => {
  const entries = await readdir(path.join(WS, 'domains'));
  for (const required of ['auth', 'dashboard', 'marketing']) {
    assert.ok(
      entries.includes(required),
      `expected domain dir ${required}; got: ${entries.join(', ')}`,
    );
  }
});

test('nextjs-saas: _testatlas/09_artifact_index.md references all created flows', async () => {
  const idx = await readFile(path.join(WS, '09_artifact_index.md'), 'utf8');
  const expectedSlugFragments = [
    'login-with-credentials',
    'signup-new-account',
    'dashboard-navigation',
    'health-check',
  ];
  for (const slug of expectedSlugFragments) {
    assert.ok(idx.includes(slug), `expected artifact-index to reference flow slug "${slug}"`);
  }
});

test('nextjs-saas: NO confidence:needs-validation issues (full-capability example)', async () => {
  const files = await readdir(path.join(WS, 'to_fix'));
  const issueJsons = files.filter((n) => n.startsWith('ISSUE-') && n.endsWith('.json'));
  assert.ok(issueJsons.length >= 3, `expected ≥3 issues, got ${issueJsons.length}`);
  for (const fname of issueJsons) {
    const rec = JSON.parse(await readFile(path.join(WS, 'to_fix', fname), 'utf8'));
    assert.notEqual(
      rec.confidence,
      'needs-validation',
      `issue ${fname} has confidence:needs-validation; only Aider example (08-04 cli-tool) should have those`,
    );
  }
});
