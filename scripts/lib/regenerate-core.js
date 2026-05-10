// scripts/lib/regenerate-core.js
//
// Plan 08-01. Pure replay engine for example regeneration. Exposes:
//
//   loadAndValidateScript(scriptPath, ajv)    — JSON-load + AJV-validate
//   replayStep(step, opts)                    — invoke one Phase 5 emitter
//   diffTrees(actualPath, expectedPath)       — recursive byte-level compare
//   regenerateExample({examplePath, ...})     — orchestrator (wipe → init →
//                                                 replay → validate)
//
// All side effects live in this file; the CLI in scripts/regenerate-example.js
// is just an arg parser + exit-code mapper.
//
// Determinism: the orchestrator forces TESTATLAS_DETERMINISTIC=1 and exports
// TESTATLAS_FIXED_TIMESTAMP from the script's `fixedTimestamp` for every
// child process. Re-running this engine against an unchanged fixture is
// guaranteed to produce a byte-identical _testatlas/ tree (Pattern: Plan
// 08-01 RESEARCH §3).

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertCapability } from './safety.js';

const EXAMPLE_SCRIPT_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/example-script.schema.json';
const FIXTURE_FILENAME = 'example-script.json';
const FIXTURE_DIR = '_testatlas-fixture';
const WORKSPACE_DIR = '_testatlas';

// ─────────────────────────────── Loader/validator ───────────────────────────────

/**
 * Read JSON, validate against `example-script.schema.json`. Throws with
 * `code = 'TESTATLAS_INVALID_EXAMPLE_SCRIPT'` on failure (validationErrors
 * attached). Throws with `code = 'TESTATLAS_SCRIPT_NOT_FOUND'` if the file
 * is missing.
 *
 * @param {string} scriptPath absolute path to example-script.json
 * @param {import('ajv').default} ajv  pre-loaded AJV with vocabulary + all schemas
 * @returns {Promise<object>} parsed + validated script
 */
export async function loadAndValidateScript(scriptPath, ajv) {
  let raw;
  try {
    raw = await readFile(scriptPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`example-script not found: ${scriptPath}`);
      e.code = 'TESTATLAS_SCRIPT_NOT_FOUND';
      throw e;
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const e = new Error(`example-script invalid JSON at ${scriptPath}: ${err.message}`);
    e.code = 'TESTATLAS_INVALID_EXAMPLE_SCRIPT';
    throw e;
  }

  const validator = ajv.getSchema(EXAMPLE_SCRIPT_SCHEMA_ID);
  if (!validator) {
    const e = new Error(`example-script schema not loaded (${EXAMPLE_SCRIPT_SCHEMA_ID})`);
    e.code = 'TESTATLAS_SCHEMA_MISSING';
    throw e;
  }
  if (!validator(parsed)) {
    const e = new Error(
      `example-script does not validate: ${(validator.errors ?? [])
        .map((x) => `${x.instancePath || '/'} ${x.message}`)
        .join('; ')}`,
    );
    e.code = 'TESTATLAS_INVALID_EXAMPLE_SCRIPT';
    e.validationErrors = validator.errors;
    throw e;
  }
  return parsed;
}

// ─────────────────────────────── Step replay ───────────────────────────────

/**
 * Convert a plain-object args bag to flag form:
 *   {title: "x", evidence: ["E-1", "E-2"], dryRun: true}
 *     → ["--title", "x", "--evidence", "E-1", "--evidence", "E-2", "--dry-run"]
 *
 * Keys are kebab-cased: `dryRun` → `--dry-run`. Skips null/undefined values.
 *
 * @param {Record<string, unknown>} args
 * @returns {string[]}
 */
export function flagifyArgs(args = {}) {
  const out = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === null || v === undefined) continue;
    const flag = `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
    if (Array.isArray(v)) {
      for (const item of v) {
        out.push(flag, String(item));
      }
    } else if (typeof v === 'boolean') {
      if (v) out.push(flag);
    } else {
      out.push(flag, String(v));
    }
  }
  return out;
}

/**
 * Invoke a Phase 5 emitter (or init-workspace) as a child process.
 * The replay engine ALWAYS injects TESTATLAS_DETERMINISTIC=1 and
 * TESTATLAS_FIXED_TIMESTAMP into the child env.
 *
 * @param {{
 *   id: string,
 *   command: string,
 *   args?: Record<string, unknown>,
 * }} step
 * @param {{
 *   workspacePath: string,    // absolute path to <example>/_testatlas
 *   exampleCwd: string,       // absolute path to <example>/ (becomes child's cwd)
 *   suiteRoot: string,        // absolute path to suite root (where scripts/ lives)
 *   fixedTimestamp: string,
 * }} opts
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function replayStep(step, opts) {
  const { workspacePath, exampleCwd, suiteRoot, fixedTimestamp } = opts;
  const scriptPath = path.join(suiteRoot, 'scripts', `${step.command}.js`);

  // Defense-in-depth — the schema's enum already constrains the
  // authoring-side list, but the dispatcher should also accept the framework
  // calls (validate-workspace) injected by the orchestrator. Anything else
  // is rejected.
  const ALLOWED = new Set([
    'init-workspace',
    'create-domain',
    'create-flow',
    'create-issue',
    'create-evidence-record',
    'update-indexes',
    'sync-status',
    'summarize-run',
    'generate-report',
    'validate-workspace',
  ]);
  if (!ALLOWED.has(step.command)) {
    const e = new Error(`replayStep: unknown command ${step.command}`);
    e.code = 'TESTATLAS_UNKNOWN_COMMAND';
    throw e;
  }

  const argv = ['--workspace', workspacePath, ...flagifyArgs(step.args ?? {})];

  const env = {
    ...process.env,
    TESTATLAS_DETERMINISTIC: '1',
    TESTATLAS_FIXED_TIMESTAMP: fixedTimestamp,
  };

  // ISSUE-014 defense-in-depth: regen tooling is internal-only (invoked by
  // the OBD harness + suite-self-test fixture replay), but explicit
  // capability tag for the static-scan invariant. Permissive default —
  // regen by definition needs to spawn the inner emitters.
  const cap = assertCapability(
    opts.config ?? { safeMode: false, allowDestructiveActions: true },
    'spawn',
  );
  if (!cap.allowed) {
    throw new Error(`replayStep: ${cap.reason}`);
  }

  return await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...argv], {
      cwd: exampleCwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const e = new Error(
          `step ${step.id} (${step.command}) exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        );
        e.code = 'TESTATLAS_STEP_FAILED';
        e.stepId = step.id;
        e.exitCode = code;
        e.stdout = stdout;
        e.stderr = stderr;
        reject(e);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// ─────────────────────────────── Tree diff ───────────────────────────────

/**
 * Recursively walk `root` and return a Map<relPath, Buffer>.
 *
 * @param {string} root
 * @returns {Promise<Map<string, Buffer>>}
 */
async function readTree(root) {
  const out = new Map();
  async function walk(dir, base) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, rel);
      } else if (e.isFile()) {
        out.set(rel, await readFile(abs));
      }
    }
  }
  await walk(root, '');
  return out;
}

/**
 * Byte-level recursive diff. Returns `{ok, drift?}` where drift is a sorted
 * array of `{path, kind}` records. `kind` is one of:
 *   - 'missing'   — present in expected, missing in actual
 *   - 'extra'     — present in actual, missing in expected
 *   - 'changed'   — present in both but bytes differ
 *
 * @param {string} actualPath
 * @param {string} expectedPath
 * @returns {Promise<{ok: true} | {ok: false, drift: Array<{path:string, kind:'missing'|'extra'|'changed'}>}>}
 */
export async function diffTrees(actualPath, expectedPath) {
  const [actual, expected] = await Promise.all([readTree(actualPath), readTree(expectedPath)]);
  const drift = [];
  const keys = new Set([...actual.keys(), ...expected.keys()]);
  for (const k of [...keys].sort()) {
    const a = actual.get(k);
    const b = expected.get(k);
    if (a && !b) drift.push({ path: k, kind: 'extra' });
    else if (b && !a) drift.push({ path: k, kind: 'missing' });
    else if (a && b && Buffer.compare(a, b) !== 0) drift.push({ path: k, kind: 'changed' });
  }
  if (drift.length === 0) return { ok: true };
  return { ok: false, drift };
}

// ─────────────────────────────── Orchestrator ───────────────────────────────

/**
 * @param {{
 *   examplePath: string,         // absolute path to examples/<name>/
 *   suiteRoot: string,           // absolute path to suite root
 *   check?: boolean,             // verify checked-in tree without writing
 *   ajv: import('ajv').default,
 *   onLog?: (msg: string) => void,
 * }} args
 * @returns {Promise<{
 *   ok: boolean,
 *   target: string,
 *   drift?: Array<{path:string, kind:string}>,
 *   errors?: string[],
 *   logs: string[]
 * }>}
 */
export async function regenerateExample({ examplePath, suiteRoot, check = false, ajv, onLog }) {
  const logs = [];
  const log = (msg) => {
    logs.push(msg);
    if (onLog) onLog(msg);
  };

  const fixturePath = path.join(examplePath, FIXTURE_DIR, FIXTURE_FILENAME);
  const checkedInWorkspace = path.join(examplePath, WORKSPACE_DIR);

  // ── 1. Validate the script BEFORE any side effects ──
  let script;
  try {
    script = await loadAndValidateScript(fixturePath, ajv);
  } catch (err) {
    return {
      ok: false,
      target: checkedInWorkspace,
      errors: [`script validation failed: ${err.message}`],
      logs,
    };
  }
  log(`script ok: ${script.exampleName} (${script.steps.length} steps)`);

  // ── 2. Pick target dir: tempdir for --check, real dir otherwise ──
  // In both modes the target is wiped before init so init-workspace doesn't
  // trip on TESTATLAS_AMBIGUOUS_WORKSPACE (an empty dir without a manifest
  // is considered ambiguous).
  // ISSUE-014 defense-in-depth: regen is an internal-only flow (suite
  // self-test fixture replay); capability gated below. Default permissive
  // — regen by definition wipes-and-rebuilds the example workspace.
  const regenCap = assertCapability(
    { safeMode: false, allowDestructiveActions: true },
    'destructive-fs',
  );
  if (!regenCap.allowed) {
    return { ok: false, target: checkedInWorkspace, errors: [regenCap.reason], logs };
  }
  let target;
  let usedTemp = false;
  if (check) {
    const tmp = await mkdtemp(path.join(tmpdir(), `testatlas-regen-${script.exampleName}-`));
    target = path.join(tmp, '_testatlas');
    usedTemp = true;
  } else {
    target = checkedInWorkspace;
    await rm(target, { recursive: true, force: true });
  }

  try {
    // ── 3. Init the workspace ──
    // init-workspace.js takes `--workspace`, runs from cwd containing .testatlas/.
    // For examples/<name>/, the suite tree is the SUITE_ROOT (not inside the
    // example). We replay init-workspace with cwd=suiteRoot so init-workspace
    // can find the suite tree, but pass --workspace=<absolute target> so the
    // workspace lands inside the example (or tempdir).
    //
    // projectName pin: init-workspace defaults `project.name` to
    // `path.basename(cwd)`, which makes the regen output depend on the suite
    // checkout directory name. The fixture's existing manifest records the
    // project name as the suite was named WHEN the fixture was captured
    // (typically `TestAtlas`). Read that value from the checked-in
    // workspace manifest and pin it via --project-name so regen is
    // deterministic across clone dir names (e.g. testatlas-ci-sim, /tmp/...).
    let pinnedProjectName;
    try {
      const fixtureManifestPath = path.join(checkedInWorkspace, '11_workspace_manifest.json');
      const fixtureManifest = JSON.parse(await readFile(fixtureManifestPath, 'utf8'));
      pinnedProjectName = fixtureManifest?.project?.name;
    } catch {
      // No checked-in manifest (initial bootstrap of a new example) — fall
      // back to init-workspace's basename default. Drift detection would
      // still flag a future check-in if the project name differs.
    }
    await replayStep(
      {
        id: '_init',
        command: 'init-workspace',
        args: pinnedProjectName ? { projectName: pinnedProjectName } : {},
      },
      {
        workspacePath: target,
        exampleCwd: suiteRoot,
        suiteRoot,
        fixedTimestamp: script.fixedTimestamp,
      },
    );
    log(`init-workspace: ok (target=${target})`);

    // ── 4. Replay each step ──
    for (const step of script.steps) {
      // init-workspace step in the script (if present) is a no-op — already done.
      if (step.command === 'init-workspace') {
        log(`step ${step.id}: init-workspace (skip — already initialized)`);
        continue;
      }
      await replayStep(step, {
        workspacePath: target,
        exampleCwd: suiteRoot,
        suiteRoot,
        fixedTimestamp: script.fixedTimestamp,
      });
      log(`step ${step.id}: ${step.command} ok`);
    }

    // ── 5. Final regen sweep (idempotent — index/sync are safe to re-run) ──
    for (const finalCmd of ['update-indexes', 'sync-status']) {
      await replayStep(
        { id: `_final-${finalCmd}`, command: finalCmd, args: {} },
        {
          workspacePath: target,
          exampleCwd: suiteRoot,
          suiteRoot,
          fixedTimestamp: script.fixedTimestamp,
        },
      );
    }

    // ── 6. Auto-heal pass — populate cross-cut indexes (by_domain, by_severity,
    // by_status, by_type) created by HEAL-03. Without this, validate-workspace
    // surfaces TESTATLAS_INDEX_MISMATCH on every fresh workspace that has
    // ≥1 issue. The autoheal pass is deterministic given deterministic inputs.
    await replayStep(
      {
        id: '_autoheal',
        command: 'validate-workspace',
        args: { autoHeal: true, apply: true },
      },
      {
        workspacePath: target,
        exampleCwd: suiteRoot,
        suiteRoot,
        fixedTimestamp: script.fixedTimestamp,
      },
    );
    log('validate-workspace --auto-heal --apply: ok');

    // Re-run update-indexes + sync-status after autoheal so the artifact
    // index and counts reflect any newly-created cross-cut indexes.
    for (const finalCmd of ['update-indexes', 'sync-status']) {
      await replayStep(
        { id: `_finalpost-${finalCmd}`, command: finalCmd, args: {} },
        {
          workspacePath: target,
          exampleCwd: suiteRoot,
          suiteRoot,
          fixedTimestamp: script.fixedTimestamp,
        },
      );
    }

    // ── 7. validate-workspace (clean) ──
    await replayStep(
      { id: '_validate', command: 'validate-workspace', args: {} },
      {
        workspacePath: target,
        exampleCwd: suiteRoot,
        suiteRoot,
        fixedTimestamp: script.fixedTimestamp,
      },
    );
    log(`validate-workspace: ok`);

    // ── 8. Drift check (only in --check mode) ──
    if (check) {
      // Compare temp tree vs checked-in tree.
      const checkedInExists = await stat(checkedInWorkspace).catch(() => null);
      if (!checkedInExists) {
        return {
          ok: false,
          target,
          errors: [
            `--check requires a pre-existing ${checkedInWorkspace}; run without --check first to populate it.`,
          ],
          logs,
        };
      }
      const result = await diffTrees(target, checkedInWorkspace);
      if (!result.ok) {
        return { ok: false, target, drift: result.drift, logs };
      }
    }

    return { ok: true, target, logs };
  } catch (err) {
    return {
      ok: false,
      target,
      errors: [err.message ?? String(err)],
      logs,
    };
  } finally {
    if (usedTemp) {
      // Clean up the parent tmp dir (which contains the _testatlas subtree).
      // assertCapability('destructive-fs') gated at function entry above;
      // this is best-effort cleanup of a tmpdir we created ourselves.
      await rm(path.dirname(target), { recursive: true, force: true }).catch(() => {});
    }
  }
}
