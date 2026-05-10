#!/usr/bin/env node
// scripts/reconcile-counts.js
//
// Phase 22 Plan 02 Task 1 — DEC-001 + DEC-003 producer.
//
// Reconciles `_testatlas/brain/state.json` (counts, project, confidence,
// next_recommended_commands) and `_testatlas/brain/manifest.json` (adapters)
// with on-disk truth.
//
// CLI:
//   node scripts/reconcile-counts.js [--cwd <dir>] [--dry-run]
//
// Programmatic:
//   import { reconcileCounts } from './reconcile-counts.js';
//   const r = await reconcileCounts({ cwd, dryRun });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

async function countDirsMatching(dir, regex) {
  try {
    const entries = await sortedReaddir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && regex.test(e.name)).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

async function listAdapters(adaptersDir) {
  try {
    const entries = await sortedReaddir(adaptersDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readJsonOr(p, fallback) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function derivePrimaryStack(pkg) {
  const stack = [];
  if (pkg && typeof pkg === 'object') {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if (pkg.engines && pkg.engines.node) stack.push('node');
    else if (deps.commander || deps.ajv || deps.semver) stack.push('node');
    if (deps.react || deps['react-dom']) stack.push('react');
    if (deps.vue) stack.push('vue');
    if (deps.svelte) stack.push('svelte');
    if (deps.express || deps.fastify || deps.koa) stack.push('http-server');
    if (deps.typescript) stack.push('typescript');
  }
  if (stack.length === 0) stack.push('node');
  return stack;
}

async function deriveConfidence(state, councilCount, evidenceCount, brainDir) {
  // Preserve any prior non-default confidence.
  const prior = state.confidence?.overall;
  if (prior && prior !== 'unknown' && prior !== '') return prior;
  // Check for stale-requires-review drift records.
  try {
    const drift = JSON.parse(await readFile(path.join(brainDir, 'drift.json'), 'utf8'));
    if (
      Array.isArray(drift.drift_records) &&
      drift.drift_records.some((r) => r.drift_status === 'stale_requires_review')
    ) {
      return 'low';
    }
  } catch {
    /* ENOENT or unparseable — ignore */
  }
  if (councilCount + evidenceCount > 0) return 'medium';
  return 'low';
}

function deriveNextRecommended(_state, councilCount, evidenceCount) {
  if (evidenceCount === 0) return ['/atlas:explore-codebase'];
  if (councilCount === 0) return ['/atlas:council'];
  return [];
}

/**
 * @param {{ cwd?: string, dryRun?: boolean }} args
 * @param {{ assertNotUpdate?: typeof assertNotUpdate, atomicWrite?: typeof atomicWrite }} _inject
 */
export async function reconcileCounts(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const wsDir = path.join(cwd, '_testatlas');
  const brainDir = path.join(wsDir, 'brain');

  const councilSessions = await countDirsMatching(
    path.join(wsDir, 'agents', 'councils', 'sessions'),
    /^COUNCIL-/,
  );
  const evidenceArtifacts = await countDirsMatching(path.join(wsDir, 'evidence'), /^EVIDENCE-/);
  const adapters = await listAdapters(path.join(cwd, '.testatlas', 'adapters'));
  const pkg = await readJsonOr(path.join(cwd, 'package.json'), {});

  // Read existing state.json + manifest.json.
  const statePath = path.join(brainDir, 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));

  // Snapshot the *content-relevant* fields (excluding last_updated which always
  // bumps) for an idempotency check.
  const stateBefore = JSON.stringify({
    counts: state.counts,
    project: state.project,
    confidence: state.confidence,
    next_recommended_commands: state.next_recommended_commands,
  });

  state.counts = state.counts ?? {};
  state.counts.council_sessions = councilSessions;
  state.counts.evidence_artifacts = evidenceArtifacts;
  state.project = state.project ?? {};
  if (pkg.name) state.project.name = pkg.name;
  else if (state.project.name == null) state.project.name = '';
  state.project.primary_stack = derivePrimaryStack(pkg);
  state.confidence = state.confidence ?? {};
  state.confidence.overall = await deriveConfidence(
    state,
    councilSessions,
    evidenceArtifacts,
    brainDir,
  );
  state.confidence.highest_risk_domains = state.confidence.highest_risk_domains ?? [];
  state.confidence.stale_domains = state.confidence.stale_domains ?? [];
  state.next_recommended_commands = deriveNextRecommended(
    state,
    councilSessions,
    evidenceArtifacts,
  );

  const stateAfter = JSON.stringify({
    counts: state.counts,
    project: state.project,
    confidence: state.confidence,
    next_recommended_commands: state.next_recommended_commands,
  });
  const stateChanged = stateBefore !== stateAfter;

  if (stateChanged) {
    state.status = state.status ?? {};
    state.status.last_updated = now();
  }

  const manifestPath = path.join(brainDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const sortedAdapters = [...adapters].sort();
  const manifestBefore = JSON.stringify(manifest.adapters ?? []);
  const manifestAfter = JSON.stringify(sortedAdapters);
  const manifestChanged = manifestBefore !== manifestAfter;
  if (manifestChanged) {
    manifest.adapters = sortedAdapters;
    manifest.last_updated = now();
  }

  if (!args.dryRun) {
    if (stateChanged) {
      await _atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
    }
    if (manifestChanged) {
      await _atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  return {
    ok: true,
    stateChanged,
    manifestChanged,
    counts: { council_sessions: councilSessions, evidence_artifacts: evidenceArtifacts },
    adapters: sortedAdapters,
    dryRun: args.dryRun ?? false,
  };
}

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') opts.cwd = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/reconcile-counts.js [--cwd <dir>] [--dry-run]');
      process.exit(0);
    } else {
      console.error(`reconcile-counts: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await reconcileCounts(opts);
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error(`reconcile-counts: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
