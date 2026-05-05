// scripts/lib/sync/sync-system-map.js
//
// Quick 260505-wjp Task 3 (G5): Regenerator for `_testatlas/01_system_map.md`'s
// 2 generated sections:
//
//   - source-references: bullets pointing at the most-recent
//                        `_testatlas/evidence/explore-codebase/<timestamp>/`
//                        directory contents (one bullet per file). Falls back
//                        to `(no source references collected yet)` when empty.
//
//   - domain-index:      bullets `- domains/<slug>/index.md — <name> —
//                        <routes>/<apis>/<components>` from on-disk
//                        domains/*/domain.json.
//
// Returns the fresh 64-hex hashes for both sections so a thin CLI wrapper can
// persist them into manifest.generatedSections in one sweep.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from '../atomic-write.js';
import { hashContent } from '../content-hash.js';
import { sortedReaddir } from '../determinism.js';
import { parseMarkers, renderSection } from '../markers.js';

const FILE = '01_system_map.md';
const SECTIONS = ['source-references', 'domain-index'];

async function readJsonSafe(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

async function statSafe(p) {
  try {
    return await stat(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function collectSourceReferenceBullets(evidenceRoot) {
  const root = await statSafe(evidenceRoot);
  if (!root?.isDirectory()) return ['(no source references collected yet)'];

  // Most-recent timestamped child directory.
  const children = await sortedReaddir(evidenceRoot, { withFileTypes: true });
  const dirs = children.filter((e) => e.isDirectory());
  if (dirs.length === 0) return ['(no source references collected yet)'];
  const latest = dirs[dirs.length - 1].name; // sortedReaddir sorts ascending; last == newest by name

  const latestDir = path.join(evidenceRoot, latest);
  const files = await sortedReaddir(latestDir, { withFileTypes: true });
  const fileNames = files.filter((e) => e.isFile()).map((e) => e.name);
  if (fileNames.length === 0) return ['(no source references collected yet)'];
  return fileNames.map((n) => `- evidence/explore-codebase/${latest}/${n}`);
}

async function collectDomainIndexBullets(domainsDir) {
  let entries;
  try {
    entries = await sortedReaddir(domainsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return ['(no domains mapped yet)'];
    throw err;
  }
  const domainDirs = entries.filter((e) => e.isDirectory());
  if (domainDirs.length === 0) return ['(no domains mapped yet)'];

  const out = [];
  for (const d of domainDirs) {
    const slug = d.name;
    const domainJson = await readJsonSafe(path.join(domainsDir, slug, 'domain.json'));
    if (!domainJson) continue;
    const name = domainJson.name ?? slug;
    const routes = Array.isArray(domainJson.routes) ? domainJson.routes.length : 0;
    const apis = Array.isArray(domainJson.apis) ? domainJson.apis.length : 0;
    const components = Array.isArray(domainJson.components) ? domainJson.components.length : 0;
    out.push(`- domains/${slug}/index.md — ${name} — ${routes}/${apis}/${components}`);
  }
  return out.length === 0 ? ['(no domains mapped yet)'] : out;
}

/**
 * Regenerate 01_system_map.md's source-references + domain-index sections.
 *
 * @param {{wsDir: string}} args
 * @param {{atomicWrite?: typeof atomicWrite}} [_inject]
 * @returns {Promise<{wrote: boolean, hashes: Record<string,string>}>}
 */
export async function syncSystemMap(args, _inject = {}) {
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const { wsDir } = args;

  const filePath = path.join(wsDir, FILE);
  const text = await readFile(filePath, 'utf8');
  const { sections, errors } = parseMarkers(text);
  if (errors.length > 0) {
    const e = new Error(
      `sync-system-map: refusing to write — ${FILE} has marker errors:\n  ${errors
        .map((x) => `[${x.code} line ${x.line}] ${x.message}`)
        .join('\n  ')}`,
    );
    e.code = 'TESTATLAS_MARKER_INVALID';
    e.errors = errors;
    throw e;
  }

  if (!sections.has('domain-index')) {
    const e = new Error(
      `sync-system-map: ${FILE} is missing the required "domain-index" generated section. Run /atlas:init --force or update the template.`,
    );
    e.code = 'TESTATLAS_SECTION_NOT_FOUND';
    e.sectionSlug = 'domain-index';
    throw e;
  }

  const evidenceRoot = path.join(wsDir, 'evidence', 'explore-codebase');
  const srcBody = await collectSourceReferenceBullets(evidenceRoot);
  const domainBody = await collectDomainIndexBullets(path.join(wsDir, 'domains'));

  let next = text;
  if (sections.has('source-references')) next = renderSection(next, 'source-references', srcBody);
  next = renderSection(next, 'domain-index', domainBody);

  const wrote = next !== text;
  if (wrote) await _atomicWrite(filePath, next);

  // Compute fresh hashes for caller to persist.
  const freshSecs = parseMarkers(next).sections;
  const hashes = {};
  for (const slug of SECTIONS) {
    const sec = freshSecs.get(slug);
    if (sec) hashes[slug] = hashContent(sec.contentLines);
  }
  return { wrote, hashes };
}
