// test/examples/mobile-web-hybrid-regenerate.test.js
//
// Plan 08-02 Task 3 — examples/mobile-web-hybrid/ regenerate-clean assertions.
// This example ships STRUCTURE-ONLY (Pitfall 4 in 08-RESEARCH §12); CI never
// runs `expo run:ios|android`. The README documents the caveat.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { loadAndValidateScript } from '../../scripts/lib/regenerate-core.js';
import { loadAllSchemas } from '../../scripts/lib/schema-loader.js';
import { REPO_ROOT, runRegenerate, snapshotTree } from './_helpers.js';

const EXAMPLE = path.join(REPO_ROOT, 'examples', 'mobile-web-hybrid');
const WS = path.join(EXAMPLE, '_testatlas');

test('mobile-web-hybrid: regenerate --check exits 0 (no drift)', async () => {
  const r = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:${r.stdout}\nstderr:${r.stderr}`);
});

test('mobile-web-hybrid: regenerate is idempotent — write then --check both exit 0', async (t) => {
  // Snapshot to tmpdir to avoid racing with the *-validate.test.js companion
  // that reads from the same checked-in path concurrently.
  const { snapshot, cleanup } = await snapshotTree(EXAMPLE);
  t.after(cleanup);
  const r1 = await runRegenerate(snapshot);
  assert.equal(r1.code, 0);
  const r2 = await runRegenerate(snapshot, { check: true });
  assert.equal(r2.code, 0, `idempotent --check after write; stderr:${r2.stderr}`);
});

test('mobile-web-hybrid: fixture validates against example-script.schema.json', async () => {
  const ajv = await loadAllSchemas({ cwd: REPO_ROOT });
  const script = await loadAndValidateScript(
    path.join(EXAMPLE, '_testatlas-fixture', 'example-script.json'),
    ajv,
  );
  assert.equal(script.exampleName, 'mobile-web-hybrid');
});

test('mobile-web-hybrid: validate-workspace exits 0 against the checked-in _testatlas', async () => {
  const code = await new Promise((resolve, reject) => {
    const c = spawn(
      'node',
      [path.join(REPO_ROOT, 'scripts/validate-workspace.js'), '--workspace', WS],
      { cwd: REPO_ROOT, stdio: 'ignore' },
    );
    c.on('error', reject);
    c.on('close', (n) => resolve(n ?? 0));
  });
  assert.equal(code, 0);
});

test('mobile-web-hybrid: _testatlas has ≥10 mappable concerns (domains + flows)', async () => {
  const domainEntries = await readdir(path.join(WS, 'domains'));
  const flowEntries = (await readdir(path.join(WS, 'flows'))).filter(
    (n) => n.startsWith('FLOW-') && n.endsWith('.json'),
  );
  const total = domainEntries.length + flowEntries.length;
  assert.ok(
    total >= 10,
    `expected ≥10 domains+flows combined, got ${total} (${domainEntries.length} domains, ${flowEntries.length} flows)`,
  );
});

test('mobile-web-hybrid: package.json declares expo + expo-router + private:true + Node 20.11+', async () => {
  const pkg = JSON.parse(await readFile(path.join(EXAMPLE, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.match(pkg.engines.node, /20\.11/);
  assert.ok(pkg.dependencies?.expo, 'expo dependency required');
  assert.ok(pkg.dependencies?.['expo-router'], 'expo-router dependency required');
  assert.ok(pkg.dependencies?.react, 'react dependency required');
  assert.ok(pkg.dependencies?.['react-native'], 'react-native dependency required');
});

test('mobile-web-hybrid: README documents structure-only caveat per Pitfall 4', async () => {
  const readme = await readFile(path.join(EXAMPLE, 'README.md'), 'utf8');
  assert.ok(/structure/i.test(readme), 'README must mention "structure" (case-insensitive)');
  assert.ok(
    /full native build requires/i.test(readme),
    'README must contain literal "full native build requires" caveat (case-insensitive)',
  );
});

test('mobile-web-hybrid: project does NOT contain node_modules/ (structure-only — no install)', async () => {
  await assert.rejects(() => stat(path.join(EXAMPLE, 'node_modules')), { code: 'ENOENT' });
});
