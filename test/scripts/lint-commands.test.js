// test/scripts/lint-commands.test.js
//
// Quick 260508-pc0. RED → GREEN coverage for scripts/lint-commands.js,
// the doc-vs-truth invariant linter. Each invariant has at least one
// positive (no violation) and one negative (violation expected) case.
//
// Fixture strategy: every test creates a tempdir under os.tmpdir() with
// fixture commands/ + scripts/ + schemas/ trees, invokes the named
// export against the fixture roots, asserts violation count + first
// violation's `file`, `line`, `reason`, `suggestion` (where applicable).
//
// runLinter smoke test exercises the public entry point that
// scripts/lint-commands.js exposes as the wired-into-pnpm-test command.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  checkFlagExistence,
  checkFrontmatterScriptForm,
  checkLifecycleCompleteness,
  checkPathCanonicity,
  checkSchemaKeyExistence,
  runLinter,
} from '../../scripts/lint-commands.js';

// ─── Fixture helpers ────────────────────────────────────────────────────────

async function makeFixtureRoot(label) {
  const root = await mkdtemp(path.join(tmpdir(), `lint-commands-${label}-`));
  const commandsDir = path.join(root, 'commands');
  const scriptsDir = path.join(root, 'scripts');
  const schemasDir = path.join(root, 'schemas');
  await mkdir(commandsDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(schemasDir, { recursive: true });
  // Drop in a tiny canonical-paths.json local to fixtures so invariant 2
  // doesn't drag in the project's real one when the fixture wants to be
  // self-contained.
  return { root, commandsDir, scriptsDir, schemasDir };
}

async function writeCmd(commandsDir, name, body) {
  await writeFile(path.join(commandsDir, name), body, 'utf8');
}

async function writeScript(scriptsDir, name, body) {
  await writeFile(path.join(scriptsDir, name), body, 'utf8');
}

async function writeSchema(schemasDir, name, obj) {
  await writeFile(path.join(schemasDir, name), JSON.stringify(obj, null, 2), 'utf8');
}

// A canonical-paths config the fixtures share. The project's real
// canonical-paths.json lives at scripts/lib/canonical-paths.json — but for
// fixture isolation we hand a fresh copy directly to checkPathCanonicity.
const FIXTURE_CANONICAL = {
  patterns: [
    '_testatlas/flows/FLOW-*.{md,json}',
    '_testatlas/tests/runs/RUN-*.{md,json}',
  ],
  antiPatterns: [
    {
      match: '_testatlas/runs/',
      suggest: '_testatlas/tests/runs/',
      reason: 'test runs live under _testatlas/tests/runs/, not _testatlas/runs/',
    },
    {
      match: '_testatlas/flows/<slug>/',
      suggest: '_testatlas/flows/FLOW-<slug>.{md,json}',
      reason: 'flows are file pairs (FLOW-*.md + FLOW-*.json), not directories',
    },
  ],
};

// A minimal validate-brain-style script (only --cwd / --brain-dir / --suite-cwd)
const SCRIPT_VALIDATE_BRAIN = `#!/usr/bin/env node
function parseArgs(argv) {
  let cwd = process.cwd();
  let brainDir;
  let suiteCwd;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd' && i + 1 < argv.length) { cwd = argv[++i]; }
    else if (a === '--brain-dir' && i + 1 < argv.length) { brainDir = argv[++i]; }
    else if (a === '--suite-cwd' && i + 1 < argv.length) { suiteCwd = argv[++i]; }
  }
  return { cwd, brainDir, suiteCwd };
}
parseArgs(process.argv.slice(2));
`;

// A validate-workspace-style script with the canonical 9 flags (no --strict)
const SCRIPT_VALIDATE_WORKSPACE = `#!/usr/bin/env node
async function runCli(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') {} else if (a === '--cwd') {}
    else if (a === '--dry-run') {} else if (a === '--auto-heal') {}
    else if (a === '--apply') {} else if (a === '--apply-suggestions') {}
    else if (a === '--only' || a.startsWith('--only=')) {}
    else if (a === '--report' || a.startsWith('--report=')) {}
    else if (a === '--help' || a === '-h') {}
  }
}
runCli(process.argv.slice(2));
`;

// ─── Invariant 1: flag-existence ────────────────────────────────────────────

test('checkFlagExistence: POSITIVE — supported flags emit no violations', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('inv1-pos');
  await writeScript(scriptsDir, 'validate-workspace.js', SCRIPT_VALIDATE_WORKSPACE);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Run: `node .testatlas/scripts/validate-workspace.js --auto-heal`',
      '',
    ].join('\n'),
  );
  const violations = await checkFlagExistence({ commandsDir, scriptsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkFlagExistence: NEGATIVE — unknown flags emit one violation per flag', async () => {
  const { commandsDir, scriptsDir } = await makeFixtureRoot('inv1-neg');
  await writeScript(scriptsDir, 'validate-brain.js', SCRIPT_VALIDATE_BRAIN);
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Run: `node .testatlas/scripts/validate-brain.js --strict --report-only`',
      '',
    ].join('\n'),
  );
  const violations = await checkFlagExistence({ commandsDir, scriptsDir });
  assert.equal(violations.length, 2, `expected 2 violations, got: ${JSON.stringify(violations)}`);
  const flags = violations.map((v) => v.detail || v.reason).join(' ');
  assert.ok(/--strict/.test(flags), 'expected --strict to be flagged');
  assert.ok(/--report-only/.test(flags), 'expected --report-only to be flagged');
  assert.equal(violations[0].invariant, 'flag-existence');
  assert.equal(typeof violations[0].file, 'string');
  assert.equal(typeof violations[0].line, 'number');
});

// ─── Invariant 2: path-canonicity ───────────────────────────────────────────

test('checkPathCanonicity: POSITIVE — canonical _testatlas/tests/runs path passes', async () => {
  const { commandsDir } = await makeFixtureRoot('inv2-pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'Outputs go to `_testatlas/tests/runs/RUN-foo.md` and `_testatlas/flows/FLOW-bar.json`.',
      '',
    ].join('\n'),
  );
  const violations = await checkPathCanonicity({
    commandsDir,
    canonicalPaths: FIXTURE_CANONICAL,
  });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkPathCanonicity: NEGATIVE — anti-patterns surface with suggestions', async () => {
  const { commandsDir } = await makeFixtureRoot('inv2-neg');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '# Cmd',
      '',
      'See `_testatlas/runs/` for runs. Flows live in `_testatlas/flows/<slug>/`.',
      '',
    ].join('\n'),
  );
  const violations = await checkPathCanonicity({
    commandsDir,
    canonicalPaths: FIXTURE_CANONICAL,
  });
  assert.ok(violations.length >= 2, `expected >=2 violations, got: ${JSON.stringify(violations)}`);
  const reasons = violations.map((v) => v.detail || v.reason).join(' ');
  assert.ok(/_testatlas\/runs\//.test(reasons), 'expected _testatlas/runs/ flagged');
  assert.ok(/_testatlas\/flows\/<slug>\//.test(reasons), 'expected _testatlas/flows/<slug>/ flagged');
  assert.ok(violations.every((v) => typeof v.suggestion === 'string' && v.suggestion.length > 0));
  assert.equal(violations[0].invariant, 'path-canonicity');
});

// ─── Invariant 3: schema-key-existence ──────────────────────────────────────

test('checkSchemaKeyExistence: POSITIVE — counts.testRuns exists in schema', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('inv3-pos');
  await writeSchema(schemasDir, 'workspace-manifest.schema.json', {
    properties: {
      counts: {
        properties: {
          testRuns: { type: 'integer' },
          evidenceRecords: { type: 'integer' },
          reports: { type: 'integer' },
        },
      },
    },
  });
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Update `counts.testRuns` and `counts.evidenceRecords`.', ''].join('\n'),
  );
  const violations = await checkSchemaKeyExistence({ commandsDir, schemasDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkSchemaKeyExistence: NEGATIVE — counts.handoffs flagged with actual keys', async () => {
  const { commandsDir, schemasDir } = await makeFixtureRoot('inv3-neg');
  await writeSchema(schemasDir, 'workspace-manifest.schema.json', {
    properties: {
      counts: {
        properties: {
          testRuns: { type: 'integer' },
          evidenceRecords: { type: 'integer' },
          reports: { type: 'integer' },
        },
      },
    },
  });
  await writeCmd(
    commandsDir,
    'cmd.md',
    ['# Cmd', '', 'Bump `counts.handoffs` after run.', ''].join('\n'),
  );
  const violations = await checkSchemaKeyExistence({ commandsDir, schemasDir });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].invariant, 'schema-key-existence');
  assert.ok(/handoffs/.test(violations[0].detail || violations[0].reason));
  assert.ok(/testRuns/.test(violations[0].detail || ''));
});

// ─── Invariant 4: lifecycle-completeness ────────────────────────────────────

test('checkLifecycleCompleteness: POSITIVE — Lifecycle with update-brain hook passes', async () => {
  const { commandsDir } = await makeFixtureRoot('inv4-pos');
  await writeCmd(
    commandsDir,
    'good-cmd.md',
    [
      '# Good Cmd',
      '',
      '## Lifecycle',
      '',
      'Then run `node .testatlas/scripts/update-brain-after-command.js --command good-cmd --actor agent --status completed`.',
      '',
      '## Completion Criteria',
      '',
      '- All good.',
      '',
    ].join('\n'),
  );
  const violations = await checkLifecycleCompleteness({ commandsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkLifecycleCompleteness: NEGATIVE — missing hook on brain-writer (recompute) flags violation', async () => {
  const { commandsDir } = await makeFixtureRoot('inv4-neg');
  // "recompute counts.*" is the brain-writer signal — without the hook
  // this MUST flag.
  await writeCmd(
    commandsDir,
    'missing-hook.md',
    [
      '# Missing Hook',
      '',
      '## Lifecycle',
      '',
      '- Update `_testatlas/03_execution_status.md`.',
      '- Update `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.',
      '',
      '## Stop Conditions',
      '',
      '- None.',
      '',
    ].join('\n'),
  );
  const violations = await checkLifecycleCompleteness({ commandsDir });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].invariant, 'lifecycle-completeness');
  assert.match(violations[0].file, /missing-hook\.md$/);
});

test('checkLifecycleCompleteness: NON-BRAIN-WRITER — Lifecycle without recompute or evidence is not flagged', async () => {
  const { commandsDir } = await makeFixtureRoot('inv4-nonwriter');
  // Pure housekeeping Lifecycle — no recompute, no _testatlas/evidence —
  // the hook is NOT required. This protects commands like cleanup,
  // uninstall, update, bootstrap from spurious flags.
  await writeCmd(
    commandsDir,
    'housekeeping.md',
    [
      '# Housekeeping',
      '',
      '## Lifecycle',
      '',
      '- Update `_testatlas/03_execution_status.md`.',
      '- Update `_testatlas/09_artifact_index.md`.',
      '- Update `_testatlas/10_command_log.md`.',
      '',
      '## Stop Conditions',
      '',
      '- None.',
      '',
    ].join('\n'),
  );
  const violations = await checkLifecycleCompleteness({ commandsDir });
  assert.equal(
    violations.length,
    0,
    `non-brain-writer must not be flagged, got: ${JSON.stringify(violations)}`,
  );
});

test('checkLifecycleCompleteness: ALLOWLIST — umbrella commands skipped', async () => {
  const { commandsDir } = await makeFixtureRoot('inv4-allow');
  await writeCmd(
    commandsDir,
    'explore.md',
    [
      '# Explore (umbrella)',
      '',
      '## Lifecycle',
      '',
      '- Update `_testatlas/03_execution_status.md`.',
      '',
      '## Completion Criteria',
      '',
      '- Children own brain writes.',
      '',
    ].join('\n'),
  );
  const violations = await checkLifecycleCompleteness({ commandsDir });
  assert.equal(
    violations.length,
    0,
    `umbrella commands must be allowlisted, got: ${JSON.stringify(violations)}`,
  );
});

// ─── Invariant 5: frontmatter-script-form ───────────────────────────────────

test('checkFrontmatterScriptForm: POSITIVE — canonical node .testatlas/scripts/ form passes', async () => {
  const { commandsDir } = await makeFixtureRoot('inv5-pos');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '---',
      'description: Wraps `node .testatlas/scripts/create-persona.js` for persona drafting.',
      '---',
      '',
      '# Cmd',
      '',
    ].join('\n'),
  );
  const violations = await checkFrontmatterScriptForm({ commandsDir });
  assert.equal(violations.length, 0, `expected no violations, got: ${JSON.stringify(violations)}`);
});

test('checkFrontmatterScriptForm: NEGATIVE — bare scripts/ form in description flags violation', async () => {
  const { commandsDir } = await makeFixtureRoot('inv5-neg');
  await writeCmd(
    commandsDir,
    'cmd.md',
    [
      '---',
      'description: Wraps `scripts/create-persona.js` for persona drafting.',
      '---',
      '',
      '# Cmd',
      '',
    ].join('\n'),
  );
  const violations = await checkFrontmatterScriptForm({ commandsDir });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].invariant, 'frontmatter-script-form');
  assert.match(violations[0].file, /cmd\.md$/);
});

// ─── runLinter smoke ────────────────────────────────────────────────────────

test('runLinter: returns { violations, exitCode } shape', async () => {
  const { commandsDir, scriptsDir, schemasDir } = await makeFixtureRoot('runlint');
  await writeScript(scriptsDir, 'validate-brain.js', SCRIPT_VALIDATE_BRAIN);
  await writeSchema(schemasDir, 'workspace-manifest.schema.json', {
    properties: { counts: { properties: { testRuns: {}, evidenceRecords: {}, reports: {} } } },
  });
  // Clean fixture: canonical command with the brain hook + supported flags only.
  await writeCmd(
    commandsDir,
    'good.md',
    [
      '---',
      'description: `node .testatlas/scripts/validate-brain.js --cwd .` wrapper.',
      '---',
      '',
      '# Good',
      '',
      '## Lifecycle',
      '',
      'Run `node .testatlas/scripts/update-brain-after-command.js --command good --actor agent --status completed`.',
      '',
    ].join('\n'),
  );
  const r = await runLinter({
    commandsDir,
    scriptsDir,
    schemasDir,
    canonicalPaths: FIXTURE_CANONICAL,
    quiet: true,
  });
  assert.ok(Array.isArray(r.violations), 'violations is array');
  assert.equal(typeof r.exitCode, 'number');
  assert.equal(r.exitCode, 0);
});
