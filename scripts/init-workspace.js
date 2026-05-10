// scripts/init-workspace.js
//
// Plan 02-04. Minimal idempotent bootstrap for the TestAtlas workspace tree.
//
// Given an empty target repo with `.testatlas/` (suite tree) installed, this
// creates a complete `_testatlas/` workspace:
//   - 23 top-level subdirectories + 23 nested subdirectories (47 dirs total
//     including the workspace root itself).
//   - 14 canonical files rendered from `.testatlas/templates/canonical/`.
//   - `11_workspace_manifest.json` with ISO-now timestamps, project basename,
//     status='initialized', and a `generatedSections` map keyed by relative
//     workspace path → section slug → 16-hex content hash.
//
// Idempotency contract (locked, per 02-RESEARCH.md §"Pattern 6"):
//   - Workspace absent              → status: 'initialized'
//   - Manifest + all canonicals     → status: 'already-initialized', no writes
//   - Manifest + missing canonicals → status: 'partial-fill', writes only missing
//   - Workspace dir w/o manifest    → throws TESTATLAS_AMBIGUOUS_WORKSPACE
//                                     (pass --force to recreate)
//   - .testatlas/bootstrap.md absent → throws TESTATLAS_SUITE_MISSING
//
// Two-tree invariant: assertNotUpdate('init') is the FIRST action — before any
// stat or write. The second arg `_inject` is test-only DI for the guard.

import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatErrors } from './lib/ajv-instance.js';
import { atomicWrite } from './lib/atomic-write.js';
import { copyV2Artifacts } from './lib/copy-v2-artifacts.js';
import { now } from './lib/determinism.js';
import { loadConfig } from './lib/load-config.js';
import { parseMarkers } from './lib/markers.js';
import { loadAllSchemas } from './lib/schema-loader.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

// ───────────────────────── Authoritative enumerations ─────────────────────────

const TOP_LEVEL_SUBDIRS = [
  'domains',
  'components',
  'pages',
  'api',
  'cli',
  'jobs',
  'integrations',
  'data',
  'flows',
  'stories',
  'personas',
  'states',
  'plans',
  'research',
  'setup',
  'tests',
  'evidence',
  'reports',
  'to_fix',
  'sub_agents',
  'history',
  'templates_used',
  'scratch',
];

const NESTED_DIRS = [
  'tests/scenarios',
  'tests/runs',
  'api/endpoints',
  'cli/commands',
  'data/schemas',
  'sub_agents/handoffs',
  'sub_agents/outputs',
  'sub_agents/reviews',
  'to_fix/by_domain',
  'to_fix/by_severity',
  'to_fix/by_status',
  'to_fix/by_type',
  'evidence/screenshots',
  'evidence/videos',
  'evidence/traces',
  'evidence/logs',
  'evidence/network',
  'evidence/console',
  'evidence/api',
  'evidence/db',
  'evidence/files',
  'evidence/accessibility',
  'evidence/performance',
];

// V2 directory additions (Phase 14)
const V2_NESTED_DIRS = [
  'bootstrap',
  'brain/schema',
  'agents/personas/system',
  'agents/personas/generated',
  'agents/personas/project',
  'agents/councils/council_templates',
  'agents/councils/sessions',
  'agents/councils/transcripts',
  'agents/councils/outputs',
  'agents/councils/consolidations',
  'agents/handoffs',
  'agents/outputs',
  'agents/scorecards',
  'maps',
  'tests/generated_automation',
  'tests/retest_packs',
];

const CANONICAL_FILES = [
  '00_overview.md',
  '01_system_map.md',
  '02_test_strategy.md',
  '03_execution_status.md',
  '04_open_questions.md',
  '05_assumptions.md',
  '06_risks_and_gaps.md',
  '07_environment_and_access.md',
  '08_glossary.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '11_workspace_manifest.json',
  '12_app_map.json',
  '13_quality_scorecard.md',
];

const MANIFEST_FILE = '11_workspace_manifest.json';
const APP_MAP_FILE = '12_app_map.json';
const PLACEHOLDER_TS = '0000-00-00T00:00:00Z';
const MANIFEST_SCHEMA_ID = 'https://testatlas.dev/schemas/v1/workspace-manifest.schema.json';

// ─────────────────────────────── Public API ───────────────────────────────

/**
 * Bootstrap the TestAtlas workspace.
 *
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   force?: boolean,
 *   projectName?: string
 * }} [opts]
 * @param {{
 *   assertNotUpdate?: typeof assertNotUpdate
 * }} [_inject] @internal — test-only dependency injection.
 * @returns {Promise<{
 *   status: 'initialized' | 'already-initialized' | 'partial-fill',
 *   wsDir: string,
 *   created: string[]
 * }>}
 */
export async function initWorkspace(
  { workspaceDir, cwd = process.cwd(), force = false, projectName: projectNameOverride } = {},
  _inject = {},
) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  // Guard FIRST — before any stat or write.
  _assertNotUpdate('init');

  // Suite-tree sanity check.
  const bootstrapPath = path.join(cwd, '.testatlas', 'bootstrap.md');
  const suiteOk = await stat(bootstrapPath).catch(() => null);
  if (!suiteOk) {
    const e = new Error(
      `TestAtlas suite tree not found at ${path.join(cwd, '.testatlas')}/. ` +
        'Run `npx @webventures/testatlas init` first.',
    );
    e.code = 'TESTATLAS_SUITE_MISSING';
    throw e;
  }

  // Resolve workspace location from explicit arg or config.
  const config = await loadConfig({ cwd });
  const rawWsDir = workspaceDir ?? config.workspaceDir;
  // Normalize leading "./" for the manifest's stored value (path.resolve
  // handles cwd-relativity for the on-disk location regardless).
  // For the manifest's stored `workspaceDir` (and as a key prefix in
  // `generatedSections`), strip leading "./" and — when an absolute path was
  // passed via --workspace — collapse to just the basename so the manifest
  // stays reproducible across machines + tempdirs.
  const manifestWsDir = path.isAbsolute(rawWsDir)
    ? path.basename(rawWsDir)
    : stripLeadingDot(rawWsDir);
  const wsDir = path.resolve(cwd, rawWsDir);
  const manifestPath = path.join(wsDir, MANIFEST_FILE);

  const wsExisted = (await stat(wsDir).catch(() => null)) !== null;
  const manifestExisted = (await stat(manifestPath).catch(() => null)) !== null;

  if (wsExisted && !manifestExisted && !force) {
    const e = new Error(
      'workspace dir present but no manifest — refuse to overwrite, ' +
        'may not be a TestAtlas workspace. Pass --force to recreate.',
    );
    e.code = 'TESTATLAS_AMBIGUOUS_WORKSPACE';
    throw e;
  }

  // mkdir is idempotent with {recursive:true}; safe to call on partial state.
  await mkdir(wsDir, { recursive: true });
  for (const sub of TOP_LEVEL_SUBDIRS) {
    await mkdir(path.join(wsDir, sub), { recursive: true });
  }
  for (const nested of NESTED_DIRS) {
    await mkdir(path.join(wsDir, nested), { recursive: true });
  }

  // V2 directory structure (Phase 14)
  for (const nested of V2_NESTED_DIRS) {
    await mkdir(path.join(wsDir, nested), { recursive: true });
  }

  const templatesDir = path.join(cwd, '.testatlas', 'templates', 'canonical');
  const nowIso = now();
  // projectName resolution order: explicit override > TESTATLAS_PROJECT_NAME env
  // var > path.basename(cwd). Override exists so callers like
  // regenerate-example.js can pin a deterministic name (the fixture's expected
  // value) regardless of where the suite is checked out — otherwise running
  // tests in a clone not literally named `TestAtlas` produces a drift mismatch
  // in `_testatlas/11_workspace_manifest.json` and `brain/manifest.json`.
  const projectName =
    projectNameOverride ?? process.env.TESTATLAS_PROJECT_NAME ?? path.basename(cwd);
  const created = [];
  /** @type {Record<string, Record<string, string>>} */
  const generatedSections = {};

  // First pass: render every canonical EXCEPT the manifest. Capture section
  // hashes from each rendered markdown into `generatedSections`.
  for (const file of CANONICAL_FILES) {
    if (file === MANIFEST_FILE) continue;
    const target = path.join(wsDir, file);
    if ((await stat(target).catch(() => null)) !== null) continue;

    const tmplPath = path.join(templatesDir, file);
    const tmpl = await readFile(tmplPath, 'utf8');

    let rendered;
    if (file === APP_MAP_FILE) {
      // Pure JSON placeholder; ship as-is.
      rendered = tmpl;
    } else {
      rendered = renderTimestamps(tmpl, nowIso);
      // Capture section hashes for the manifest.
      const { sections, errors } = parseMarkers(rendered);
      if (errors.length === 0 && sections.size > 0) {
        // Key the generatedSections map by filename only when manifestWsDir is
        // absolute (e.g. when invoked with `--workspace <absolute>`). This
        // keeps the manifest reproducible across machines + tempdirs while
        // preserving the historical relative-path key when manifestWsDir is
        // relative (Phase 2 fixtures).
        const fileKey = path.isAbsolute(manifestWsDir)
          ? file
          : path.posix.join(manifestWsDir, file);
        generatedSections[fileKey] = {};
        for (const [slug, section] of sections) {
          generatedSections[fileKey][slug] = section.hash;
        }
      }
    }
    await atomicWrite(target, rendered);
    created.push(file);
  }

  // Second pass: render the manifest with the populated generatedSections
  // map AFTER all other canonicals have contributed their hashes. Skip if a
  // manifest already exists on disk (idempotent partial-fill case).
  const manifestOnDisk = (await stat(manifestPath).catch(() => null)) !== null;
  if (!manifestOnDisk) {
    const manifestTmpl = await readFile(path.join(templatesDir, MANIFEST_FILE), 'utf8');
    const finalManifest = renderManifest(manifestTmpl, {
      workspaceDir: manifestWsDir,
      nowIso,
      projectName,
      generatedSections,
    });

    // Validate generated manifest against its schema before writing.
    const ajv = await loadAllSchemas({ cwd });
    const validate = ajv.getSchema(MANIFEST_SCHEMA_ID);
    if (!validate) {
      const e = new Error(`init-workspace: manifest schema not found (${MANIFEST_SCHEMA_ID})`);
      e.code = 'TESTATLAS_SCHEMA_MISSING';
      throw e;
    }
    const parsed = JSON.parse(finalManifest);
    if (!validate(parsed)) {
      const lines = formatErrors(validate.errors, manifestPath);
      const e = new Error(`Generated manifest fails schema validation:\n  ${lines.join('\n  ')}`);
      e.code = 'TESTATLAS_INVALID_MANIFEST';
      e.validationErrors = validate.errors;
      throw e;
    }

    await atomicWrite(manifestPath, finalManifest);
    created.push(MANIFEST_FILE);
  }

  // V2 brain skeleton files (Phase 14)
  const brainFiles = {
    'brain/manifest.json': {
      schema_version: '2.0.0',
      suite_version: '2.0.0',
      initialized_at: nowIso,
      last_updated: nowIso,
      project_name: projectName,
      adapters: [],
      schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
    },
    'brain/state.json': {
      schema_version: '2.0.0',
      project: { name: projectName, repo_root: '.', primary_stack: [] },
      status: {
        phase: 'initialized',
        last_updated: nowIso,
        last_command: '/atlas:init',
        active_environment: 'local',
      },
      counts: {
        domains: 0,
        flows: 0,
        issues: 0,
        critical_issues: 0,
        high_issues: 0,
        evidence_artifacts: 0,
        council_sessions: 0,
      },
      confidence: { overall: 'unknown', highest_risk_domains: [], stale_domains: [] },
      next_recommended_commands: [],
    },
    'brain/domains.json': { schema_version: '2.0.0', last_updated: nowIso, domains: [] },
    'brain/flows.json': { schema_version: '2.0.0', last_updated: nowIso, flows: [] },
    'brain/routes.json': { schema_version: '2.0.0', last_updated: nowIso, routes: [] },
    'brain/components.json': { schema_version: '2.0.0', last_updated: nowIso, components: [] },
    'brain/commands.json': { schema_version: '2.0.0', last_updated: nowIso, commands: [] },
    'brain/personas.json': { schema_version: '2.0.0', last_updated: nowIso, personas: [] },
    'brain/issues.json': { schema_version: '2.0.0', last_updated: nowIso, issues: [] },
    'brain/evidence.json': { schema_version: '2.0.0', last_updated: nowIso, evidence: [] },
    'brain/risks.json': { schema_version: '2.0.0', last_updated: nowIso, risks: [] },
    'brain/assumptions.json': { schema_version: '2.0.0', last_updated: nowIso, assumptions: [] },
    'brain/open_questions.json': {
      schema_version: '2.0.0',
      last_updated: nowIso,
      open_questions: [],
    },
    'brain/decisions.json': { schema_version: '2.0.0', last_updated: nowIso, decisions: [] },
    'brain/coverage.json': {
      schema_version: '2.0.0',
      last_updated: nowIso,
      coverage: { routes: [], components: [], endpoints: [], commands: [] },
    },
    'brain/quality_scores.json': { schema_version: '2.0.0', last_updated: nowIso, scores: [] },
    'brain/agent_sessions.json': { schema_version: '2.0.0', last_updated: nowIso, sessions: [] },
    'brain/drift.json': { schema_version: '2.0.0', last_updated: nowIso, drift_records: [] },
    'brain/claims.jsonl': '',
    'brain/observations.jsonl': '',
    'brain/events.jsonl': '',
    'brain/embeddings_manifest.json': {
      schema_version: '2.0.0',
      last_updated: nowIso,
      embeddings: [],
    },
    'brain/graph.json': { schema_version: '2.0.0', last_updated: nowIso, nodes: [], edges: [] },
  };

  for (const [relPath, content] of Object.entries(brainFiles)) {
    const targetPath = path.join(wsDir, relPath);
    if ((await stat(targetPath).catch(() => null)) !== null) continue;
    const data = typeof content === 'object' ? `${JSON.stringify(content, null, 2)}\n` : content;
    await atomicWrite(targetPath, data);
    created.push(relPath);
  }

  // Copy V2 artifacts from suite source (.testatlas/) into workspace.
  // Personas, council templates, brain schemas, and registry population.
  await copyV2Artifacts({ cwd, wsDir, nowIso, created });

  // V2 agents registry (legacy path — copyV2Artifacts now handles this,
  // but keep for backward compatibility when called from older callers)
  const registryPath = path.join(wsDir, 'agents', 'registry.json');
  if ((await stat(registryPath).catch(() => null)) === null) {
    await atomicWrite(
      registryPath,
      `${JSON.stringify(
        {
          schema_version: '2.0.0',
          last_updated: nowIso,
          personas: [],
          councils: [],
          generated_count: 0,
          session_count: 0,
        },
        null,
        2,
      )}\n`,
    );
    created.push('agents/registry.json');
  }

  // V2 history files
  const decisionsPath = path.join(wsDir, 'history', 'decisions.md');
  if ((await stat(decisionsPath).catch(() => null)) === null) {
    await atomicWrite(
      decisionsPath,
      `---\nschema_version: "2.0.0"\nlast_updated: "${nowIso}"\n---\n\n# Decision Log\n\n*No decisions recorded yet.*\n`,
    );
    created.push('history/decisions.md');
  }

  const changelogPath = path.join(wsDir, 'history', 'changelog.md');
  if ((await stat(changelogPath).catch(() => null)) === null) {
    await atomicWrite(
      changelogPath,
      `---\nschema_version: "2.0.0"\nlast_updated: "${nowIso}"\n---\n\n# Changelog\n\n*No changes recorded yet.*\n`,
    );
    created.push('history/changelog.md');
  }

  // Status determination.
  let status;
  if (!wsExisted) {
    status = 'initialized';
  } else if (created.length === 0) {
    status = 'already-initialized';
  } else {
    status = 'partial-fill';
  }

  return { status, wsDir, created };
}

// ─────────────────────────────── helpers ───────────────────────────────

/**
 * Replace the placeholder ISO-timestamp string used by the canonical templates
 * with the real init-time timestamp. Templates ship the literal token
 * `0000-00-00T00:00:00Z` everywhere a timestamp belongs.
 *
 * @param {string} tmpl
 * @param {string} nowIso
 * @returns {string}
 */
function renderTimestamps(tmpl, nowIso) {
  return tmpl.replaceAll(PLACEHOLDER_TS, nowIso);
}

/**
 * Render the workspace manifest from its JSON template. We parse the template
 * (which is real JSON), mutate the well-known fields, and re-stringify with
 * stable 2-space indentation and a trailing newline. Mutating the parsed
 * object is safer than string substitution for nested keys.
 *
 * @param {string} tmpl
 * @param {{
 *   workspaceDir: string,
 *   nowIso: string,
 *   projectName: string,
 *   generatedSections: Record<string, Record<string, string>>
 * }} ctx
 * @returns {string}
 */
function renderManifest(tmpl, { workspaceDir, nowIso, projectName, generatedSections }) {
  const obj = JSON.parse(tmpl);
  obj.workspaceDir = workspaceDir;
  obj.initializedAt = nowIso;
  obj.lastUpdatedAt = nowIso;
  if (obj.project && typeof obj.project === 'object') {
    obj.project.name = projectName;
  }
  obj.generatedSections = generatedSections;
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/**
 * Strip a leading `./` from a relative path so the manifest's `workspaceDir`
 * stays clean (e.g., the default config ships `./_testatlas`; the manifest
 * should record `_testatlas`).
 *
 * @param {string} p
 * @returns {string}
 */
function stripLeadingDot(p) {
  return p.startsWith('./') ? p.slice(2) : p;
}

// ─────────────────────────────── CLI wrapper ───────────────────────────────

// Cross-platform CLI guard: `new URL(...).pathname` returns "/D:/..." on
// Windows, which `path.resolve` mangles into "D:\D:\..." — making this branch
// silently skip when invoked as a child process. `fileURLToPath` is the
// portable conversion.
const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

/**
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') {
      opts.workspaceDir = argv[++i];
    } else if (a === '--cwd') {
      opts.cwd = argv[++i];
    } else if (a === '--force') {
      opts.force = true;
    } else if (a === '--project-name') {
      opts.projectName = argv[++i];
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/init-workspace.js [--workspace <path>] [--cwd <path>] [--force] [--project-name <name>]',
      );
      process.exit(0);
    } else {
      console.error(`init-workspace: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await initWorkspace(opts);
    console.log(`init-workspace: ${r.status} at ${r.wsDir} (${r.created.length} files created)`);
  } catch (err) {
    console.error(`init-workspace: ${err.code ?? 'ERROR'} — ${err.message}`);
    process.exit(1);
  }
}
