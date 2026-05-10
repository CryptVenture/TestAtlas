// test/extract-claims.test.js
//
// Plan 14-04 Task 2 — extract-claims.js parses transcript.jsonl and produces
// claims.jsonl with proper PRD §7.10 classification.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'extract-claims.js');

async function setupSession({ transcript = [] } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-extract-claims-'));
  const wsDir = path.join(dir, '_testatlas');
  const sessionId = 'COUNCIL-2026-05-07-001';
  const sessionDir = path.join(wsDir, 'agents', 'councils', 'sessions', sessionId);
  await mkdir(path.join(wsDir, 'brain'), { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, 'transcript.jsonl'),
    transcript.map((t) => JSON.stringify(t)).join('\n') + (transcript.length ? '\n' : ''),
  );
  return {
    dir,
    wsDir,
    sessionDir,
    sessionId,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test('Test 1: extractClaims emits claims.jsonl with PRD §7.10 classification', async () => {
  const ctx = await setupSession({
    transcript: [
      {
        id: 'MSG-000001',
        session_id: 'COUNCIL-2026-05-07-001',
        round: 3,
        speaker: 'qa-lead',
        speaker_type: 'persona',
        timestamp: '2026-05-07T10:00:00Z',
        message_type: 'finding',
        content:
          'CLAIM[observed]: The login form lacks CSRF protection. Evidence: _testatlas/evidence/explore-security/login-form.png',
        claims: [],
        evidence: ['_testatlas/evidence/explore-security/login-form.png'],
        confidence: 'confirmed',
      },
      {
        id: 'MSG-000002',
        session_id: 'COUNCIL-2026-05-07-001',
        round: 3,
        speaker: 'security-privacy-reviewer',
        speaker_type: 'persona',
        timestamp: '2026-05-07T10:01:00Z',
        message_type: 'finding',
        content:
          'CLAIM[inferred]: Without CSRF, the form is vulnerable to cross-origin POST attacks.',
        claims: [],
        evidence: [],
        confidence: 'strong_suspect',
      },
    ],
  });
  try {
    const { extractClaims } = await import(pathToFileURL(SCRIPT).href);
    const r = await extractClaims({
      cwd: ctx.dir,
      sessionId: ctx.sessionId,
    });
    assert.equal(r.ok, true);
    assert.equal(r.count, 2);
    const text = await readFile(path.join(ctx.sessionDir, 'claims.jsonl'), 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const c1 = JSON.parse(lines[0]);
    assert.match(c1.id, /^CLAIM-\d+$/);
    assert.equal(c1.session_id, 'COUNCIL-2026-05-07-001');
    assert.equal(c1.speaker, 'qa-lead');
    assert.equal(c1.type, 'observed');
    assert.equal(c1.confidence, 'confirmed');
    assert.equal(c1.status, 'pending');
    assert.deepEqual(c1.evidence, ['_testatlas/evidence/explore-security/login-form.png']);
    const c2 = JSON.parse(lines[1]);
    assert.equal(c2.type, 'inferred');
    assert.equal(c2.confidence, 'strong_suspect');
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: extractClaims appends to existing claims.jsonl (idempotent IDs)', async () => {
  const ctx = await setupSession({
    transcript: [
      {
        id: 'MSG-000001',
        session_id: 'COUNCIL-2026-05-07-001',
        round: 1,
        speaker: 'qa-lead',
        speaker_type: 'persona',
        timestamp: '2026-05-07T10:00:00Z',
        message_type: 'finding',
        content: 'CLAIM[observed]: First claim.',
        claims: [],
        evidence: [],
        confidence: 'confirmed',
      },
    ],
  });
  try {
    // Pre-populate with an existing claim using ID CLAIM-0042.
    await writeFile(
      path.join(ctx.sessionDir, 'claims.jsonl'),
      JSON.stringify({
        id: 'CLAIM-0042',
        session_id: 'COUNCIL-2026-05-07-001',
        speaker: 'product-strategist',
        type: 'observed',
        claim: 'pre-existing claim',
        confidence: 'confirmed',
        evidence: [],
        related_domains: [],
        related_flows: [],
        status: 'pending',
        created_at: '2026-05-07T09:00:00Z',
      }) + '\n',
    );
    const { extractClaims } = await import(pathToFileURL(SCRIPT).href);
    const r = await extractClaims({ cwd: ctx.dir, sessionId: ctx.sessionId });
    assert.equal(r.ok, true);
    const text = await readFile(path.join(ctx.sessionDir, 'claims.jsonl'), 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const second = JSON.parse(lines[1]);
    // New claim ID must be > 0042.
    const nMatch = /^CLAIM-(\d+)$/.exec(second.id);
    assert.ok(nMatch && Number(nMatch[1]) > 42, `new claim id ${second.id} must be > 42`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: claims.jsonl validates against claim.schema.json', async () => {
  const ctx = await setupSession({
    transcript: [
      {
        id: 'MSG-000001',
        session_id: 'COUNCIL-2026-05-07-001',
        round: 2,
        speaker: 'qa-lead',
        speaker_type: 'persona',
        timestamp: '2026-05-07T10:00:00Z',
        message_type: 'finding',
        content: 'CLAIM[observed]: A claim.',
        claims: [],
        evidence: ['_testatlas/evidence/x.png'],
        confidence: 'confirmed',
      },
    ],
  });
  try {
    const { extractClaims } = await import(pathToFileURL(SCRIPT).href);
    await extractClaims({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const text = await readFile(path.join(ctx.sessionDir, 'claims.jsonl'), 'utf8');
    const claim = JSON.parse(text.trim().split('\n')[0]);
    const { loadAllSchemas } = await import(
      path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')
    );
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const validate = ajv.getSchema('https://testatlas.dev/schemas/v2/claim.schema.json');
    assert.ok(validate, 'claim schema must be registered');
    const ok = validate(claim);
    assert.ok(ok, `claim.jsonl line failed schema: ${JSON.stringify(validate.errors)}`);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 4: missing transcript file errors out', async () => {
  const ctx = await setupSession({ transcript: [] });
  try {
    // Remove the transcript file we just wrote.
    await rm(path.join(ctx.sessionDir, 'transcript.jsonl'));
    const { extractClaims } = await import(pathToFileURL(SCRIPT).href);
    await assert.rejects(extractClaims({ cwd: ctx.dir, sessionId: ctx.sessionId }), (e) =>
      /transcript|missing/i.test(e.message),
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 5: links related domains and flows when content references them', async () => {
  const ctx = await setupSession({
    transcript: [
      {
        id: 'MSG-000001',
        session_id: 'COUNCIL-2026-05-07-001',
        round: 1,
        speaker: 'qa-lead',
        speaker_type: 'persona',
        timestamp: '2026-05-07T10:00:00Z',
        message_type: 'finding',
        content: 'CLAIM[observed]: Issue in domain-onboarding affecting FLOW-onboarding-first-run.',
        claims: [],
        evidence: [],
        confidence: 'confirmed',
      },
    ],
  });
  try {
    const { extractClaims } = await import(pathToFileURL(SCRIPT).href);
    await extractClaims({ cwd: ctx.dir, sessionId: ctx.sessionId });
    const claim = JSON.parse(
      (await readFile(path.join(ctx.sessionDir, 'claims.jsonl'), 'utf8')).trim().split('\n')[0],
    );
    assert.ok(
      claim.related_domains.includes('domain-onboarding'),
      `expected related_domains to include domain-onboarding, got ${JSON.stringify(claim.related_domains)}`,
    );
    assert.ok(
      claim.related_flows.includes('FLOW-onboarding-first-run'),
      `expected related_flows to include FLOW-onboarding-first-run, got ${JSON.stringify(claim.related_flows)}`,
    );
  } finally {
    await ctx.cleanup();
  }
});
