// VAL-06 E2E smoke scaffold test.
//
// Phase 5 (this plan) state: .github/workflows/e2e-smoke.yml ships with the
// install + dogfood steps `if: false`-skipped; the validate-workspace step
// runs always. This test asserts that documented contract holds.
//
// Phase 7 state: scripts/install.js ships → the install step's `if: false`
// is removed. This test detects the runtime presence and asserts the skip is
// gone.
//
// Phase 8 state: examples/node-api/ ships → the dogfood-loop step's
// `if: false` is removed. Same auto-detection logic.
//
// No rewrite is needed when Phases 7 + 8 land — they only edit
// e2e-smoke.yml itself.

import { strict as assert } from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const e2ePath = path.join(repoRoot, '.github', 'workflows', 'e2e-smoke.yml');
const installScriptPath = path.join(repoRoot, 'scripts', 'install.js');
const examplesNodeApiPath = path.join(repoRoot, 'examples', 'node-api');

const exists = async (p) => (await stat(p).catch(() => null)) !== null;

test('e2e-smoke.yml exists and parses as a single-document YAML file', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  assert.ok(yamlText.length > 0, '.github/workflows/e2e-smoke.yml must not be empty');

  // Top-level YAML keys we expect (string-grep, per CI workflow conventions).
  assert.match(yamlText, /^name:\s*E2E Smoke/m, 'workflow must declare name: E2E Smoke');
  assert.match(yamlText, /^on:/m, 'workflow must declare an `on:` block');
  assert.match(yamlText, /^jobs:/m, 'workflow must declare a `jobs:` block');
  assert.match(yamlText, /e2e-smoke:/, 'workflow must define an e2e-smoke job');
});

test('e2e-smoke.yml header documents the Phase 7 + Phase 8 skip-removal contract', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  // The header comment block (top of file) must reference Phase 7 + Phase 8
  // as the closure phases that remove the `if: false` skips. Future planners
  // grep for these strings to find the contract.
  assert.match(yamlText, /Phase 7/, 'header must reference Phase 7 (install path)');
  assert.match(yamlText, /Phase 8/, 'header must reference Phase 8 (examples)');
  assert.match(yamlText, /TODO Phase 7/, 'header must include `TODO Phase 7` grep marker');
  assert.match(yamlText, /TODO Phase 8/, 'header must include `TODO Phase 8` grep marker');
});

test('e2e-smoke.yml contains the documented step sequence', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  // The three CI-defined step names that make up the smoke sequence.
  // We match the YAML step DECLARATION (`- name: …`) — not occurrences of the
  // step name in header comment lines — so this is robust to documentation
  // edits that mention the step names.
  const stepDecls = [
    /^\s+- name: Install TestAtlas suite/m,
    /^\s+- name: Run minimum dogfood loop/m,
    /^\s+- name: Validate suite-repo placeholder workspace/m,
  ];
  let cursor = 0;
  for (const decl of stepDecls) {
    const m = decl.exec(yamlText.slice(cursor));
    assert.ok(m, `e2e-smoke.yml must declare a step matching ${decl}`);
    cursor += m.index + m[0].length;
  }
});

/**
 * Slice the YAML text from a step's `- name:` declaration through (but not
 * including) the next step's `- name:` declaration. This isolates each
 * step's body — its `if:`, `run:`, and any comments — without bleeding into
 * adjacent steps or header comment blocks.
 *
 * @param {string} yamlText
 * @param {string} stepName
 * @returns {string}
 */
function sliceStepBody(yamlText, stepName) {
  const stepRe = new RegExp(
    `^\\s+- name: ${stepName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}.*$`,
    'm',
  );
  const start = stepRe.exec(yamlText);
  if (!start) return '';
  const startIdx = start.index;
  // The next step starts at the next `- name:` declaration (same indent).
  const nextRe = /^\s+- name: /gm;
  nextRe.lastIndex = startIdx + start[0].length;
  const next = nextRe.exec(yamlText);
  const endIdx = next ? next.index : yamlText.length;
  return yamlText.slice(startIdx, endIdx);
}

test('e2e-smoke.yml install step is `if: false`-skipped iff Phase 7 has not shipped', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  const installShipped = await exists(installScriptPath);
  const block = sliceStepBody(yamlText, 'Install TestAtlas suite');
  assert.ok(block.length > 0, 'install step must exist');
  assert.match(block, /run:/, 'install step must define a `run:` directive');

  if (!installShipped) {
    // Phase 5 state: scripts/install.js does NOT exist; the step MUST be skipped.
    assert.match(
      block,
      /if:\s*false/,
      'Phase 5: install step must be `if: false`-skipped (scripts/install.js does not yet exist)',
    );
  } else {
    // Phase 7 state: scripts/install.js exists; the skip MUST be removed.
    assert.doesNotMatch(
      block,
      /^\s*if:\s*false/m,
      "Phase 7: scripts/install.js exists, so install step's `if: false` MUST be removed",
    );
  }
});

test('e2e-smoke.yml dogfood-loop step is `if: false`-skipped iff Phase 8 plan 08-04 has not shipped the CI matrix', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  // Plan 08-04 replaces the legacy "Run minimum dogfood loop" step with the
  // regenerate+validate matrix. Until then the step stays `if: false`-skipped
  // even though examples now exist (plan 08-01 ships them; CI wiring is 08-04).
  // Detect plan 08-04 having shipped by looking for the regenerate-example
  // command in the workflow.
  const ciMatrixShipped = /scripts\/regenerate-example\.js/.test(yamlText);
  const block = sliceStepBody(yamlText, 'Run minimum dogfood loop');
  assert.ok(block.length > 0, 'dogfood-loop step must exist');
  assert.match(block, /run:/, 'dogfood-loop step must define a `run:` directive');

  if (!ciMatrixShipped) {
    assert.match(
      block,
      /if:\s*false/,
      'dogfood-loop step must remain `if: false`-skipped until plan 08-04 wires the regenerate+validate matrix',
    );
  } else {
    assert.doesNotMatch(
      block,
      /^\s*if:\s*false/m,
      "Plan 08-04 shipped the CI matrix; dogfood-loop step's `if: false` MUST be removed",
    );
  }
});

test('e2e-smoke.yml validate-workspace step is always-runs (no `if:` modifier)', async () => {
  const yamlText = await readFile(e2ePath, 'utf8');
  const block = sliceStepBody(yamlText, 'Validate suite-repo placeholder workspace');
  assert.ok(block.length > 0, 'validate-workspace step must exist');
  assert.match(block, /run:/, 'validate-workspace step must define a `run:` directive');
  // Must NOT carry an `if:` directive on the step itself.
  assert.doesNotMatch(
    block,
    /^\s*if:\s/m,
    'validate-workspace step must NOT carry an `if:` directive (it always runs from Phase 5 onward)',
  );
  // Must invoke validate-workspace.js against the meta-workspace.
  assert.match(
    block,
    /node scripts\/validate-workspace\.js --workspace \.testatlas\/test-workspace/,
    'validate-workspace step must invoke validate-workspace.js --workspace .testatlas/test-workspace',
  );
});
