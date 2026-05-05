// scripts/create-flow.js
//
// Plan 05-01 (SCR-01). Emits flows/FLOW-<domain>-<slug>.{md,json} validated
// against flow.schema.json.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incrementManifestCount } from './lib/command-lifecycle.js';
import { now } from './lib/determinism.js';
import { emit } from './lib/emitter.js';
import { loadConfig } from './lib/load-config.js';
import { ID_PATTERNS, slugify } from './lib/slug.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const FLOW_SCHEMA = 'https://testatlas.dev/schemas/v1/flow.schema.json';
const FLOW_TEMPLATE = '.testatlas/templates/flows/flow.md';
const TARGET_DIR = 'flows';

/**
 * @param {{
 *   name: string,
 *   domain: string,             // domain-<slug>
 *   persona: string,
 *   priority?: 'critical'|'high'|'medium'|'low'|'enhancement',
 *   status?: 'draft'|'mapped'|'ready_to_test'|'tested'|'blocked'|'fixed_pending_retest'|'retested',
 *   confidence?: 'low'|'medium'|'high',
 *   goal: string,
 *   workspaceDir?: string, cwd?: string, dryRun?: boolean,
 * }} args
 */
export async function createFlow(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  _assertNotUpdate('command');

  if (!args.name) throw err('TESTATLAS_INVALID_ARGS', 'create-flow: --name is required');
  if (!args.domain || !ID_PATTERNS.domain.test(args.domain)) {
    throw err(
      'TESTATLAS_INVALID_ARGS',
      `create-flow: --domain must match domain-<slug> (got "${args.domain}")`,
    );
  }
  if (!args.persona) throw err('TESTATLAS_INVALID_ARGS', 'create-flow: --persona is required');
  if (!args.goal) throw err('TESTATLAS_INVALID_ARGS', 'create-flow: --goal is required');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);

  const domainSlug = args.domain.replace(/^domain-/, '');
  const flowSlug = slugify(args.name);
  const id = `FLOW-${domainSlug}-${flowSlug}`;
  const nowIso = now();

  const record = {
    $schema: FLOW_SCHEMA,
    id,
    name: args.name,
    domain: args.domain,
    persona: args.persona,
    priority: args.priority ?? 'medium',
    status: args.status ?? 'mapped',
    confidence: args.confidence ?? 'low',
    goal: args.goal,
    preconditions: args.preconditions ?? [],
    entryPoints: args.entryPoints ?? [],
    expectedBehavior: args.expectedBehavior ?? [],
    alternatePaths: args.alternatePaths ?? [],
    edgeCases: args.edgeCases ?? [],
    failurePaths: args.failurePaths ?? [],
    dataRequirements: args.dataRequirements ?? [],
    dependencies: args.dependencies ?? [],
    testScenarios: args.testScenarios ?? [],
    evidence: args.evidence ?? [],
    issues: args.issues ?? [],
    retestNotes: args.retestNotes ?? [],
    lastUpdatedAt: nowIso,
  };

  const result = await emit(
    {
      schemaId: FLOW_SCHEMA,
      templateMdPath: FLOW_TEMPLATE,
      targetDir: TARGET_DIR,
      filenameMd: (r) => `${r.id}.md`,
      filenameJson: (r) => `${r.id}.json`,
      record,
      cwd,
      workspaceDir: wsDir,
      dryRun: args.dryRun ?? false,
    },
    _inject,
  );

  if (!args.dryRun) {
    await incrementManifestCount(wsDir, 'flows');
  }

  return result;
}

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--name':
        opts.name = argv[++i];
        break;
      case '--domain':
        opts.domain = argv[++i];
        break;
      case '--persona':
        opts.persona = argv[++i];
        break;
      case '--priority':
        opts.priority = argv[++i];
        break;
      case '--status':
        opts.status = argv[++i];
        break;
      case '--confidence':
        opts.confidence = argv[++i];
        break;
      case '--goal':
        opts.goal = argv[++i];
        break;
      case '--workspace':
        opts.workspaceDir = argv[++i];
        break;
      case '--cwd':
        opts.cwd = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/create-flow.js --name <s> --domain <id> --persona <s> --goal <s> ' +
            '[--priority <s>] [--status <s>] [--confidence <s>] ' +
            '[--workspace <path>] [--cwd <path>] [--dry-run]',
        );
        process.exit(0);
        break;
      default:
        console.error(`create-flow: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await createFlow(opts);
    console.log(
      `create-flow: ${opts.dryRun ? 'would write' : 'wrote'} ${r.mdPath} + ${r.jsonPath}`,
    );
  } catch (e) {
    console.error(`create-flow: ${e.code ?? 'ERROR'} — ${e.message}`);
    if (e.validationErrors) {
      for (const v of e.validationErrors) console.error(`  ${v.instancePath || '/'} ${v.message}`);
    }
    process.exit(1);
  }
}
