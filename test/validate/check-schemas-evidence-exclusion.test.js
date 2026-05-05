// test/validate/check-schemas-evidence-exclusion.test.js
//
// Quick 260505-ge3 / F-7 regression test.
//
// `check-schemas.js` MUST distinguish between:
//   1. Schema-bound evidence sidecars (`evidence/EVIDENCE-<id>(-<slug>)?/evidence.json`)
//      — STILL validated against evidence.schema.json.
//   2. Raw evidence dumps (`evidence/<command>/<timestamp>/*.json`)
//      — IGNORED entirely (no TESTATLAS_UNKNOWN_SCHEMA, no validation).
//
// The distinguishing rule is anchored on `^EVIDENCE-\d{3,}` matching the first
// segment after `evidence/`. Adversarial inputs (`EVIDENCE-bogus/`, three-segment
// paths under any non-EVIDENCE-<digit>+ command name) verify the regex anchoring.

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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

test('check-schemas (F-7): raw evidence dump produces ZERO findings', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    // evidence/<command>/<timestamp>/*.json — three segments under evidence/.
    const dumpDir = path.join(ctx.wsDir, 'evidence', 'explore-codebase', '20260505T113200Z');
    await mkdir(dumpDir, { recursive: true });
    const dumpPath = path.join(dumpDir, 'package-summary.json');
    await writeFile(dumpPath, JSON.stringify({ stats: 'arbitrary' }, null, 2));

    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });

    const dumpFindings = result.findings.filter((f) => f.path.includes('package-summary.json'));
    assert.equal(
      dumpFindings.length,
      0,
      `raw evidence dump should not produce findings, got: ${JSON.stringify(dumpFindings, null, 2)}`,
    );
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas (F-7): schema-bound EVIDENCE-<id>/evidence.json sidecar STILL validated', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });
    // Drop a structurally invalid sidecar — must produce TESTATLAS_SCHEMA_VIOLATION.
    const sidecarDir = path.join(ctx.wsDir, 'evidence', 'EVIDENCE-001');
    await mkdir(sidecarDir, { recursive: true });
    const sidecarPath = path.join(sidecarDir, 'evidence.json');
    await writeFile(sidecarPath, JSON.stringify({ id: 'EVIDENCE-001' }, null, 2));

    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });

    const violation = result.findings.find(
      (f) => f.path.includes('EVIDENCE-001') && f.code === 'TESTATLAS_SCHEMA_VIOLATION',
    );
    assert.ok(
      violation,
      `expected TESTATLAS_SCHEMA_VIOLATION for sidecar; findings=${JSON.stringify(result.findings, null, 2)}`,
    );
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas (F-7): mixed workspace — raw dumps coexist with valid sidecar', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });

    // Raw dumps under multiple command directories.
    const cmd1 = path.join(ctx.wsDir, 'evidence', 'explore-codebase', '20260505T113200Z');
    const cmd2 = path.join(ctx.wsDir, 'evidence', 'explore-ui', '20260505T120000Z');
    await mkdir(cmd1, { recursive: true });
    await mkdir(cmd2, { recursive: true });
    await writeFile(path.join(cmd1, 'manifests.json'), JSON.stringify({ a: 1 }));
    await writeFile(path.join(cmd1, 'route-list.json'), JSON.stringify({ b: 2 }));
    await writeFile(path.join(cmd2, 'screenshot-meta.json'), JSON.stringify({ c: 3 }));

    // Valid sidecar.
    const sidecarDir = path.join(ctx.wsDir, 'evidence', 'EVIDENCE-001');
    await mkdir(sidecarDir, { recursive: true });
    await writeFile(
      path.join(sidecarDir, 'evidence.json'),
      JSON.stringify(
        {
          $schema: 'https://testatlas.dev/schemas/v1/evidence.schema.json',
          id: 'EVIDENCE-001',
          type: 'log',
          path: 'evidence/EVIDENCE-001/note.md',
          capturedOn: '2026-05-05T11:32:00Z',
          environment: 'dev',
          description: 'something asserted',
          redacted: false,
        },
        null,
        2,
      ),
    );

    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });

    // Zero findings on any of the raw dumps.
    const rawDumpHits = result.findings.filter(
      (f) =>
        f.path.includes('manifests.json') ||
        f.path.includes('route-list.json') ||
        f.path.includes('screenshot-meta.json'),
    );
    assert.equal(
      rawDumpHits.length,
      0,
      `raw dumps should be silent; got ${JSON.stringify(rawDumpHits)}`,
    );

    // Sidecar validation outcome still acts: a structurally valid sidecar
    // must not surface a TESTATLAS_SCHEMA_VIOLATION for itself.
    const sidecarViolation = result.findings.find(
      (f) => f.path.includes('EVIDENCE-001') && f.code === 'TESTATLAS_SCHEMA_VIOLATION',
    );
    assert.ok(!sidecarViolation, 'valid sidecar must not produce a violation');
  } finally {
    await fx.cleanup();
  }
});

test('check-schemas (F-7): regex anchoring — `EVIDENCE-bogus/` parent treated as raw dump; `EVIDENCE-001-with-slug/` validated', async () => {
  const fx = await makeWorkspaceFixture();
  try {
    const ctx = await makeCtx({ cwd: fx.cwd });

    // Adversarial: parent dir starts with `EVIDENCE-` but is NOT `EVIDENCE-<digit>+`.
    // The path has 4 parts (evidence/EVIDENCE-bogus/something.json + extra) — but
    // the canonical sidecar pattern is exactly evidence/EVIDENCE-<id>/evidence.json
    // (3 parts). A 4-part path under EVIDENCE-bogus/ MUST be treated as a raw dump
    // (the first segment `EVIDENCE-bogus` doesn't match `^EVIDENCE-\d{3,}`).
    const bogusDir = path.join(ctx.wsDir, 'evidence', 'EVIDENCE-bogus', 'subdir');
    await mkdir(bogusDir, { recursive: true });
    await writeFile(path.join(bogusDir, 'something.json'), JSON.stringify({ x: 1 }));

    // Valid sidecar with `-<slug>` suffix per create-evidence-record.js naming.
    const slugDir = path.join(ctx.wsDir, 'evidence', 'EVIDENCE-002-with-slug');
    await mkdir(slugDir, { recursive: true });
    await writeFile(
      path.join(slugDir, 'evidence.json'),
      JSON.stringify(
        {
          $schema: 'https://testatlas.dev/schemas/v1/evidence.schema.json',
          id: 'EVIDENCE-002',
          type: 'log',
          path: 'evidence/EVIDENCE-002-with-slug/note.md',
          capturedOn: '2026-05-05T11:35:00Z',
          environment: 'dev',
          description: 'slug-suffixed sidecar',
          redacted: false,
        },
        null,
        2,
      ),
    );

    const files = await walkWorkspace(ctx.wsDir);
    const result = await check({ ...ctx, files });

    // bogus parent dir → no findings (treated as raw dump).
    const bogusFindings = result.findings.filter((f) => f.path.includes('EVIDENCE-bogus'));
    assert.equal(
      bogusFindings.length,
      0,
      `EVIDENCE-bogus/ must be treated as raw dump; got ${JSON.stringify(bogusFindings)}`,
    );

    // Slug-suffixed sidecar → no violation (structurally valid).
    const slugViolation = result.findings.find(
      (f) => f.path.includes('EVIDENCE-002-with-slug') && f.code === 'TESTATLAS_SCHEMA_VIOLATION',
    );
    assert.ok(!slugViolation, 'EVIDENCE-002-with-slug/ sidecar must validate cleanly');
  } finally {
    await fx.cleanup();
  }
});
