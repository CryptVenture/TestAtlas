// test/scripts/update-indexes.test.js
//
// Quick 260505-ge3 / F-8 regression test.
//
// `update-indexes.js` extended from 5 sections to 9 sections:
//   - existing: domain-docs, flow-docs, issue-docs, evidence, reports
//   - new:      canonical-docs, json-maps, command-outputs, sub-agent-outputs
//
// Idempotency: two consecutive runs produce identical artifact-index content.
// --only filter respects each new section.

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { parseMarkers } from '../../scripts/lib/markers.js';
import { updateIndexes } from '../../scripts/update-indexes.js';
import { makeValidationFixture } from '../_helpers.js';

function bodyOf(text, slug) {
  const { sections } = parseMarkers(text);
  const sec = sections.get(slug);
  return sec ? sec.contentLines.join('\n') : null;
}

test('updateIndexes (F-8): canonical-docs section lists 14 canonical files', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'canonical-docs');
  assert.ok(body, 'canonical-docs section present');
  // 14 canonical files: 12 .md + 2 .json (workspace-manifest, app-map).
  assert.match(body, /00_overview\.md/);
  assert.match(body, /13_quality_scorecard\.md/);
  assert.match(body, /11_workspace_manifest\.json/);
  assert.match(body, /12_app_map\.json/);
});

test('updateIndexes (F-8): json-maps section lists non-canonical *.json at root (empty in fresh fixture)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'json-maps');
  assert.ok(body, 'json-maps section present');
  // No non-canonical JSON in _base-good → empty body string.
  assert.match(body, /no json-maps yet|^$/m);
});

test('updateIndexes (F-8): json-maps lists a custom JSON map when present', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await writeFile(path.join(fx.wsDir, 'custom-extra.json'), '{"x":1}\n', 'utf8');
  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'json-maps');
  assert.ok(body.includes('custom-extra.json'), `expected custom-extra.json in body; got: ${body}`);
  // Canonical 11_/12_ MUST NOT appear in json-maps (they're in canonical-docs).
  assert.ok(!body.includes('11_workspace_manifest.json'));
  assert.ok(!body.includes('12_app_map.json'));
});

test('updateIndexes (F-8): command-outputs section lists evidence/<command>/ subdirs (NOT EVIDENCE-* records)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Create one command-output dir + leave existing EVIDENCE-001 alone.
  await mkdir(path.join(fx.wsDir, 'evidence', 'explore-codebase', '20260505T113200Z'), {
    recursive: true,
  });

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'command-outputs');
  assert.ok(
    body.includes('evidence/explore-codebase/'),
    `expected explore-codebase/ in body; got: ${body}`,
  );
  // EVIDENCE-* records belong to the `evidence` section, not command-outputs.
  assert.ok(!body.includes('EVIDENCE-'));
});

test('updateIndexes (F-8): sub-agent-outputs lists handoffs/HANDOFF-*.md', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await mkdir(path.join(fx.wsDir, 'handoffs'), { recursive: true });
  await writeFile(path.join(fx.wsDir, 'handoffs', 'HANDOFF-001-example.md'), '# handoff\n', 'utf8');

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const body = bodyOf(text, 'sub-agent-outputs');
  assert.ok(
    body.includes('handoffs/HANDOFF-001-example.md'),
    `expected handoffs/HANDOFF-001-example.md in body; got: ${body}`,
  );
});

test('updateIndexes (F-8): two consecutive runs produce identical 09_artifact_index.md content (idempotency)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await updateIndexes({ cwd: fx.cwd });
  const first = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  await updateIndexes({ cwd: fx.cwd });
  const second = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  assert.equal(second, first, 'artifact-index content is stable across runs');
});

test('updateIndexes (F-8): existing 5 sections still re-derive (no regression)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await updateIndexes({ cwd: fx.cwd });
  const text = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');

  assert.ok(bodyOf(text, 'domain-docs').includes('domains/auth/index.md'));
  assert.ok(bodyOf(text, 'flow-docs').includes('flows/FLOW-auth-login.md'));
  assert.ok(bodyOf(text, 'issue-docs').includes('to_fix/ISSUE-001-foo.md'));
  assert.ok(bodyOf(text, 'evidence').includes('EVIDENCE-001'));
  assert.ok(bodyOf(text, 'reports').includes('reports/REPORT-2026-05-01.md'));
});

test('updateIndexes (F-8): --only=canonical-docs touches only that section', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // First, run a full update so all 9 sections are rendered.
  await updateIndexes({ cwd: fx.cwd });
  const before = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const beforeIssue = bodyOf(before, 'issue-docs');

  // Add a new issue file on disk.
  await writeFile(path.join(fx.wsDir, 'to_fix/ISSUE-007-newly-added.md'), '# new\n', 'utf8');

  await updateIndexes({ cwd: fx.cwd, only: ['canonical-docs'] });
  const after = await readFile(path.join(fx.wsDir, '09_artifact_index.md'), 'utf8');
  const afterIssue = bodyOf(after, 'issue-docs');

  assert.equal(afterIssue, beforeIssue, 'issue-docs section unchanged when --only=canonical-docs');
});
