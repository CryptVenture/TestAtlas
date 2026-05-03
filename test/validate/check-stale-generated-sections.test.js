// test/validate/check-stale-generated-sections.test.js
//
// Plan 05-03 (Wave 2). Unit tests for check-stale-generated-sections (PRD §33 #8 + #9).
//
// Two finding codes (per Pitfall 2 conservative posture):
//   - TESTATLAS_STALE_GENERATED_HASH         — whitespace-only diff; fixable='auto' (HEAL-04 eligible)
//   - TESTATLAS_MODIFIED_GENERATED_CONTENT   — non-whitespace diff;  fixable=null  (NEVER-heal)

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { check } from '../../scripts/lib/validate/check-stale-generated-sections.js';
import { walkWorkspace } from '../../scripts/lib/validate/walk-workspace.js';
import { makeValidationFixture } from '../_helpers.js';

async function loadCtx(scenario) {
  const fx = await makeValidationFixture(scenario);
  const files = await walkWorkspace(fx.wsDir);
  const manifestText = await readFile(path.join(fx.wsDir, '11_workspace_manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  return { ctx: { wsDir: fx.wsDir, files, manifest }, cleanup: fx.cleanup };
}

test('check-stale-generated-sections: _base-good → status pass, zero findings', async () => {
  const { ctx, cleanup } = await loadCtx('_base-good');
  try {
    const result = await check(ctx);
    assert.equal(result.id, 'check-stale-generated-sections');
    assert.equal(result.prdRule, 8);
    assert.equal(result.status, 'pass', JSON.stringify(result.findings, null, 2));
  } finally {
    await cleanup();
  }
});

test('check-stale-generated-sections: broken-stale-hash-whitespace-only → warn TESTATLAS_STALE_GENERATED_HASH; fixable=auto (HEAL-04 eligible)', async () => {
  const { ctx, cleanup } = await loadCtx('broken-stale-hash-whitespace-only');
  try {
    const result = await check(ctx);
    assert.equal(result.status, 'warn');
    const stale = result.findings.find((f) => f.code === 'TESTATLAS_STALE_GENERATED_HASH');
    assert.ok(stale, 'expected TESTATLAS_STALE_GENERATED_HASH finding');
    assert.equal(stale.severity, 'warning');
    assert.equal(stale.fixable, 'auto');
    assert.match(stale.fixDescription ?? '', /HEAL-04|whitespace|regenerate/i);
    assert.match(stale.path, /03_execution_status\.md/);
    // Must NOT emit MODIFIED_GENERATED_CONTENT for the whitespace-only fixture.
    const mgc = result.findings.find((f) => f.code === 'TESTATLAS_MODIFIED_GENERATED_CONTENT');
    assert.equal(
      mgc,
      undefined,
      'whitespace-only fixture must not emit MODIFIED_GENERATED_CONTENT',
    );
  } finally {
    await cleanup();
  }
});

test('check-stale-generated-sections: broken-stale-hash (non-whitespace edit) → warn TESTATLAS_MODIFIED_GENERATED_CONTENT; fixable=null', async () => {
  const { ctx, cleanup } = await loadCtx('broken-stale-hash');
  try {
    const result = await check(ctx);
    assert.equal(result.status, 'warn');
    const mgc = result.findings.find((f) => f.code === 'TESTATLAS_MODIFIED_GENERATED_CONTENT');
    assert.ok(mgc, 'expected TESTATLAS_MODIFIED_GENERATED_CONTENT finding');
    assert.equal(mgc.severity, 'warning');
    assert.equal(mgc.fixable, null, 'non-whitespace stale hash must be NEVER-heal');
    assert.match(mgc.path, /03_execution_status\.md/);
    // Must NOT emit STALE_GENERATED_HASH for non-whitespace edits.
    const stale = result.findings.find((f) => f.code === 'TESTATLAS_STALE_GENERATED_HASH');
    assert.equal(stale, undefined, 'non-whitespace edit must not emit STALE_GENERATED_HASH');
  } finally {
    await cleanup();
  }
});

test('check-stale-generated-sections: broken-modified-generated-content (non-whitespace edit, different file) → warn TESTATLAS_MODIFIED_GENERATED_CONTENT; fixable=null', async () => {
  const { ctx, cleanup } = await loadCtx('broken-modified-generated-content');
  try {
    const result = await check(ctx);
    assert.equal(result.status, 'warn');
    const mgc = result.findings.find((f) => f.code === 'TESTATLAS_MODIFIED_GENERATED_CONTENT');
    assert.ok(mgc, 'expected TESTATLAS_MODIFIED_GENERATED_CONTENT finding');
    assert.equal(mgc.fixable, null);
    assert.match(mgc.path, /00_overview\.md/);
  } finally {
    await cleanup();
  }
});

test('check-stale-generated-sections: never instantiates own AJV; uses ctx.files (no re-walk)', async () => {
  // Sanity: function reads ctx.files.allMarkdownFiles + ctx.manifest only.
  // Pass a stub ctx and verify no fs read failure.
  const stubCtx = {
    wsDir: '/tmp/never-touched',
    files: { allMarkdownFiles: [] },
    manifest: { generatedSections: {} },
  };
  const result = await check(stubCtx);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.findings, []);
});
