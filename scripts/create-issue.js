// scripts/create-issue.js
//
// Plan 05-01 (SCR-01). Emits a single issue under
// `<wsDir>/to_fix/ISSUE-<id>-<slug>.{md,json}` validated against
// issue.schema.json. Enforces no-evidence-no-finding (refuses on empty
// `evidence` array — TESTATLAS_NO_EVIDENCE).
//
// CLI:
//   node scripts/create-issue.js --title "..." --severity medium \
//                                --evidence EVIDENCE-001 [--evidence ...] \
//                                [--workspace <path>] [--cwd <path>] [--dry-run] [--help]

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addIssueToCrossCutIndexes,
  addIssueToDomainIndex,
  addIssueToFlowIndex,
  incrementManifestCount,
} from './lib/command-lifecycle.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { emit } from './lib/emitter.js';
import { loadConfig } from './lib/load-config.js';
import { ID_PATTERNS, padIssueNumber, slugify } from './lib/slug.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const ISSUE_SCHEMA = 'https://testatlas.dev/schemas/v1/issue.schema.json';
const ISSUE_TEMPLATE = '.testatlas/templates/issues/ISSUE.md';
const TARGET_DIR = 'to_fix';

/**
 * Read manifest counts.issues, scan disk for max ISSUE-XXX, return max+1
 * (3-digit padded). Disk wins over manifest if it's higher.
 */
async function allocateNextIssueId(wsDir) {
  let manifestFloor = 0;
  try {
    const m = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
    manifestFloor = m?.counts?.issues ?? 0;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let diskMax = 0;
  try {
    const entries = await sortedReaddir(path.join(wsDir, TARGET_DIR), { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = e.name.match(/^ISSUE-(\d{3,})-/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > diskMax) diskMax = n;
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  return padIssueNumber(Math.max(manifestFloor, diskMax) + 1);
}

/**
 * @param {{
 *   title: string,
 *   severity?: 'critical'|'high'|'medium'|'low'|'enhancement',
 *   confidence?: 'confirmed'|'strong-suspect'|'needs-validation',
 *   type?: string,
 *   domain: string,
 *   flow?: string|null,
 *   summary?: string,
 *   expectedBehavior?: string,
 *   actualBehavior?: string,
 *   userImpact?: string,
 *   reproductionSteps?: string[],
 *   frequency?: 'always'|'intermittent'|'unknown',
 *   evidence: string[],
 *   acceptanceCriteria?: string[],
 *   workspaceDir?: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 * }} args
 * @param {object} [_inject]
 */
export async function createIssue(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  _assertNotUpdate('command');

  if (!Array.isArray(args.evidence) || args.evidence.length === 0) {
    const e = new Error(
      'create-issue: refusing to file an issue with no evidence (no-evidence-no-finding rule).',
    );
    e.code = 'TESTATLAS_NO_EVIDENCE';
    throw e;
  }
  if (!args.title || typeof args.title !== 'string') {
    const e = new Error('create-issue: --title is required');
    e.code = 'TESTATLAS_INVALID_ARGS';
    throw e;
  }
  if (!args.domain || !ID_PATTERNS.domain.test(args.domain)) {
    const e = new Error(`create-issue: --domain must match domain-<slug> (got "${args.domain}")`);
    e.code = 'TESTATLAS_INVALID_ARGS';
    throw e;
  }

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);

  const seq = await allocateNextIssueId(wsDir);
  const slug = slugify(args.title);
  const id = `ISSUE-${seq}-${slug}`;
  const nowIso = now();

  const record = {
    $schema: ISSUE_SCHEMA,
    id,
    slug,
    title: args.title,
    status: 'new',
    severity: args.severity ?? 'medium',
    confidence: args.confidence ?? 'needs-validation',
    type: args.type ?? 'functional',
    domain: args.domain,
    flow: args.flow ?? null,
    environment: args.environment ?? config.defaultEnvironment ?? 'local',
    persona: args.persona ?? '',
    foundOn: nowIso,
    foundBy: args.foundBy ?? 'agent',
    summary: args.summary ?? args.title,
    expectedBehavior: args.expectedBehavior ?? '(to be filled)',
    actualBehavior: args.actualBehavior ?? '(to be filled)',
    userImpact: args.userImpact ?? '',
    reproductionSteps: args.reproductionSteps ?? [],
    frequency: args.frequency ?? 'unknown',
    evidence: args.evidence,
    acceptanceCriteria:
      args.acceptanceCriteria && args.acceptanceCriteria.length > 0
        ? args.acceptanceCriteria
        : ['issue resolved per description'],
    lastUpdatedAt: nowIso,
  };

  const result = await emit(
    {
      schemaId: ISSUE_SCHEMA,
      templateMdPath: ISSUE_TEMPLATE,
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

  // Post-creation: maintain derived state per log-issue command spec.
  if (!args.dryRun) {
    await incrementManifestCount(wsDir, 'issues');
    await addIssueToCrossCutIndexes(wsDir, record);
    await addIssueToDomainIndex(wsDir, record.domain, record.id);
    if (record.flow) {
      await addIssueToFlowIndex(wsDir, record.flow, record.id);
    }
  }

  return result;
}

// ─────────────────────────────── CLI wrapper ───────────────────────────────

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = { evidence: [], reproductionSteps: [], acceptanceCriteria: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--title':
        opts.title = argv[++i];
        break;
      case '--severity':
        opts.severity = argv[++i];
        break;
      case '--confidence':
        opts.confidence = argv[++i];
        break;
      case '--type':
        opts.type = argv[++i];
        break;
      case '--domain':
        opts.domain = argv[++i];
        break;
      case '--flow':
        opts.flow = argv[++i];
        break;
      case '--summary':
        opts.summary = argv[++i];
        break;
      case '--expected-behavior':
        opts.expectedBehavior = argv[++i];
        break;
      case '--actual-behavior':
        opts.actualBehavior = argv[++i];
        break;
      case '--user-impact':
        opts.userImpact = argv[++i];
        break;
      case '--environment':
        opts.environment = argv[++i];
        break;
      case '--persona':
        opts.persona = argv[++i];
        break;
      case '--found-by':
        opts.foundBy = argv[++i];
        break;
      case '--evidence':
        opts.evidence.push(argv[++i]);
        break;
      case '--repro-steps':
        opts.reproductionSteps.push(argv[++i]);
        break;
      case '--frequency':
        opts.frequency = argv[++i];
        break;
      case '--acceptance-criteria':
        opts.acceptanceCriteria.push(argv[++i]);
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
          'Usage: node scripts/create-issue.js --title <s> --domain <id> --evidence <id> [--evidence <id>...] ' +
            '[--severity <s>] [--confidence <s>] [--type <s>] [--flow <id>] [--summary <s>] ' +
            '[--expected-behavior <s>] [--actual-behavior <s>] [--user-impact <s>] ' +
            '[--repro-steps <s>] [--frequency <always|intermittent|unknown>] ' +
            '[--acceptance-criteria <s>] ' +
            '[--environment <s>] [--persona <s>] [--found-by <s>] ' +
            '[--workspace <path>] [--cwd <path>] [--dry-run]\n\n' +
            'Schema-field flags (issue.schema.json required fields):\n' +
            '  --repro-steps <step>           Reproduction step (repeat for multiple). Schema: reproductionSteps[].\n' +
            '  --frequency <enum>             Reproduction frequency (always|intermittent|unknown). Schema: frequency.\n' +
            '  --acceptance-criteria <text>   Acceptance criterion (repeat for multiple). Schema: acceptanceCriteria[].',
        );
        process.exit(0);
        break;
      default:
        console.error(`create-issue: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await createIssue(opts);
    console.log(
      `create-issue: ${opts.dryRun ? 'would write' : 'wrote'} ${r.mdPath} + ${r.jsonPath}`,
    );
  } catch (err) {
    console.error(`create-issue: ${err.code ?? 'ERROR'} — ${err.message}`);
    if (err.validationErrors) {
      for (const e of err.validationErrors) {
        console.error(`  ${e.instancePath || '/'} ${e.message}`);
      }
    }
    process.exit(1);
  }
}
