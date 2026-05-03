// test/validate/check-broken-links.test.js
//
// Plan 05-02 (Wave 1). Unit tests for check-broken-links (PRD §33 #3).

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../../scripts/init-workspace.js';
import { check } from '../../scripts/lib/validate/check-broken-links.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeWorkspaceFixture } from '../_helpers.js';

async function makeCtx({ cwd }) {
  const r = await initWorkspace({ cwd });
  const files = await walkWorkspace(r.wsDir);
  return { wsDir: r.wsDir, files };
}

test('check-broken-links: fresh init → pass (canonical templates link only to existing or external targets)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const result = await check(ctx);
    assert.equal(result.id, 'check-broken-links');
    assert.equal(result.prdRule, 3);
    if (result.status !== 'pass') {
      // Diagnose by surfacing the first few unexpected findings.
      console.error('Unexpected findings:', JSON.stringify(result.findings.slice(0, 5), null, 2));
    }
    assert.equal(result.status, 'pass');
  } finally {
    await fx.cleanup();
  }
});

test('check-broken-links: dangling relative link → TESTATLAS_BROKEN_LINK with line number', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    // Append a broken link to an existing canonical file.
    const target = path.join(ctx.wsDir, '00_overview.md');
    const body = ['# Overview', '', 'See [missing doc](does-not-exist.md) for details.', ''].join(
      '\n',
    );
    await writeFile(target, body);
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ wsDir: ctx.wsDir, files });
    assert.equal(result.status, 'fail');
    const f = result.findings.find((x) => x.code === 'TESTATLAS_BROKEN_LINK');
    assert.ok(f, 'expected TESTATLAS_BROKEN_LINK');
    assert.equal(f.severity, 'error');
    assert.equal(f.fixable, null);
    assert.equal(f.path, '00_overview.md');
    assert.equal(typeof f.line, 'number');
    assert.equal(f.line, 3);
  } finally {
    await fx.cleanup();
  }
});

test('check-broken-links: same-file #anchor that exists → no finding', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const target = path.join(ctx.wsDir, '00_overview.md');
    const body = ['# Overview', '', '## Goals', '', 'Jump to [Goals](#goals).', ''].join('\n');
    await writeFile(target, body);
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ wsDir: ctx.wsDir, files });
    const broken = result.findings.filter(
      (f) => f.code === 'TESTATLAS_BROKEN_LINK' && f.path === '00_overview.md',
    );
    assert.equal(
      broken.length,
      0,
      `expected no broken-link findings, got: ${JSON.stringify(broken)}`,
    );
  } finally {
    await fx.cleanup();
  }
});

test('check-broken-links: same-file #anchor that does NOT exist → broken finding', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const target = path.join(ctx.wsDir, '00_overview.md');
    const body = ['# Overview', '', 'See [Plan](#nonexistent-section).', ''].join('\n');
    await writeFile(target, body);
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ wsDir: ctx.wsDir, files });
    const f = result.findings.find(
      (x) => x.code === 'TESTATLAS_BROKEN_LINK' && /nonexistent-section/.test(x.message),
    );
    assert.ok(f, 'expected broken anchor finding');
  } finally {
    await fx.cleanup();
  }
});

test('check-broken-links: external links (http/https/mailto) are skipped', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const target = path.join(ctx.wsDir, '00_overview.md');
    const body = [
      '# Overview',
      '',
      '[GitHub](https://github.com), [docs](http://example.com), [email](mailto:hi@example.com).',
      '',
    ].join('\n');
    await writeFile(target, body);
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ wsDir: ctx.wsDir, files });
    const broken = result.findings.filter(
      (f) => f.code === 'TESTATLAS_BROKEN_LINK' && f.path === '00_overview.md',
    );
    assert.equal(broken.length, 0);
  } finally {
    await fx.cleanup();
  }
});

test('check-broken-links: every finding has fixable=null (NEVER auto-heal)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    await writeFile(path.join(ctx.wsDir, '00_overview.md'), '# Overview\n\n[bad](nope.md)\n');
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ wsDir: ctx.wsDir, files });
    for (const f of result.findings) {
      assert.equal(f.fixable, null);
    }
  } finally {
    await fx.cleanup();
  }
});
