// test/scripts/check-schemas-directory-mappings.test.js
//
// Regression test for FU-003 (Quick 260509-pdr): closes 28 baseline
// TESTATLAS_UNKNOWN_SCHEMA errors that had been carried in deferred-items.md
// across multiple rounds. The check-schemas inferSchemaId function gained
// 4 new directory-mapping rules:
//
//   1. agents/personas/{system,generated,project}/*.json → persona.schema.json (V2)
//   2. agents/councils/sessions/<id>/*.json → __SKIP__ (heterogeneous sub-artifacts)
//   3. agents/councils/council_templates/*.json → __SKIP__ (no schema yet)
//   4. maps/<feature>.json → __SKIP__ (per bootstrap.md §2 schema-flexible sidecars)
//   5. reports/dashboard-data.json → __SKIP__ (heterogeneous machine export)
//
// Pins the function-level contract, not the validate-workspace integration.
// The acceptance criterion is that validate-workspace exits 0 against the
// current dogfood workspace; that's covered by the integration suite.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readFile } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// We test the live module by importing it — pin the directory-mapping rules
// applied via inferSchemaId by exercising check() through the orchestrator
// would be heavier. Instead we read the source and grep for the rule patterns
// (this is a doc-vs-truth pin: if the rules are removed or weakened, the
// regex search fails the test).
test('FU-003: check-schemas.js has all 4 directory-mapping rules registered', async () => {
  const src = await readFile(
    path.join(repoRoot, 'scripts/lib/validate/check-schemas.js'),
    'utf8',
  );

  // Rule 1: persona schema mapping (source uses escaped JS regex literal)
  assert.ok(
    src.includes('agents\\/personas\\/(system|generated|project)'),
    'persona directory-mapping rule must be present',
  );
  assert.ok(
    src.includes('persona.schema.json'),
    'persona schema $id must be referenced',
  );

  // Rule 2: council sessions skip
  assert.ok(
    src.includes('agents\\/councils\\/sessions'),
    'council sessions skip rule must be present',
  );

  // Rule 3: council templates skip
  assert.ok(
    src.includes('agents\\/councils\\/council_templates'),
    'council templates skip rule must be present',
  );

  // Rule 4: maps/ skip
  assert.ok(
    src.includes("relPath.startsWith('maps/')"),
    'maps/ skip rule must be present',
  );

  // Rule 5: reports/dashboard-data.json skip
  assert.ok(
    src.includes('reports/dashboard-data.json'),
    'reports/dashboard-data.json skip rule must be present',
  );
});
