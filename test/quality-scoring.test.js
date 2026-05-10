// test/quality-scoring.test.js
//
// Plan 14-06 Task 1 — end-to-end quality scoring contract:
//   - scores validate against quality_score.schema.json
//   - report-domain.md and report-release.md commands exist with required structure
//   - quality_scores.md template carries TESTATLAS:GENERATED markers
//   - release_readiness.md template carries TESTATLAS:GENERATED markers

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'score-quality.js');

async function minimalBrain() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-quality-scoring-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();
  const writeJson = (n, b) => writeFile(path.join(brainDir, n), JSON.stringify(b, null, 2));
  await writeJson('manifest.json', {
    schema_version: '2.0.0',
    suite_version: '2.0.0',
    initialized_at: now,
    last_updated: now,
    project_name: 'fixture',
    adapters: [],
    schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
  });
  await writeJson('state.json', {
    schema_version: '2.0.0',
    last_updated: now,
    counts: { domains: 0, flows: 0, issues: 0, evidence: 0 },
    last_command: 'init',
  });
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: written quality_scores.json validates against quality_score.schema.json', async () => {
  const ctx = await minimalBrain();
  try {
    const { scoreQuality } = await import(pathToFileURL(SCRIPT).href);
    await scoreQuality({ cwd: ctx.dir });
    const out = JSON.parse(
      await readFile(path.join(ctx.dir, '_testatlas', 'brain', 'quality_scores.json'), 'utf8'),
    );
    const { loadAllSchemas } = await import(
      path.join(REPO_ROOT, 'scripts', 'lib', 'schema-loader.js')
    );
    const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
    const v = ajv.getSchema('https://testatlas.dev/schemas/v2/quality_score.schema.json');
    assert.ok(v, 'quality_score schema not registered');
    for (const s of out.scores) {
      const ok = v(s);
      if (!ok) {
        throw new Error(
          `score record failed schema: ${JSON.stringify(s)}\nerrors=${JSON.stringify(v.errors)}`,
        );
      }
    }
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: brain-score command exists with required structure', async () => {
  const cmd = path.join(REPO_ROOT, '.testatlas', 'commands', 'brain', 'brain-score.md');
  const text = await readFile(cmd, 'utf8');
  assert.match(text, /command:\s*brain-score/);
  assert.match(text, /score-quality\.js/);
  assert.match(text, /bootstrap\.md/);
});

test('Test 3: brain-drift command file exists (forward-ref ok at this stage)', async () => {
  const cmd = path.join(REPO_ROOT, '.testatlas', 'commands', 'brain', 'brain-drift.md');
  const text = await readFile(cmd, 'utf8');
  assert.match(text, /command:\s*brain-drift/);
  assert.match(text, /detect-drift\.js/);
});

test('Test 4: report-domain command produces a domain-scoped report', async () => {
  const cmd = path.join(REPO_ROOT, '.testatlas', 'commands', 'report', 'report-domain.md');
  const text = await readFile(cmd, 'utf8');
  assert.match(text, /command:\s*report-domain/);
  assert.match(text, /quality_scores\.json/);
  assert.match(text, /domain/i);
});

test('Test 5: report-release command produces release readiness with go/no-go', async () => {
  const cmd = path.join(REPO_ROOT, '.testatlas', 'commands', 'report', 'report-release.md');
  const text = await readFile(cmd, 'utf8');
  assert.match(text, /command:\s*report-release/);
  assert.match(text, /go.*no.?go|release[_ -]readiness/i);
  assert.match(text, /drift\.json|quality_scores\.json/);
});

test('Test 6: report templates carry TESTATLAS:GENERATED markers', async () => {
  for (const name of ['quality_scores.md', 'release_readiness.md']) {
    const p = path.join(REPO_ROOT, '.testatlas', 'templates', 'reports', name);
    const text = await readFile(p, 'utf8');
    assert.match(text, /TESTATLAS:GENERATED:START/, `${name} missing START marker`);
    assert.match(text, /TESTATLAS:GENERATED:END/, `${name} missing END marker`);
  }
});
