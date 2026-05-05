// test/validate/check-evidence-redaction.test.js
//
// Plan 11-05 — fixture-based regression test for the new
// `check-evidence-redaction` validate-workspace check (ISSUE-015 fix).
//
// PRD §33 — automated secret-scanner backing the evidence schema's
// `redacted: true` self-attestation. The check walks
// `_testatlas/evidence/EVIDENCE-*/evidence.json`, and for each sidecar
// with `redacted: true` it scans the linked file (and any other files in
// the same EVIDENCE-* directory) for credential patterns. On match it
// emits a `TESTATLAS_REDACTION_LEAK` finding pointing at file:line:label.
//
// 7 tests — clean, AWS, GitHub, JWT, allowlist suppression, glob
// allowlist suppression, OpenSSH private key.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { check } from '../../scripts/lib/validate/check-evidence-redaction.js';

/**
 * Build a workspace fixture with the given file layout and (optional)
 * `.testatlas/redaction-allowlist.txt` content.
 *
 * @param {Record<string,string>} layout map of relative path → file content
 * @param {string} [allowlist] plain-text allowlist content
 * @returns {Promise<string>} absolute path to the workspace root (acts as wsDir)
 */
async function makeWorkspace(layout, allowlist) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'tatlas-redact-'));
  // The check resolves the allowlist relative to wsDir → its parent is the
  // repo root (`<cwd>/`). The "wsDir" we pass to check() is `<cwd>` since
  // evidence/ lives directly under it in our fixtures.
  if (allowlist !== undefined) {
    await mkdir(path.join(cwd, '.testatlas'), { recursive: true });
    await writeFile(path.join(cwd, '.testatlas', 'redaction-allowlist.txt'), allowlist);
  }
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(cwd, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  return cwd;
}

/** Minimum-shape evidence sidecar (only fields the check reads). */
function sidecar({ id = 'EVIDENCE-001', redacted = true, capturePath = 'capture.bin' } = {}) {
  return JSON.stringify(
    {
      id,
      type: 'file',
      path: `evidence/${id}/${capturePath}`,
      capturedOn: '2026-05-05T00:00:00.000Z',
      environment: 'local',
      description: 'fixture',
      redacted,
    },
    null,
    2,
  );
}

test('check-evidence-redaction: clean evidence file → pass', async () => {
  const wsDir = await makeWorkspace({
    'evidence/EVIDENCE-001/evidence.json': sidecar(),
    'evidence/EVIDENCE-001/capture.bin': '[REDACTED] only placeholder text here\nno tokens\n',
  });
  const result = await check({ wsDir });
  assert.equal(result.id, 'check-evidence-redaction');
  assert.equal(result.status, 'pass');
  assert.equal(result.findings.length, 0);
});

test('check-evidence-redaction: AWS access-key leak → fail with TESTATLAS_REDACTION_LEAK', async () => {
  const wsDir = await makeWorkspace({
    'evidence/EVIDENCE-002/evidence.json': sidecar({ id: 'EVIDENCE-002' }),
    'evidence/EVIDENCE-002/capture.bin': 'leaked: AKIAIOSFODNN7EXAMPLE in body\n',
  });
  const result = await check({ wsDir });
  assert.equal(result.status, 'fail');
  const f = result.findings.find((x) => x.code === 'TESTATLAS_REDACTION_LEAK');
  assert.ok(f, `expected TESTATLAS_REDACTION_LEAK; got ${JSON.stringify(result.findings)}`);
  assert.match(f.message, /AWS_ACCESS_KEY/);
  assert.match(f.path, /EVIDENCE-002/);
});

test('check-evidence-redaction: GitHub PAT leak → fail', async () => {
  const wsDir = await makeWorkspace({
    'evidence/EVIDENCE-003/evidence.json': sidecar({ id: 'EVIDENCE-003' }),
    'evidence/EVIDENCE-003/capture.bin': `auth: ghp_${'a'.repeat(40)}\n`,
  });
  const result = await check({ wsDir });
  assert.equal(result.status, 'fail');
  const f = result.findings.find((x) => x.message.includes('GITHUB_TOKEN'));
  assert.ok(f);
});

test('check-evidence-redaction: JWT triple → fail', async () => {
  const wsDir = await makeWorkspace({
    'evidence/EVIDENCE-004/evidence.json': sidecar({ id: 'EVIDENCE-004' }),
    'evidence/EVIDENCE-004/capture.bin':
      'session: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c\n',
  });
  const result = await check({ wsDir });
  assert.equal(result.status, 'fail');
  const f = result.findings.find((x) => x.message.includes('JWT'));
  assert.ok(f);
});

test('check-evidence-redaction: allowlist exact-path entry suppresses leak → pass', async () => {
  const wsDir = await makeWorkspace(
    {
      'evidence/EVIDENCE-005/evidence.json': sidecar({ id: 'EVIDENCE-005' }),
      'evidence/EVIDENCE-005/capture.bin': 'leaked: AKIAIOSFODNN7EXAMPLE\n',
    },
    'evidence/EVIDENCE-005/capture.bin\n',
  );
  const result = await check({ wsDir });
  assert.equal(result.status, 'pass', JSON.stringify(result.findings));
  assert.equal(result.findings.length, 0);
});

test('check-evidence-redaction: glob `evidence/EVIDENCE-006/**` allowlist entry → pass', async () => {
  const wsDir = await makeWorkspace(
    {
      'evidence/EVIDENCE-006/evidence.json': sidecar({ id: 'EVIDENCE-006' }),
      'evidence/EVIDENCE-006/capture.bin': `gh: ghp_${'b'.repeat(40)}\n`,
    },
    '# fixtures intentionally contain example tokens\nevidence/EVIDENCE-006/**\n',
  );
  const result = await check({ wsDir });
  assert.equal(result.status, 'pass', JSON.stringify(result.findings));
});

test('check-evidence-redaction: OpenSSH private-key block → fail', async () => {
  const wsDir = await makeWorkspace({
    'evidence/EVIDENCE-007/evidence.json': sidecar({ id: 'EVIDENCE-007' }),
    'evidence/EVIDENCE-007/capture.bin':
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE\n-----END OPENSSH PRIVATE KEY-----\n',
  });
  const result = await check({ wsDir });
  assert.equal(result.status, 'fail');
  const f = result.findings.find((x) => x.message.includes('PRIVATE_KEY'));
  assert.ok(f);
});

test('check-evidence-redaction: redacted:false sidecar is NOT scanned → pass', async () => {
  // When redacted:false the producer is signalling "no secrets here"; the
  // scanner skips. (Self-attested-clean. The scanner only enforces the
  // self-attestation when the producer claims `redacted:true`.)
  const wsDir = await makeWorkspace({
    'evidence/EVIDENCE-008/evidence.json': sidecar({ id: 'EVIDENCE-008', redacted: false }),
    'evidence/EVIDENCE-008/capture.bin': 'AKIAIOSFODNN7EXAMPLE here, but redacted:false\n',
  });
  const result = await check({ wsDir });
  assert.equal(result.status, 'pass');
  assert.equal(result.findings.length, 0);
});
