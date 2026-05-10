// scripts/create-evidence-record.js
//
// Plan 05-01 (SCR-01). Emits an evidence record:
//   <wsDir>/evidence/EVIDENCE-<id>/evidence.{md,json}
// validated against evidence.schema.json. `redacted` defaults to false.
// If a captured-file path is supplied via --file <path>, content-hash.js is
// invoked over the file contents and `record.hash` is populated.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { incrementManifestCount } from './lib/command-lifecycle.js';
import { hashContent } from './lib/content-hash.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { emit } from './lib/emitter.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { padIssueNumber } from './lib/slug.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const EVIDENCE_SCHEMA = 'https://testatlas.dev/schemas/v1/evidence.schema.json';
const EVIDENCE_TEMPLATE = '.testatlas/templates/evidence/evidence_record.md';

async function allocateNextEvidenceId(wsDir) {
  let manifestFloor = 0;
  try {
    const m = JSON.parse(await readFile(path.join(wsDir, '11_workspace_manifest.json'), 'utf8'));
    manifestFloor = m?.counts?.evidenceRecords ?? 0;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let diskMax = 0;
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'evidence'), { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const m = e.name.match(/^EVIDENCE-(\d{3,})/);
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

export async function createEvidenceRecord(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  _assertNotUpdate('command');

  if (!args.type) throw err('TESTATLAS_INVALID_ARGS', 'create-evidence-record: --type is required');
  if (!args.description)
    throw err('TESTATLAS_INVALID_ARGS', 'create-evidence-record: --description is required');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const environment = args.environment ?? config.defaultEnvironment ?? 'local';

  const seq = await allocateNextEvidenceId(wsDir);
  const id = `EVIDENCE-${seq}`;
  const targetDir = `evidence/${id}`;
  const nowIso = now();

  // Default to a path under evidence/<id>/ if no explicit path given.
  const recordPath = args.path ?? `evidence/${id}/${args.fileName ?? 'capture.bin'}`;

  // Compute hash of captured-file contents if --file <abs-or-cwd-relative> was given.
  let fileHash;
  if (args.file) {
    const abs = path.resolve(cwd, args.file);
    const buf = await readFile(abs, 'utf8').catch(() => null);
    if (buf !== null) fileHash = hashContent(buf);
  }

  const record = {
    $schema: EVIDENCE_SCHEMA,
    id,
    type: args.type,
    path: recordPath,
    domain: args.domain ?? null,
    flow: args.flow ?? null,
    issue: args.issue ?? null,
    capturedOn: nowIso,
    environment,
    description: args.description,
    redacted: args.redacted ?? false,
    ...(fileHash ? { hash: fileHash } : {}),
  };

  // Atomic-write requires the parent dir to exist (it stages a tmp file in
  // the same dir before rename). evidence/<id>/ may not exist yet.
  if (!args.dryRun) {
    await mkdir(path.join(wsDir, targetDir), { recursive: true });
  }

  const result = await emit(
    {
      schemaId: EVIDENCE_SCHEMA,
      templateMdPath: EVIDENCE_TEMPLATE,
      targetDir,
      filenameMd: () => 'evidence.md',
      filenameJson: () => 'evidence.json',
      record,
      cwd,
      workspaceDir: wsDir,
      dryRun: args.dryRun ?? false,
    },
    _inject,
  );

  if (!args.dryRun) {
    await incrementManifestCount(wsDir, 'evidenceRecords');
  }

  return result;
}

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}
if (isMainModule(import.meta.url)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--type':
        opts.type = argv[++i];
        break;
      case '--path':
        opts.path = argv[++i];
        break;
      case '--description':
        opts.description = argv[++i];
        break;
      case '--environment':
        opts.environment = argv[++i];
        break;
      case '--domain':
        opts.domain = argv[++i];
        break;
      case '--flow':
        opts.flow = argv[++i];
        break;
      case '--issue':
        opts.issue = argv[++i];
        break;
      case '--file':
        opts.file = argv[++i];
        break;
      case '--redacted':
        opts.redacted = argv[++i] === 'true';
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
          'Usage: node scripts/create-evidence-record.js --type <t> --description <s> ' +
            '[--path <p>] [--environment <s>] [--domain <id>] [--flow <id>] [--issue <id>] ' +
            '[--file <path>] [--redacted true|false] ' +
            '[--workspace <path>] [--cwd <path>] [--dry-run]',
        );
        process.exit(0);
        break;
      default:
        console.error(`create-evidence-record: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await createEvidenceRecord(opts);
    console.log(
      `create-evidence-record: ${opts.dryRun ? 'would write' : 'wrote'} ${r.mdPath} + ${r.jsonPath}`,
    );
  } catch (e) {
    console.error(`create-evidence-record: ${e.code ?? 'ERROR'} — ${e.message}`);
    if (e.validationErrors) {
      for (const v of e.validationErrors) console.error(`  ${v.instancePath || '/'} ${v.message}`);
    }
    process.exit(1);
  }
}
