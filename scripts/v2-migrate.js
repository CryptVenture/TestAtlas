// scripts/v2-migrate.js
//
// Idempotent V1 → V2 workspace migration.
//
// Detects a V1 workspace, creates V2 structure, populates brain baseline files
// from existing workspace state, and updates the manifest — all without losing
// existing content.

import { cp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyV2Artifacts } from './lib/copy-v2-artifacts.js';
import { now } from './lib/determinism.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { assertCapability } from './lib/safety.js';

const V2_DIRS = [
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
  'stories',
  'tests/generated_automation',
  'tests/retest_packs',
];

const BRAIN_FILES = {
  'brain/manifest.json': {
    schema_version: '2.0.0',
    suite_version: '2.0.0',
    initialized_at: '',
    last_updated: '',
    project_name: '',
    adapters: [],
    schema_uri: 'https://testatlas.dev/schemas/v2/manifest.schema.json',
  },
  'brain/state.json': {
    schema_version: '2.0.0',
    project: { name: '', repo_root: '.', primary_stack: [] },
    status: {
      phase: 'migrated',
      last_updated: '',
      last_command: '/atlas:migrate',
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
  'brain/domains.json': { schema_version: '2.0.0', last_updated: '', domains: [] },
  'brain/flows.json': { schema_version: '2.0.0', last_updated: '', flows: [] },
  'brain/routes.json': { schema_version: '2.0.0', last_updated: '', routes: [] },
  'brain/components.json': { schema_version: '2.0.0', last_updated: '', components: [] },
  'brain/commands.json': { schema_version: '2.0.0', last_updated: '', commands: [] },
  'brain/personas.json': { schema_version: '2.0.0', last_updated: '', personas: [] },
  'brain/issues.json': { schema_version: '2.0.0', last_updated: '', issues: [] },
  'brain/evidence.json': { schema_version: '2.0.0', last_updated: '', evidence: [] },
  'brain/risks.json': { schema_version: '2.0.0', last_updated: '', risks: [] },
  'brain/assumptions.json': { schema_version: '2.0.0', last_updated: '', assumptions: [] },
  'brain/open_questions.json': { schema_version: '2.0.0', last_updated: '', open_questions: [] },
  'brain/decisions.json': { schema_version: '2.0.0', last_updated: '', decisions: [] },
  'brain/coverage.json': {
    schema_version: '2.0.0',
    last_updated: '',
    coverage: { routes: [], components: [], endpoints: [], commands: [] },
  },
  'brain/quality_scores.json': { schema_version: '2.0.0', last_updated: '', scores: [] },
  'brain/agent_sessions.json': { schema_version: '2.0.0', last_updated: '', sessions: [] },
  'brain/drift.json': { schema_version: '2.0.0', last_updated: '', drift_records: [] },
  'brain/claims.jsonl': '',
  'brain/observations.jsonl': '',
  'brain/events.jsonl': '',
  'brain/embeddings_manifest.json': { schema_version: '2.0.0', last_updated: '', embeddings: [] },
  'brain/graph.json': { schema_version: '2.0.0', last_updated: '', nodes: [], edges: [] },
};

const BOOTSTRAP_SHARDS = [
  'OPERATING_PRINCIPLES.md',
  'SOURCE_OF_TRUTH.md',
  'SAFETY.md',
  'COMMAND_LIFECYCLE.md',
  'PERSONA_PROTOCOL.md',
  'BRAIN_PROTOCOL.md',
];

/**
 * Migrate a V1 workspace to V2.
 *
 * @param {{
 *   workspaceDir?: string,
 *   cwd?: string,
 *   force?: boolean
 * }} [opts]
 * @returns {Promise<{
 *   status: 'migrated' | 'already-v2' | 'no-workspace',
 *   wsDir: string,
 *   created: string[],
 *   backupPath?: string
 * }>}
 */
export async function migrateV2({
  workspaceDir = '_testatlas',
  cwd = process.cwd(),
  force = false,
} = {}) {
  const wsDir = path.resolve(cwd, workspaceDir);
  const manifestPath = path.join(wsDir, '11_workspace_manifest.json');

  // Check if workspace exists
  const manifestExists = await readFile(manifestPath)
    .then(() => true)
    .catch(() => false);
  if (!manifestExists) {
    return { status: 'no-workspace', wsDir, created: [] };
  }

  // Check if already V2
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const alreadyV2 = manifest.schema_version === '2.0.0';
  if (alreadyV2 && !force) {
    // Repair mode: still copy missing V2 artifacts even when already V2.
    // This ensures personas, council templates, and brain schemas are
    // backfilled if the workspace was initialized before copyV2Artifacts
    // existed (e.g. old v2-migrate.js or init-workspace.js).
    const nowIso = now();
    const created = [];
    await copyV2Artifacts({ cwd, wsDir, nowIso, created });
    return {
      status: created.length > 0 ? 'repaired' : 'already-v2',
      wsDir,
      created,
    };
  }

  // Create backup (destructive — requires capability check).
  //
  // Phase 18-01 / ISSUE-010 (CRITICAL): previously this called assertCapability
  // with hardcoded literals + ignored the return value, making the gate
  // structurally inert. Load the user's actual config and respect the verdict.
  const cfg = await loadConfig({ cwd });
  const gate = assertCapability(cfg, 'destructive-fs');
  if (!gate.allowed) {
    const e = new Error(`v2-migrate halted: ${gate.reason}`);
    e.code = 'CAPABILITY_DENIED';
    throw e;
  }
  const nowIso = now();
  const backupPath = path.join(cwd, `_testatlas.bak.${nowIso.replace(/[:.]/g, '-')}`);
  await cp(wsDir, backupPath, { recursive: true, force: true });

  const created = [];

  // Create V2 directories
  for (const dir of V2_DIRS) {
    const fullPath = path.join(wsDir, dir);
    await mkdir(fullPath, { recursive: true });
  }

  // Write bootstrap files (copy from .testatlas if available, else write minimal)
  const suiteBootstrapDir = path.join(cwd, '_testatlas', 'bootstrap');
  for (const shard of BOOTSTRAP_SHARDS) {
    const targetPath = path.join(wsDir, 'bootstrap', shard);
    const sourcePath = path.join(suiteBootstrapDir, shard);
    const sourceExists = await readFile(sourcePath)
      .then(() => true)
      .catch(() => false);
    if (sourceExists && path.resolve(sourcePath) !== path.resolve(targetPath)) {
      await cp(sourcePath, targetPath);
      created.push(`bootstrap/${shard}`);
    }
  }

  // Write BOOTSTRAP.md if available
  const bootstrapSource = path.join(suiteBootstrapDir, 'BOOTSTRAP.md');
  const bootstrapTarget = path.join(wsDir, 'bootstrap', 'BOOTSTRAP.md');
  if (
    (await readFile(bootstrapSource)
      .then(() => true)
      .catch(() => false)) &&
    path.resolve(bootstrapSource) !== path.resolve(bootstrapTarget)
  ) {
    await cp(bootstrapSource, bootstrapTarget);
    created.push('bootstrap/BOOTSTRAP.md');
  }

  // Write brain skeleton files
  for (const [relPath, content] of Object.entries(BRAIN_FILES)) {
    const targetPath = path.join(wsDir, relPath);
    const exists = await readFile(targetPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      const data = typeof content === 'object' ? `${JSON.stringify(content, null, 2)}\n` : content;
      await writeFile(targetPath, data, 'utf8');
      created.push(relPath);
    }
  }

  // Copy V2 artifacts from suite source into workspace
  await copyV2Artifacts({ cwd, wsDir, nowIso, created });

  // Write brain README and agents README
  const brainReadmeSource = path.join(cwd, '_testatlas', 'brain', 'README.md');
  const brainReadmeTarget = path.join(wsDir, 'brain', 'README.md');
  if (
    (await readFile(brainReadmeSource)
      .then(() => true)
      .catch(() => false)) &&
    path.resolve(brainReadmeSource) !== path.resolve(brainReadmeTarget)
  ) {
    await cp(brainReadmeSource, brainReadmeTarget);
    created.push('brain/README.md');
  }

  const agentsReadmeSource = path.join(cwd, '_testatlas', 'agents', 'README.md');
  const agentsReadmeTarget = path.join(wsDir, 'agents', 'README.md');
  if (
    (await readFile(agentsReadmeSource)
      .then(() => true)
      .catch(() => false)) &&
    path.resolve(agentsReadmeSource) !== path.resolve(agentsReadmeTarget)
  ) {
    await cp(agentsReadmeSource, agentsReadmeTarget);
    created.push('agents/README.md');
  }

  // agents/registry.json is now handled by copyV2Artifacts (populated with
  // discovered persona IDs and council template IDs). No-op here for DRY.

  // Ensure history directory exists
  await mkdir(path.join(wsDir, 'history'), { recursive: true });

  // Write history files
  const decisionsPath = path.join(wsDir, 'history', 'decisions.md');
  const decisionsExists = await readFile(decisionsPath)
    .then(() => true)
    .catch(() => false);
  if (!decisionsExists) {
    await writeFile(
      decisionsPath,
      `---\nschema_version: "2.0.0"\nlast_updated: "${nowIso}"\n---\n\n# Decision Log\n\n*No decisions recorded yet.*\n`,
      'utf8',
    );
    created.push('history/decisions.md');
  }

  const changelogPath = path.join(wsDir, 'history', 'changelog.md');
  const changelogExists = await readFile(changelogPath)
    .then(() => true)
    .catch(() => false);
  if (!changelogExists) {
    await writeFile(
      changelogPath,
      `---\nschema_version: "2.0.0"\nlast_updated: "${nowIso}"\n---\n\n# Changelog\n\n*No changes recorded yet.*\n`,
      'utf8',
    );
    created.push('history/changelog.md');
  }

  // Defensive cleanup: remove legacy `brain/events.json` if present.
  // Older migration code emitted `events.json` (top-level `{events: [...]}`
  // array shape); V2 only uses `events.jsonl` (single-line JSONL append per
  // event). Keeping both ⇒ silently divergent audit trail. Surfaced post-
  // Phase-19 dogfood round 2 as NEW-002. ENOENT is the common case — swallow.
  // SAFETY: destructive-fs gate already enforced via `assertCapability(cfg, 'destructive-fs')` at function entry above.
  const legacyEventsJson = path.join(wsDir, 'brain', 'events.json');
  try {
    await unlink(legacyEventsJson);
    created.push('brain/events.json (removed: legacy artifact)');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  // Update manifest schema_version (additive, backward-compatible)
  manifest.schema_version = '2.0.0';
  manifest.lastUpdatedAt = nowIso;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // Append migration event
  const eventsPath = path.join(wsDir, 'brain', 'events.jsonl');
  const event = {
    id: `EVENT-${Date.now()}`,
    timestamp: nowIso,
    actor: 'v2-migrate.js',
    command: '/atlas:migrate',
    type: 'artifact_updated',
    summary: `${alreadyV2 ? 'Repaired' : 'Migrated'} workspace. Created/backfilled ${created.length} files.`,
    artifacts_read: [manifestPath],
    artifacts_written: created.map((c) => path.join(wsDir, c)),
    evidence: [],
    status: 'completed',
  };
  await writeFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');

  return { status: 'migrated', wsDir, created, backupPath };
}

if (isMainModule(import.meta.url)) {
  await runCli(process.argv.slice(2));
}

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
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/v2-migrate.js [--workspace <path>] [--cwd <path>] [--force]',
      );
      process.exit(0);
    } else {
      console.error(`v2-migrate: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await migrateV2(opts);
    console.log(`v2-migrate: ${r.status} at ${r.wsDir} (${r.created.length} files created)`);
    if (r.backupPath) console.log(`v2-migrate: backup at ${r.backupPath}`);
  } catch (err) {
    console.error(`v2-migrate: ${err.code ?? 'ERROR'} — ${err.message}`);
    process.exit(1);
  }
}
