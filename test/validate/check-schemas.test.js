// test/validate/check-schemas.test.js
//
// Plan 05-02 (Wave 1). Unit tests for check-schemas (PRD §33 #2).

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../../scripts/init-workspace.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { check } from '../../scripts/lib/validate/check-schemas.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeWorkspaceFixture } from '../_helpers.js';

async function makeCtx({ cwd }) {
  const ajv = await loadAllSchemas({ cwd });
  const r = await initWorkspace({ cwd });
  const files = await walkWorkspace(r.wsDir);
  return { wsDir: r.wsDir, ajv, files };
}

test('check-schemas: fresh init → pass (manifest validates against its schema)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const result = await check(ctx);
    assert.equal(result.id, 'check-schemas');
    assert.equal(result.prdRule, 2);
    assert.equal(result.status, 'pass', `findings: ${JSON.stringify(result.findings, null, 2)}`);
    assert.equal(result.findings.length, 0);
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas: invalid issue JSON → TESTATLAS_SCHEMA_VIOLATION with AJV detail', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    // Drop a structurally invalid issue (missing required fields).
    const issuePath = path.join(ctx.wsDir, 'to_fix', 'ISSUE-001-broken.json');
    await writeFile(issuePath, JSON.stringify({ id: 'ISSUE-001' }, null, 2));
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });
    assert.equal(result.status, 'fail');
    const violation = result.findings.find((f) => f.code === 'TESTATLAS_SCHEMA_VIOLATION');
    assert.ok(violation, 'expected TESTATLAS_SCHEMA_VIOLATION finding');
    assert.equal(violation.severity, 'error');
    assert.equal(violation.fixable, null);
    assert.match(violation.path, /ISSUE-001-broken\.json/);
    // AJV's verbatim error text should be threaded through the message.
    assert.match(violation.message, /required|must have/i);
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas: malformed JSON → TESTATLAS_JSON_PARSE_ERROR', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const badPath = path.join(ctx.wsDir, 'to_fix', 'ISSUE-002-malformed.json');
    await writeFile(badPath, '{ this is not valid json');
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });
    const parseErr = result.findings.find((f) => f.code === 'TESTATLAS_JSON_PARSE_ERROR');
    assert.ok(parseErr, 'expected TESTATLAS_JSON_PARSE_ERROR finding');
    assert.equal(parseErr.fixable, null);
    assert.match(parseErr.path, /ISSUE-002-malformed\.json/);
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas: never instantiates own AJV (uses ctx.ajv) — Pitfall 4', async () => {
  // Smoke: pass a deliberately broken ctx.ajv that has NO registered
  // schemas. The check should produce a TESTATLAS_UNKNOWN_SCHEMA finding —
  // never silently succeed by creating its own AJV instance.
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    const fakeAjv = { getSchema: () => null };
    const result = await check({ ...ctx, ajv: fakeAjv });
    // The manifest exists; with a stub AJV every JSON file produces an
    // UNKNOWN_SCHEMA finding (the validator lookup fails).
    assert.equal(result.status, 'fail');
    const unknown = result.findings.find((f) => f.code === 'TESTATLAS_UNKNOWN_SCHEMA');
    assert.ok(unknown, 'using ctx.ajv (not own instance) — stub AJV must surface UNKNOWN_SCHEMA');
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas: every finding has fixable=null (NEVER auto-heal per safety contract)', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    await writeFile(
      path.join(ctx.wsDir, 'to_fix', 'ISSUE-003-bad.json'),
      JSON.stringify({ id: 'ISSUE-003' }, null, 2),
    );
    await writeFile(path.join(ctx.wsDir, 'to_fix', 'ISSUE-004-malformed.json'), '{ malformed');
    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });
    for (const f of result.findings) {
      assert.equal(f.fixable, null, `finding ${f.code} must have fixable=null`);
    }
  } finally {
    await fx.cleanup();
  }
});
