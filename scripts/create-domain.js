// scripts/create-domain.js
//
// Plan 05-01 (SCR-01). Emits 3 files per new domain:
//   <wsDir>/domains/<slug>/domain.json     — validated against domain.schema.json
//   <wsDir>/domains/<slug>/index.md        — human prose entry point
//   <wsDir>/domains/<slug>/issues/index.md — per-domain issue rollup
//
// emit() handles domain.json (the only schema-validated record). The two
// markdown files are written directly via atomicWrite — they have no JSON
// counterpart and no schema.

import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { incrementManifestCount } from './lib/command-lifecycle.js';
import { now } from './lib/determinism.js';
import { emit } from './lib/emitter.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { slugify } from './lib/slug.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const DOMAIN_SCHEMA = 'https://testatlas.dev/schemas/v1/domain.schema.json';
// We don't have a domain.md template to render; we ship a minimal index.md
// inline. (Future plans may add `.testatlas/templates/domains/index.md`.)
const DOMAIN_JSON_TEMPLATE = '.testatlas/templates/domains/domain.json';

export async function createDomain(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  if (!args.name) throw err('TESTATLAS_INVALID_ARGS', 'create-domain: --name is required');
  if (!args.purpose) throw err('TESTATLAS_INVALID_ARGS', 'create-domain: --purpose is required');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);

  const slug = slugify(args.name);
  const id = `domain-${slug}`;
  const nowIso = now();

  const record = {
    $schema: DOMAIN_SCHEMA,
    id,
    name: slug,
    displayName: args.displayName ?? args.name,
    status: args.status ?? 'mapped',
    confidence: args.confidence ?? 'low',
    purpose: args.purpose,
    primaryUserGoals: args.primaryUserGoals ?? [],
    personas: args.personas ?? [],
    entryPoints: args.entryPoints ?? [],
    routes: [],
    apis: [],
    components: [],
    entities: [],
    flows: [],
    dependencies: [],
    issues: [],
    evidence: [],
    openQuestions: [],
    lastUpdatedAt: nowIso,
  };

  const targetDir = `domains/${slug}`;

  // We need the directory tree to exist before atomicWrite (which uses
  // exclusive-create on a tmp file in the same dir).
  if (!args.dryRun) {
    await mkdir(path.join(wsDir, targetDir, 'issues'), { recursive: true });
  }

  // Use emit for the schema-validated domain.json. We bypass the markdown
  // template (DOMAIN has no canonical .md template; emit() expects one), so
  // we instead use the plain `domain.json` template path (which is just an
  // unvalidated reference; emit() validates the RECORD, not the template).
  const r = await emit(
    {
      schemaId: DOMAIN_SCHEMA,
      templateMdPath: DOMAIN_JSON_TEMPLATE, // template content unused for .md by us; emit reads it for parity
      targetDir,
      filenameMd: () => 'domain.json.skip', // we'll write our own .md below
      filenameJson: () => 'domain.json',
      record,
      cwd,
      workspaceDir: wsDir,
      // We always set dryRun=true on emit so it doesn't write the bogus
      // 'domain.json.skip' file; we then atomicWrite domain.json ourselves.
      dryRun: true,
    },
    _inject,
  );

  if (!args.dryRun) {
    await _atomicWrite(
      path.join(wsDir, targetDir, 'domain.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    await _atomicWrite(
      path.join(wsDir, targetDir, 'index.md'),
      `# Domain: ${record.displayName}\n\n${record.purpose}\n`,
    );
    await _atomicWrite(
      path.join(wsDir, targetDir, 'issues/index.md'),
      `# Issues for ${id}\n\n(no issues filed yet)\n`,
    );
    await incrementManifestCount(wsDir, 'domains');

    // V2 brain side-effects (Plan 14-02): when _testatlas/brain/ is present,
    // also update brain/domains.json and brain/state.json counts. Tolerate
    // absence so V1-only consumers see no behavior change.
    await updateV2Brain(wsDir, record);
  }

  return {
    id,
    domainJson: path.join(wsDir, targetDir, 'domain.json'),
    indexMd: path.join(wsDir, targetDir, 'index.md'),
    issuesIndexMd: path.join(wsDir, targetDir, 'issues/index.md'),
    validated: r.validated,
  };
}

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * V2 brain update — best-effort. If `_testatlas/brain/` is missing, does
 * nothing (V1-only workspace). Otherwise updates domains.json index and
 * bumps state.json counts.domains.
 */
async function updateV2Brain(wsDir, record) {
  const brainDir = path.join(wsDir, 'brain');
  try {
    await stat(brainDir);
  } catch {
    return;
  }

  // domains.json index entry
  const domainsPath = path.join(brainDir, 'domains.json');
  let idx;
  try {
    idx = JSON.parse(await readFile(domainsPath, 'utf8'));
  } catch {
    idx = { schema_version: '2.0.0', last_updated: '', domains: [] };
  }
  if (!Array.isArray(idx.domains)) idx.domains = [];
  if (!idx.domains.some((d) => d.id === record.id)) {
    idx.domains.push({
      id: record.id,
      slug: record.name,
      status: record.status ?? 'mapped',
      display_name: record.displayName ?? record.name,
    });
    idx.last_updated = now();
    await atomicWrite(domainsPath, `${JSON.stringify(idx, null, 2)}\n`);
  }

  // state.json counts
  const statePath = path.join(brainDir, 'state.json');
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return; // No state.json — leave alone.
  }
  if (state?.counts && typeof state.counts.domains === 'number') {
    state.counts.domains = idx.domains.length;
    if (state.status) {
      state.status.last_updated = now();
      state.status.last_command = 'create-domain';
    }
    await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
}
if (isMainModule(import.meta.url)) {
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
      case '--display-name':
        opts.displayName = argv[++i];
        break;
      case '--purpose':
        opts.purpose = argv[++i];
        break;
      case '--status':
        opts.status = argv[++i];
        break;
      case '--confidence':
        opts.confidence = argv[++i];
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
          'Usage: node scripts/create-domain.js --name <s> --purpose <s> ' +
            '[--display-name <s>] [--status <s>] [--confidence <s>] ' +
            '[--workspace <path>] [--cwd <path>] [--dry-run]',
        );
        process.exit(0);
        break;
      default:
        console.error(`create-domain: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await createDomain(opts);
    console.log(
      `create-domain: ${opts.dryRun ? 'would write' : 'wrote'} ${r.domainJson} + index.md + issues/index.md`,
    );
  } catch (e) {
    console.error(`create-domain: ${e.code ?? 'ERROR'} — ${e.message}`);
    if (e.validationErrors) {
      for (const v of e.validationErrors) console.error(`  ${v.instancePath || '/'} ${v.message}`);
    }
    process.exit(1);
  }
}
