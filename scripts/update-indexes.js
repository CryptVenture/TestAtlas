// scripts/update-indexes.js
//
// Plan 05-01 (SCR-01). Regenerates the on-disk-derived sections of
// `<wsDir>/09_artifact_index.md` from the live workspace tree, preserving
// human prose OUTSIDE the generated markers (markers.renderSection()).
//
// Refuses to write if the target file has malformed markers
// (TESTATLAS_MARKER_INVALID propagated from markers.parseMarkers).
//
// CLI:
//   node scripts/update-indexes.js [--only=domains,flows] [--workspace <p>]
//                                  [--cwd <p>] [--dry-run] [--help]

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from './lib/atomic-write.js';
import { hashContent } from './lib/content-hash.js';
import { now, sortedReaddir } from './lib/determinism.js';
import { isMainModule } from './lib/is-main.js';
import { loadConfig } from './lib/load-config.js';
import { parseMarkers, renderSection } from './lib/markers.js';
import { assertNotUpdate } from './lib/workspace-guard.js';

const ARTIFACT_INDEX = '09_artifact_index.md';
const MANIFEST = '11_workspace_manifest.json';

/**
 * The nine sections this script regenerates. Ordered as in the canonical
 * template's TOC.
 *
 *   - domain-docs:        list of `<wsDir>/domains/<slug>/index.md`
 *   - flow-docs:          list of `<wsDir>/flows/FLOW-*.md`
 *   - issue-docs:         list of `<wsDir>/to_fix/ISSUE-*.md`
 *   - evidence:           list of `EVIDENCE-<id>` directory names under evidence/
 *   - reports:            list of `<wsDir>/reports/*.md`
 *   - canonical-docs:     14 canonical files (00_*.md..13_*.md + 11_*.json + 12_*.json)
 *   - json-maps:          *.json at root that are NOT canonical (11_/12_ excluded)
 *   - command-outputs:    directories under evidence/ that are NOT EVIDENCE-<id>
 *   - sub-agent-outputs:  handoffs/HANDOFF-*.md
 */
const SECTIONS = [
  'domain-docs',
  'flow-docs',
  'issue-docs',
  'evidence',
  'reports',
  'canonical-docs',
  'json-maps',
  'command-outputs',
  'sub-agent-outputs',
  'council-sessions',
];

async function listDomains(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'domains'), { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      out.push(`domains/${e.name}/index.md`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

async function listFlows(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'flows'), { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md') && e.name.startsWith('FLOW-')) {
        out.push(`flows/${e.name}`);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

async function listIssues(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'to_fix'), { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md') && /^ISSUE-\d{3,}-/.test(e.name)) {
        out.push(`to_fix/${e.name}`);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

async function listEvidence(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'evidence'), { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && /^EVIDENCE-/.test(e.name)) {
        out.push(e.name);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

async function listReports(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'reports'), { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) out.push(`reports/${e.name}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

// canonical-docs: 00_*.md..13_*.md + 11_workspace_manifest.json + 12_app_map.json.
async function listCanonicalDocs(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(wsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (/^\d{2}_.*\.md$/.test(e.name)) out.push(e.name);
      else if (e.name === '11_workspace_manifest.json') out.push(e.name);
      else if (e.name === '12_app_map.json') out.push(e.name);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

// json-maps: *.json files at workspace root that are NOT the canonical 11_/12_ JSON.
async function listJsonMaps(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(wsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      if (e.name === '11_workspace_manifest.json') continue;
      if (e.name === '12_app_map.json') continue;
      out.push(e.name);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

// command-outputs: directories under evidence/<command>/ — NOT EVIDENCE-<id> records.
// Distinguishing rule mirrors check-schemas.js isRawEvidenceDump():
// `^EVIDENCE-\d{3,}` parents are schema-bound sidecar dirs, not command outputs.
async function listCommandOutputs(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'evidence'), { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (/^EVIDENCE-\d{3,}/.test(e.name)) continue; // schema-bound sidecar dir
      out.push(`evidence/${e.name}/`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

// council-sessions: agents/councils/sessions/COUNCIL-*/ directory listing.
// DEC-009 (Phase 22 / DRIFT-009): operators had no entry-point from the
// artifact index to discover existing council sessions on disk.
async function listCouncilSessions(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'agents', 'councils', 'sessions'), {
      withFileTypes: true,
    });
    for (const e of entries) {
      if (!(e.isDirectory() && /^COUNCIL-/.test(e.name))) continue;
      const sessionPath = path.join(
        wsDir,
        'agents',
        'councils',
        'sessions',
        e.name,
        'session.json',
      );
      let session = null;
      try {
        session = JSON.parse(await readFile(sessionPath, 'utf8'));
      } catch {
        // Missing or malformed session.json — fall back to path-only entry (back-compat).
      }
      if (session === null) {
        out.push(`agents/councils/sessions/${e.name}/`);
        continue;
      }
      const topic = String(session.topic ?? '(no topic)').slice(0, 80);
      const mode = session.executionMode ?? 'unknown';
      const participants = Array.isArray(session.participants) ? session.participants.length : 0;
      const status = session.status ?? 'unknown';
      out.push(
        `agents/councils/sessions/${e.name}/ — ${topic} (mode=${mode}, participants=${participants}, status=${status})`,
      );
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

// sub-agent-outputs: handoffs/HANDOFF-*.md
async function listSubAgentOutputs(wsDir) {
  const out = [];
  try {
    const entries = await sortedReaddir(path.join(wsDir, 'handoffs'), { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md') && e.name.startsWith('HANDOFF-')) {
        out.push(`handoffs/${e.name}`);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return out.sort();
}

async function buildSectionBody(section, wsDir) {
  let items;
  switch (section) {
    case 'domain-docs':
      items = await listDomains(wsDir);
      break;
    case 'flow-docs':
      items = await listFlows(wsDir);
      break;
    case 'issue-docs':
      items = await listIssues(wsDir);
      break;
    case 'evidence':
      items = await listEvidence(wsDir);
      break;
    case 'reports':
      items = await listReports(wsDir);
      break;
    case 'canonical-docs':
      items = await listCanonicalDocs(wsDir);
      break;
    case 'json-maps':
      items = await listJsonMaps(wsDir);
      break;
    case 'command-outputs':
      items = await listCommandOutputs(wsDir);
      break;
    case 'sub-agent-outputs':
      items = await listSubAgentOutputs(wsDir);
      break;
    case 'council-sessions':
      items = await listCouncilSessions(wsDir);
      break;
    default:
      throw new Error(`update-indexes: unknown section "${section}"`);
  }
  if (items.length === 0) return `(no ${section.replace('-docs', '')} yet)`;
  return items.map((i) => `- ${i}`).join('\n');
}

export async function updateIndexes(args = {}, _inject = {}) {
  const _assertNotUpdate = _inject.assertNotUpdate ?? assertNotUpdate;
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  _assertNotUpdate('command');

  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig({ cwd });
  const wsDir = path.resolve(cwd, args.workspaceDir ?? config.workspaceDir);
  const dryRun = args.dryRun ?? false;
  const onlySet = args.only ? new Set(args.only) : null;

  const indexPath = path.join(wsDir, ARTIFACT_INDEX);
  const manifestPath = path.join(wsDir, MANIFEST);

  let original;
  try {
    original = await readFile(indexPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`update-indexes: ${ARTIFACT_INDEX} not found at ${indexPath}`);
      e.code = 'TESTATLAS_INDEX_MISSING';
      throw e;
    }
    throw err;
  }

  // Surface marker errors loudly — markers.renderSection will throw on its own
  // call, but we also pre-check so the caller gets a clean error before any
  // section processing.
  const { errors: parseErrors } = parseMarkers(original);
  if (parseErrors.length > 0) {
    const e = new Error(
      `update-indexes: refusing to write — ${ARTIFACT_INDEX} has marker errors:\n  ${parseErrors
        .map((x) => `[${x.code} line ${x.line}] ${x.message}`)
        .join('\n  ')}`,
    );
    e.code = 'TESTATLAS_MARKER_INVALID';
    e.errors = parseErrors;
    throw e;
  }

  let text = original;
  const updatedSections = [];
  for (const section of SECTIONS) {
    if (onlySet && !onlySet.has(section)) continue;
    const body = await buildSectionBody(section, wsDir);
    try {
      text = renderSection(text, section, body);
      updatedSections.push({ section, hash: hashContent(body.split('\n')) });
    } catch (err) {
      if (err.code === 'TESTATLAS_SECTION_NOT_FOUND') continue; // section absent in this template — skip
      throw err;
    }
  }

  // Update manifest's generatedSections for 09_artifact_index.md.
  let manifestText;
  try {
    manifestText = await readFile(manifestPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let nextManifest;
  if (manifestText) {
    const manifest = JSON.parse(manifestText);
    manifest.generatedSections = manifest.generatedSections ?? {};
    const fileKey = ARTIFACT_INDEX;
    manifest.generatedSections[fileKey] = manifest.generatedSections[fileKey] ?? {};
    for (const { section, hash } of updatedSections) {
      manifest.generatedSections[fileKey][section] = hash;
    }
    manifest.lastUpdatedAt = now();
    nextManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  }

  if (!dryRun) {
    await _atomicWrite(indexPath, text);
    if (nextManifest) await _atomicWrite(manifestPath, nextManifest);
  }

  return { indexPath, manifestPath, updatedSections, dryRun };
}
if (isMainModule(import.meta.url)) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') opts.workspaceDir = argv[++i];
    else if (a === '--cwd') opts.cwd = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--only=')) opts.only = a.slice('--only='.length).split(',');
    else if (a === '--only') opts.only = argv[++i].split(',');
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/update-indexes.js [--only=<sections>] [--workspace <p>] [--cwd <p>] [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`update-indexes: unknown argument "${a}"`);
      process.exit(2);
    }
  }
  try {
    const r = await updateIndexes(opts);
    console.log(
      `update-indexes: ${r.dryRun ? 'would update' : 'updated'} ${r.updatedSections.length} section(s) of ${path.basename(r.indexPath)}`,
    );
  } catch (e) {
    console.error(`update-indexes: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
