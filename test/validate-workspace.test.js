// test/validate-workspace.test.js
//
// Plan 05-02 (Wave 1). Integration tests for the validate-workspace
// orchestrator + walk-workspace + reporter.
//
// Strategy: each test synthesizes its own _testatlas/ workspace by calling
// initWorkspace() against a tmpdir-backed `makeWorkspaceFixture`. This avoids
// any dependency on Plan 05-01's broken-* fixture catalog (which lands
// in parallel) and keeps Wave 1 disjoint.

import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { initWorkspace } from '../scripts/init-workspace.js';
import { renderJsonReport, renderMarkdownReport } from '../scripts/lib/validate/reporter.js';
import { walkWorkspace } from '../scripts/lib/validate/walk-workspace.js';
import { validateWorkspace } from '../scripts/validate-workspace.js';
import { makeWorkspaceFixture } from './_helpers.js';

/**
 * Helper: bootstrap a TestAtlas workspace under a tmpdir-backed cwd so the
 * orchestrator has a real wsDir + manifest to read.
 */
async function makeInitializedWorkspace() {
  const fx = await makeWorkspaceFixture();
  const r = await initWorkspace({ cwd: fx.cwd });
  return { ...fx, wsDir: r.wsDir };
}

// ─── walk-workspace tests ────────────────────────────────────────────────────

test('walkWorkspace: returns all 14 canonicalFiles present:true on a fresh init', async () => {
  const { wsDir, cleanup } = await makeInitializedWorkspace();
  try {
    const files = await walkWorkspace(wsDir);
    assert.equal(files.canonicalFiles.size, 14);
    for (const [name, rec] of files.canonicalFiles) {
      assert.equal(rec.present, true, `${name} should be present`);
    }
  } finally {
    await cleanup();
  }
});

test('walkWorkspace: empty workspace minus a canonical file flags it as not present', async () => {
  const { wsDir, cleanup } = await makeInitializedWorkspace();
  try {
    // Remove one canonical file post-init.
    await rm(path.join(wsDir, '02_test_strategy.md'));
    const files = await walkWorkspace(wsDir);
    assert.equal(files.canonicalFiles.get('02_test_strategy.md').present, false);
    assert.equal(files.canonicalFiles.get('00_overview.md').present, true);
  } finally {
    await cleanup();
  }
});

test('walkWorkspace: captures parseError on malformed JSON', async () => {
  const { wsDir, cleanup } = await makeInitializedWorkspace();
  try {
    // Drop a malformed evidence.json under evidence/EVID-001/.
    const dir = path.join(wsDir, 'evidence', 'EVID-001');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'evidence.json'), '{ invalid json');
    const files = await walkWorkspace(wsDir);
    const ev = files.evidenceFiles.find((e) => e.path.endsWith('evidence.json'));
    assert.ok(ev, 'evidence file picked up');
    assert.ok(ev.parseError instanceof Error, 'parseError captured');
    // And the same record must be in allJsonFiles with parseError too.
    const j = files.allJsonFiles.find((x) => x.path.endsWith('evidence.json'));
    assert.ok(j.parseError);
  } finally {
    await cleanup();
  }
});

test('walkWorkspace: categorizes ISSUE-/FLOW-/RUN-/REPORT- artifacts correctly', async () => {
  const { wsDir, cleanup } = await makeInitializedWorkspace();
  try {
    // Synthesize one of each.
    await writeFile(
      path.join(wsDir, 'to_fix', 'ISSUE-001-foo.json'),
      JSON.stringify({ id: 'ISSUE-001', slug: 'foo' }, null, 2),
    );
    await writeFile(path.join(wsDir, 'to_fix', 'ISSUE-001-foo.md'), '# Issue\n');
    await writeFile(
      path.join(wsDir, 'flows', 'FLOW-checkout-happy.json'),
      JSON.stringify({ id: 'FLOW-checkout-happy' }, null, 2),
    );
    await mkdir(path.join(wsDir, 'tests', 'runs'), { recursive: true });
    await writeFile(path.join(wsDir, 'tests', 'runs', 'RUN-2026-01-01.md'), '# Run\n');
    await writeFile(path.join(wsDir, 'reports', 'REPORT-001-summary.md'), '# Report\n');
    await mkdir(path.join(wsDir, 'domains', 'auth'), { recursive: true });
    await writeFile(
      path.join(wsDir, 'domains', 'auth', 'domain.json'),
      JSON.stringify({ slug: 'auth' }, null, 2),
    );
    await writeFile(path.join(wsDir, 'domains', 'auth', 'index.md'), '# Auth Index\n');

    const files = await walkWorkspace(wsDir);
    assert.equal(files.issues.length, 1);
    assert.equal(files.issues[0].id, 'ISSUE-001');
    assert.equal(files.issues[0].slug, 'foo');
    assert.ok(files.issues[0].jsonPath);
    assert.ok(files.issues[0].mdPath);

    assert.equal(files.flows.length, 1);
    assert.equal(files.flows[0].id, 'FLOW-checkout-happy');

    assert.equal(files.testRuns.length, 1);
    assert.equal(files.reports.length, 1);
    assert.equal(files.domains.length, 1);
    assert.equal(files.domains[0].slug, 'auth');
    // Both 09_artifact_index.md AND domains/auth/index.md should be in indexes.
    const idxPaths = files.indexes.map((i) => path.basename(i.path));
    assert.ok(idxPaths.includes('09_artifact_index.md'));
    assert.ok(idxPaths.includes('index.md'));
  } finally {
    await cleanup();
  }
});

// ─── reporter tests ──────────────────────────────────────────────────────────

test('renderMarkdownReport: produces Summary table + Findings + Auto-heal sections', () => {
  const results = [
    {
      id: 'check-canonical-files',
      prdRule: 1,
      status: 'pass',
      findings: [],
    },
    {
      id: 'check-schemas',
      prdRule: 2,
      status: 'fail',
      findings: [
        {
          severity: 'error',
          path: 'to_fix/ISSUE-001-foo.json',
          code: 'TESTATLAS_SCHEMA_VIOLATION',
          message: 'missing required field',
          fixable: null,
        },
      ],
    },
    {
      id: 'check-issue-index-consistency',
      prdRule: 5,
      status: 'fail',
      findings: [
        {
          severity: 'error',
          path: 'to_fix/by_domain/auth.md',
          code: 'TESTATLAS_INDEX_MISMATCH',
          message: 'index missing entry for ISSUE-001',
          fixable: 'auto',
        },
      ],
    },
  ];
  const ctx = { wsDir: '/tmp/_testatlas' };
  const out = renderMarkdownReport(results, ctx);
  assert.match(out, /^# Workspace Validation Report/m);
  assert.match(out, /## Summary/);
  assert.match(out, /\| check-canonical-files \| 1 \| PASS \| 0 \|/);
  assert.match(out, /\| check-schemas \| 2 \| FAIL \| 1 \|/);
  assert.match(out, /## Findings/);
  assert.match(out, /### check-schemas \(PRD §33 condition 2\) — FAIL/);
  assert.match(out, /## Auto-heal/);
  assert.match(out, /TESTATLAS_INDEX_MISMATCH \(1 case\)/);
});

test('renderJsonReport: returns serializable shape with summary + findings + autoHeal', () => {
  const results = [
    {
      id: 'check-canonical-files',
      prdRule: 1,
      status: 'pass',
      findings: [],
    },
  ];
  const ctx = { wsDir: '/tmp/_testatlas' };
  const out = renderJsonReport(results, ctx);
  assert.equal(typeof out.generatedAt, 'string');
  assert.equal(out.workspace, path.resolve('/tmp/_testatlas'));
  assert.equal(out.overallStatus, 'pass');
  assert.deepEqual(out.summary, [
    { check: 'check-canonical-files', prdRule: 1, status: 'pass', findingCount: 0 },
  ]);
  assert.equal(out.findings.length, 0);
  assert.deepEqual(out.autoHeal.applicable, []);
  // Round-trip JSON.
  assert.doesNotThrow(() => JSON.stringify(out));
});

// ─── orchestrator integration tests ──────────────────────────────────────────

test('orchestrator: friendly missing-workspace exits 0 with message (Pitfall 8)', async () => {
  const { cwd, cleanup } = await makeWorkspaceFixture();
  try {
    // No initWorkspace call — wsDir is absent.
    const r = await validateWorkspace({ cwd });
    assert.equal(r.exitCode, 0);
    assert.equal(r.results.length, 0);
    assert.match(r.message, /Workspace not initialized/);
  } finally {
    await cleanup();
  }
});

test('orchestrator: assertNotUpdate("command") is the FIRST call', async () => {
  const { cwd, cleanup } = await makeWorkspaceFixture();
  try {
    const calls = [];
    const spy = (ctx) => calls.push(ctx);
    await validateWorkspace({ cwd }, { assertNotUpdate: spy });
    assert.deepEqual(calls, ['command']);
  } finally {
    await cleanup();
  }
});

test('orchestrator: runs all configured checks and aggregates exit code 0 when all pass', async () => {
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    const passingMod = (id, prdRule) => ({
      id,
      prdRule,
      check: async () => ({ id, prdRule, status: 'pass', findings: [] }),
    });
    const r = await validateWorkspace(
      { cwd },
      {
        loadChecks: async () => [passingMod('check-foo', 1), passingMod('check-bar', 2)],
      },
    );
    assert.equal(r.exitCode, 0);
    assert.equal(r.results.length, 2);
    assert.deepEqual(
      r.results.map((x) => x.id),
      ['check-foo', 'check-bar'],
    );
  } finally {
    await cleanup();
  }
});

test('orchestrator: exit code 1 when any check fails; warn alone yields 0', async () => {
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    const r = await validateWorkspace(
      { cwd },
      {
        loadChecks: async () => [
          {
            id: 'check-foo',
            prdRule: 1,
            check: async () => ({
              id: 'check-foo',
              prdRule: 1,
              status: 'warn',
              findings: [
                { severity: 'warning', path: 'a', code: 'X', message: 'm', fixable: null },
              ],
            }),
          },
        ],
      },
    );
    assert.equal(r.exitCode, 0, 'warn alone is exit 0');
    assert.equal(r.results[0].status, 'warn');

    const r2 = await validateWorkspace(
      { cwd },
      {
        loadChecks: async () => [
          {
            id: 'check-bar',
            prdRule: 2,
            check: async () => ({
              id: 'check-bar',
              prdRule: 2,
              status: 'fail',
              findings: [{ severity: 'error', path: 'b', code: 'Y', message: 'm', fixable: null }],
            }),
          },
        ],
      },
    );
    assert.equal(r2.exitCode, 1);
  } finally {
    await cleanup();
  }
});

test('orchestrator: --only filters to listed check ids', async () => {
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    const mk = (id) => ({
      id,
      prdRule: 1,
      check: async () => ({ id, prdRule: 1, status: 'pass', findings: [] }),
    });
    const r = await validateWorkspace(
      { cwd, only: ['check-keep'] },
      {
        loadChecks: async () => [mk('check-keep'), mk('check-skip')],
      },
    );
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].id, 'check-keep');
  } finally {
    await cleanup();
  }
});

test('orchestrator: --report writes markdown + JSON sidecar', async () => {
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    const reportPath = path.join(cwd, 'validation-report.md');
    const r = await validateWorkspace(
      { cwd, report: reportPath },
      {
        loadChecks: async () => [
          {
            id: 'check-foo',
            prdRule: 1,
            check: async () => ({ id: 'check-foo', prdRule: 1, status: 'pass', findings: [] }),
          },
        ],
      },
    );
    assert.equal(r.exitCode, 0);
    const md = await readFile(reportPath, 'utf8');
    assert.match(md, /# Workspace Validation Report/);
    const jsonText = await readFile(`${reportPath}.json`, 'utf8');
    const json = JSON.parse(jsonText);
    assert.equal(json.summary[0].check, 'check-foo');
  } finally {
    await cleanup();
  }
});

test('orchestrator: --auto-heal flag triggers autoheal call; without flag, autoheal NOT called', async () => {
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    let healArgs = null;
    const spy = async (results, ctx, opts) => {
      healArgs = { results, ctx, opts };
      return { applied: [], skipped: [] };
    };

    // With --auto-heal:
    const r1 = await validateWorkspace(
      { cwd, autoHeal: true, apply: false },
      {
        loadChecks: async () => [
          {
            id: 'check-foo',
            prdRule: 1,
            check: async () => ({ id: 'check-foo', prdRule: 1, status: 'pass', findings: [] }),
          },
        ],
        autoheal: spy,
      },
    );
    assert.ok(healArgs, 'autoheal called when --auto-heal set');
    assert.equal(healArgs.opts.apply, false);
    assert.deepEqual(r1.healed, { applied: [], skipped: [] });
    assert.equal(r1.exitCode, 0);

    // Without --auto-heal:
    healArgs = null;
    const r2 = await validateWorkspace(
      { cwd },
      {
        loadChecks: async () => [
          {
            id: 'check-foo',
            prdRule: 1,
            check: async () => ({ id: 'check-foo', prdRule: 1, status: 'pass', findings: [] }),
          },
        ],
        autoheal: spy,
      },
    );
    assert.equal(healArgs, null, 'autoheal NOT called without --auto-heal');
    assert.equal(r2.healed, undefined);
  } finally {
    await cleanup();
  }
});

test('orchestrator: --apply is parsed and threaded through opts to autoheal', async () => {
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    let optsSeen = null;
    await validateWorkspace(
      { cwd, autoHeal: true, apply: true, dryRun: true },
      {
        loadChecks: async () => [],
        autoheal: async (_r, _c, opts) => {
          optsSeen = opts;
          return { applied: [], skipped: [] };
        },
      },
    );
    assert.equal(optsSeen.apply, true);
    assert.equal(optsSeen.dryRun, true);
  } finally {
    await cleanup();
  }
});

test('orchestrator: graceful skip of not-yet-shipped check modules (real loadChecks)', async () => {
  // Drives the real loadChecks through dynamic import; expect to find
  // exactly the modules that 05-02 ships (5 of 10) and tolerate
  // ERR_MODULE_NOT_FOUND for the rest.
  const { cwd, cleanup } = await makeInitializedWorkspace();
  try {
    const r = await validateWorkspace({ cwd });
    // Each shipped check must produce a result row.
    const ids = r.results.map((x) => x.id);
    // The 5 ids this plan ships:
    assert.ok(ids.includes('check-canonical-files'));
    assert.ok(ids.includes('check-schemas'));
    assert.ok(ids.includes('check-broken-links'));
    assert.ok(ids.includes('check-orphaned-evidence'));
    assert.ok(ids.includes('check-issue-index-consistency'));
    // No 05-03 modules — but if they ever exist on disk in this repo (e.g.,
    // 05-03 lands later), they're free to add additional ids; we don't
    // assert exact count here.
    assert.ok(r.results.length >= 5);
  } finally {
    await cleanup();
  }
});
