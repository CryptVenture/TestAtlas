// scripts/lib/command-lifecycle.js
//
// Shared helpers for completing the command lifecycle after an artifact is
// created. Consumed by create-issue.js, create-flow.js, create-domain.js,
// and create-evidence-record.js to keep derived state in sync with on-disk
// artifacts.
//
// Every helper is idempotent and safe to call multiple times.

import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './atomic-write.js';
import { now } from './determinism.js';
import { parseMarkers, renderSection } from './markers.js';

// ─── Cross-cut index helpers ─────────────────────────────────────────────────

const CROSSCUT_FACETS = [
  { dir: 'by_domain', field: 'domain', titleFmt: (v) => `Issues for ${v}` },
  { dir: 'by_severity', field: 'severity', titleFmt: (v) => `${capitalize(v)}-severity issues` },
  { dir: 'by_status', field: 'status', titleFmt: (v) => `${capitalize(v)} issues` },
  { dir: 'by_type', field: 'type', titleFmt: (v) => `${capitalize(v)}-type issues` },
];

function capitalize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/**
 * Regenerate the four cross-cut indexes (by_domain, by_severity, by_status,
 * by_type) under `<wsDir>/to_fix/` from all on-disk issues.
 *
 * @param {string} wsDir
 * @param {object[]} issues Array of parsed issue records (from walk-workspace)
 */
export async function regenerateCrossCutIndexes(wsDir, issues) {
  const toFixDir = path.join(wsDir, 'to_fix');

  for (const facet of CROSSCUT_FACETS) {
    const facetDir = path.join(toFixDir, facet.dir);
    await mkdir(facetDir, { recursive: true });

    // Group issues by facet value
    const byValue = new Map();
    for (const issue of issues) {
      const value = issue.parsed?.[facet.field];
      if (!value) continue;
      if (!byValue.has(value)) byValue.set(value, []);
      byValue.get(value).push(issue);
    }

    // Write one index file per value
    for (const [value, matched] of byValue) {
      const indexPath = path.join(facetDir, `${value}.md`);
      const bullets = matched
        .map((i) => `- ${i.id}-${i.slug}`)
        .sort()
        .join('\n');
      const title = facet.titleFmt(value);
      const content = [
        `# ${title}`,
        '',
        '<!-- TESTATLAS:GENERATED:START section="entries" -->',
        bullets,
        '<!-- TESTATLAS:GENERATED:END section="entries" -->',
        '',
      ].join('\n');
      await atomicWrite(indexPath, content);
    }

    // Remove index files for values that no longer have issues
    try {
      const entries = await readdir(facetDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue;
        const value = e.name.replace(/\.md$/, '');
        if (!byValue.has(value)) {
          await atomicWrite(path.join(facetDir, e.name), ''); // empty = effectively removed
        }
      }
    } catch (_err) {
      // facetDir may not exist yet
    }
  }
}

/**
 * Update a single cross-cut index file for a newly-created issue.
 * More efficient than full regeneration when only one issue changed.
 *
 * @param {string} wsDir
 * @param {object} issueParsed The parsed JSON of the newly created issue
 */
export async function addIssueToCrossCutIndexes(wsDir, issueParsed) {
  const toFixDir = path.join(wsDir, 'to_fix');

  for (const facet of CROSSCUT_FACETS) {
    const value = issueParsed[facet.field];
    if (!value) continue;
    const facetDir = path.join(toFixDir, facet.dir);
    await mkdir(facetDir, { recursive: true });
    const indexPath = path.join(facetDir, `${value}.md`);
    const issueRef = issueParsed.id;

    let content;
    try {
      content = await readFile(indexPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Create fresh index
        const title = facet.titleFmt(value);
        content = [
          `# ${title}`,
          '',
          '<!-- TESTATLAS:GENERATED:START section="entries" -->',
          '<!-- TESTATLAS:GENERATED:END section="entries" -->',
          '',
        ].join('\n');
      } else {
        throw err;
      }
    }

    let parsed;
    try {
      parsed = parseMarkers(content);
    } catch {
      // If markers are broken, rewrite from scratch
      const title = facet.titleFmt(value);
      content = [
        `# ${title}`,
        '',
        '<!-- TESTATLAS:GENERATED:START section="entries" -->',
        `- ${issueRef}`,
        '<!-- TESTATLAS:GENERATED:END section="entries" -->',
        '',
      ].join('\n');
      await atomicWrite(indexPath, content);
      continue;
    }

    if (!parsed.sections.has('entries')) {
      // No entries section — append one
      content = content.replace(/\s*$/, '');
      content += `\n\n<!-- TESTATLAS:GENERATED:START section="entries" -->\n- ${issueRef}\n<!-- TESTATLAS:GENERATED:END section="entries" -->\n`;
      await atomicWrite(indexPath, content);
      continue;
    }

    // Extract current entries, add new one if absent, sort, re-render
    const sec = parsed.sections.get('entries');
    const lines = sec.contentLines.filter((l) => l.trim());
    const refLine = `- ${issueRef}`;
    if (!lines.includes(refLine)) {
      lines.push(refLine);
      lines.sort();
      content = renderSection(content, 'entries', lines);
      await atomicWrite(indexPath, content);
    }
  }
}

// ─── Manifest count helpers ──────────────────────────────────────────────────

/**
 * Increment a manifest count and bump lastUpdatedAt. Idempotent if called
 * multiple times for the same artifact (the caller should ensure it's only
 * called once per creation).
 *
 * @param {string} wsDir
 * @param {'issues'|'flows'|'domains'|'evidenceRecords'|'testRuns'} key
 * @param {number} [delta=1]
 */
export async function incrementManifestCount(wsDir, key, delta = 1) {
  const manifestPath = path.join(wsDir, '11_workspace_manifest.json');
  let manifest;
  try {
    const text = await readFile(manifestPath, 'utf8');
    manifest = JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  manifest.counts = manifest.counts ?? {};
  manifest.counts[key] = (manifest.counts[key] ?? 0) + delta;
  manifest.lastUpdatedAt = now();
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

// ─── Domain / Flow issue index helpers ───────────────────────────────────────

/**
 * Append an issue reference to a domain's issues/index.md if not already
 * present.
 *
 * @param {string} wsDir
 * @param {string} domainId e.g. 'domain-auth'
 * @param {string} issueId e.g. 'ISSUE-001-slug'
 */
export async function addIssueToDomainIndex(wsDir, domainId, issueId) {
  const slug = domainId.replace(/^domain-/, '');
  const indexPath = path.join(wsDir, 'domains', slug, 'issues', 'index.md');

  let content;
  try {
    content = await readFile(indexPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  const refLine = `- ${issueId}`;
  if (content.includes(refLine)) return;

  // Append after the first H1 heading or at the end
  const lines = content.split('\n');
  const h1Index = lines.findIndex((l) => l.startsWith('# '));
  const insertIndex = h1Index >= 0 ? h1Index + 1 : 0;
  lines.splice(insertIndex + 1, 0, refLine);
  await atomicWrite(indexPath, lines.join('\n'));
}

/**
 * Append an issue reference to a flow's issues section if present.
 *
 * @param {string} wsDir
 * @param {string} flowId e.g. 'FLOW-auth-login'
 * @param {string} issueId e.g. 'ISSUE-001-slug'
 */
export async function addIssueToFlowIndex(wsDir, flowId, issueId) {
  const flowPath = path.join(wsDir, 'flows', `${flowId}.md`);

  let content;
  try {
    content = await readFile(flowPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  const refLine = `- ${issueId}`;
  if (content.includes(refLine)) return;

  // Find the "## Issues" section and append
  const lines = content.split('\n');
  const issuesHeadingIndex = lines.findIndex((l) => /^## Issues\s*$/.test(l));
  if (issuesHeadingIndex < 0) return;

  lines.splice(issuesHeadingIndex + 1, 0, refLine);
  await atomicWrite(flowPath, lines.join('\n'));
}

// ─── Command-log helpers (re-exported for ergonomic single-source) ───────────
//
// Quick 260505-wjp Task 1 (G2): callers that already
// `import { incrementManifestCount } from './command-lifecycle.js'` can also
// pull the new code-backed log appenders from the same module:
//   import { appendCommandLogRow, appendRunLogEntry } from './command-lifecycle.js';
// The canonical implementation lives in ./command-log.js.
export { appendCommandLogRow, appendRunLogEntry } from './command-log.js';
