// test/scripts/sync-system-map.test.js
//
// Quick 260505-wjp Task 3 (G5): RED→GREEN tests for sync-system-map
// (regenerator for 01_system_map.md's source-references + domain-index
// generated sections).

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parseMarkers } from '../../scripts/lib/markers.js';
import { syncSystemMap } from '../../scripts/lib/sync/sync-system-map.js';
import { makeValidationFixture } from '../_helpers.js';

const TEMPLATE_BODY = [
  '# 01 System Map',
  '',
  '## Evidence and Source References',
  '',
  '<!-- TESTATLAS:GENERATED:START section="source-references" -->',
  '(no source references collected yet)',
  '<!-- TESTATLAS:GENERATED:END section="source-references" -->',
  '',
  '## Domain Index',
  '',
  '<!-- TESTATLAS:GENERATED:START section="domain-index" -->',
  '(no domains mapped yet)',
  '<!-- TESTATLAS:GENERATED:END section="domain-index" -->',
  '',
].join('\n');

async function seedSystemMap(wsDir) {
  await writeFile(path.join(wsDir, '01_system_map.md'), TEMPLATE_BODY);
}

test('sync-system-map: populates source-references with bullets when evidence/explore-codebase/<ts>/ exists', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await seedSystemMap(fx.wsDir);

  const evdir = path.join(fx.wsDir, 'evidence', 'explore-codebase', '20260505T120000Z');
  await mkdir(evdir, { recursive: true });
  await writeFile(path.join(evdir, 'manifest.json'), '{}');
  await writeFile(path.join(evdir, 'routes.txt'), 'GET /\n');

  const r = await syncSystemMap({ wsDir: fx.wsDir });
  assert.equal(r.wrote, true);

  const text = await readFile(path.join(fx.wsDir, '01_system_map.md'), 'utf8');
  const { sections } = parseMarkers(text);
  const src = sections.get('source-references').contentLines.join('\n');
  assert.match(src, /manifest\.json/);
  assert.match(src, /routes\.txt/);
  // Hashes returned and 64-hex
  assert.match(r.hashes['source-references'], /^[0-9a-f]{64}$/);
  assert.match(r.hashes['domain-index'], /^[0-9a-f]{64}$/);
});

test('sync-system-map: populates domain-index with one bullet per on-disk domain', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  await seedSystemMap(fx.wsDir);

  // _base-good already has domains/auth — seed two more for the bullet count
  const dir2 = path.join(fx.wsDir, 'domains', 'billing');
  await mkdir(dir2, { recursive: true });
  await writeFile(
    path.join(dir2, 'domain.json'),
    JSON.stringify({
      $schema: 'https://testatlas.dev/schemas/v1/domain.schema.json',
      id: 'domain-billing',
      slug: 'billing',
      name: 'Billing',
      routes: ['/checkout'],
      apis: [],
      components: [],
    }),
  );

  await syncSystemMap({ wsDir: fx.wsDir });
  const text = await readFile(path.join(fx.wsDir, '01_system_map.md'), 'utf8');
  const { sections } = parseMarkers(text);
  const di = sections.get('domain-index').contentLines.join('\n');
  // Must mention both domains
  assert.match(di, /billing/);
  // _base-good has at least one domain too
  const bullets = di.split('\n').filter((l) => l.trim().startsWith('- domains/'));
  assert.ok(bullets.length >= 2, `expected ≥2 domain bullets, got ${bullets.length}: ${di}`);
});

test('sync-system-map: missing domain-index marker → throws TESTATLAS_SECTION_NOT_FOUND', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);
  // Seed WITHOUT the domain-index marker pair
  await writeFile(
    path.join(fx.wsDir, '01_system_map.md'),
    [
      '# 01 System Map',
      '',
      '<!-- TESTATLAS:GENERATED:START section="source-references" -->',
      '(no source references collected yet)',
      '<!-- TESTATLAS:GENERATED:END section="source-references" -->',
      '',
    ].join('\n'),
  );

  await assert.rejects(
    () => syncSystemMap({ wsDir: fx.wsDir }),
    (err) => /domain-index/.test(err.message) || err.code === 'TESTATLAS_SECTION_NOT_FOUND',
  );
});
