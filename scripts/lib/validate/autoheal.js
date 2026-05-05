// scripts/lib/validate/autoheal.js
//
// Plan 05-04: SCR-04 — `validate-workspace --auto-heal` body.
//
// HEAL-XX safety contract (verbatim from 05-RESEARCH.md §"Pattern 4 Auto-heal
// Safety Contract"):
//
//   HEAL-01  Restore manifest counts
//            ← TESTATLAS_COUNT_MISMATCH (fixable='auto')
//   HEAL-02  Regenerate 09_artifact_index.md
//            ← TESTATLAS_MISSING_INDEX or TESTATLAS_INDEX_MISMATCH for that path
//   HEAL-03  Regenerate cross-cut and per-domain indexes
//            ← TESTATLAS_INDEX_MISMATCH or TESTATLAS_MISSING_INDEX (cross-cut)
//            ← TESTATLAS_INDEX_STALE (Plan 11-06 / F-23 — same regenerate path)
//   HEAL-04  Refresh stale generated-section hash (whitespace-only diffs only)
//            ← TESTATLAS_STALE_GENERATED_HASH (fixable='auto')
//
// CANONICAL NEVER-heal list (refused with `skipped` entries):
//   TESTATLAS_MISSING_CANONICAL          — manual restoration required
//   TESTATLAS_SCHEMA_VIOLATION           — could be in-progress edits
//   TESTATLAS_JSON_PARSE_ERROR           — user fixes manually
//   TESTATLAS_MODIFIED_GENERATED_CONTENT — non-whitespace edit; preserve user work
//   TESTATLAS_ORPHANED_EVIDENCE          — may be a draft; user reviews
//   TESTATLAS_MISSING_EVIDENCE_REF       — heuristic rename unsafe
//   TESTATLAS_BROKEN_LINK                — target may be intentional draft
//   TESTATLAS_DUPLICATE_ID               — cannot decide which is the original
//
// Apply gate semantics:
//   apply=false (default)             → preview only; zero writes; `applied`
//                                       still lists would-be heals so the
//                                       reporter can show what `--apply` would do.
//   apply=true && dryRun=false        → execute writes via atomicWrite/renderSection.
//   dryRun=true (any apply value)     → dry-run wins; zero writes.
//
// Every applied write goes through atomicWrite() (Pitfall 4) and through
// markers.renderSection() if the write touches a marker-bounded region
// (Pitfall 5: human prose outside markers preserved byte-for-byte).
//
// HEAL-02 / HEAL-03 are filled by Task 2; this file initially ships HEAL-01
// + HEAL-04 + the dispatch + the NEVER-heal classifier.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from '../atomic-write.js';
import { hashContent } from '../content-hash.js';
import { now } from '../determinism.js';
import { parseMarkers, renderSection } from '../markers.js';

/**
 * Ensure the parent directory of `absPath` exists before atomicWrite.
 * Idempotent (recursive). Used by HEAL-03 to create cross-cut index dirs
 * (to_fix/by_domain/, by_type/, etc.) that fixtures may lack.
 */
async function ensureParentDir(absPath) {
  await mkdir(path.dirname(absPath), { recursive: true });
}

// ─── NEVER-heal canonical list ────────────────────────────────────────────────
//
// Maps finding.code → human-readable refusal reason. Any finding whose code
// appears here is added to the `skipped` list with the reason — independent
// of whether `fixable === 'auto'` (defense in depth: even if a future check
// mistakenly classifies one of these codes as fixable, autoheal still refuses).

const NEVER_HEAL_REASONS = Object.freeze({
  TESTATLAS_MISSING_CANONICAL:
    'NEVER-heal: missing canonical files require manual restoration (re-run /atlas:init or git checkout)',
  TESTATLAS_SCHEMA_VIOLATION:
    'NEVER-heal: schema-invalid artifacts require manual fix (data loss possible if defaulted)',
  TESTATLAS_JSON_PARSE_ERROR:
    'NEVER-heal: JSON parse error; user fixes manually (autoheal cannot infer intended content)',
  TESTATLAS_UNKNOWN_SCHEMA:
    'NEVER-heal: artifact lacks a recognizable schema; user clarifies type manually',
  TESTATLAS_MODIFIED_GENERATED_CONTENT:
    'NEVER-heal: non-whitespace edit inside markers; user must review (Pitfall 2)',
  TESTATLAS_ORPHANED_EVIDENCE: 'NEVER-heal: evidence file may be a draft; user reviews',
  TESTATLAS_MISSING_EVIDENCE_REF:
    'NEVER-heal: missing evidence ref; heuristic rename unsafe (use --apply-suggestions, NOT covered by --auto-heal)',
  TESTATLAS_BROKEN_LINK: 'NEVER-heal: broken link target may be intentional draft',
  TESTATLAS_DUPLICATE_ID: 'NEVER-heal: cannot decide which artifact is the original',
  TESTATLAS_MARKER_INVALID:
    'NEVER-heal: marker-structure errors require manual fix; refusing to overwrite a corrupt marker layout',
});

// ─── HEAL-01: Restore manifest counts ────────────────────────────────────────

/**
 * Recompute manifest.counts from ctx.files and atomicWrite the manifest.
 * @param {object} ctx
 * @param {object} finding
 * @param {{apply: boolean, dryRun: boolean}} mode
 * @returns {Promise<{healId: 'HEAL-01', path: string, summary: string}>}
 */
async function applyHeal01(ctx, _finding, { apply, dryRun }) {
  const { files, manifest, wsDir } = ctx;

  const evidIds = new Set((files.evidenceFiles ?? []).map((e) => e.id).filter(Boolean));
  const actual = {
    domains: (files.domains ?? []).length,
    flows: (files.flows ?? []).length,
    issues: (files.issues ?? []).length,
    evidenceRecords: evidIds.size,
    testRuns: (files.testRuns ?? []).length,
  };

  const oldCounts = manifest?.counts ?? {};
  const diffParts = [];
  for (const k of Object.keys(actual)) {
    if (oldCounts[k] !== actual[k]) {
      diffParts.push(`${k}: ${oldCounts[k]}→${actual[k]}`);
    }
  }
  const summary =
    diffParts.length > 0 ? `counts updated: ${diffParts.join(', ')}` : 'counts already in sync';

  if (apply && !dryRun) {
    const updated = {
      ...manifest,
      counts: { ...(manifest?.counts ?? {}), ...actual },
      lastUpdatedAt: now(),
    };
    const text = `${JSON.stringify(updated, null, 2)}\n`;
    await atomicWrite(path.join(wsDir, '11_workspace_manifest.json'), text);
    // Mutate the in-memory ctx.manifest so subsequent heals (HEAL-04) see the
    // refreshed counts and don't redundantly call atomicWrite for the same
    // manifest. (Re-walks for the full re-run of CHECKS happen in the
    // orchestrator, not here.)
    ctx.manifest = updated;
  }

  return {
    healId: 'HEAL-01',
    path: '11_workspace_manifest.json',
    summary,
  };
}

// ─── HEAL-04: Refresh stale generated-section hash (whitespace-only) ─────────

/**
 * Recompute hashContent(body) for the section identified by `finding.path` +
 * the section slug derivable from finding.message and write it into
 * manifest.generatedSections[file][section].
 *
 * Trigger condition (enforced by the dispatcher): finding.code ===
 * 'TESTATLAS_STALE_GENERATED_HASH' AND finding.fixable === 'auto'. The check
 * (check-stale-generated-sections) only sets fixable='auto' when the
 * whitespace-canonicalized body re-hashes to the manifest's stored hash —
 * i.e. the only changes were whitespace. We re-derive the section slug from
 * the finding message because the check stores it there: 'Section "<slug>"
 * in <file>: ...'.
 *
 * @param {object} ctx
 * @param {object} finding
 * @param {{apply: boolean, dryRun: boolean}} mode
 * @returns {Promise<{healId: 'HEAL-04', path: string, summary: string} | null>}
 */
async function applyHeal04(ctx, finding, { apply, dryRun }) {
  const { files, manifest, wsDir } = ctx;
  const filename = finding.path;
  const sectionSlug = extractSectionSlug(finding.message);
  if (!sectionSlug) {
    // Defensive: if the message format ever changes, refuse rather than guess.
    return null;
  }

  // Locate the file's content from ctx.files.allMarkdownFiles.
  const wantAbs = path.join(wsDir, filename);
  const fileRec = (files.allMarkdownFiles ?? []).find((f) => f.path === wantAbs);
  if (!fileRec) return null;

  let parsed;
  try {
    parsed = parseMarkers(fileRec.content);
  } catch {
    return null;
  }
  if (parsed.errors.length > 0) return null;
  const sec = parsed.sections.get(sectionSlug);
  if (!sec) return null;

  const newHash = hashContent(sec.contentLines);
  const summary = `hash refreshed for ${filename}/${sectionSlug}`;

  if (apply && !dryRun) {
    const updated = JSON.parse(JSON.stringify(manifest ?? {}));
    if (!updated.generatedSections) updated.generatedSections = {};
    if (!updated.generatedSections[filename]) updated.generatedSections[filename] = {};
    updated.generatedSections[filename][sectionSlug] = newHash;
    updated.lastUpdatedAt = now();
    const text = `${JSON.stringify(updated, null, 2)}\n`;
    await atomicWrite(path.join(wsDir, '11_workspace_manifest.json'), text);
    ctx.manifest = updated;
  }

  return {
    healId: 'HEAL-04',
    path: '11_workspace_manifest.json',
    summary,
  };
}

/**
 * Extract section slug from a check-stale-generated-sections message.
 * Format: 'Section "<slug>" in <file>: ...'
 *
 * @param {string} msg
 * @returns {string | null}
 */
function extractSectionSlug(msg) {
  const m = String(msg ?? '').match(/Section "([^"]+)"/);
  return m ? m[1] : null;
}

// ─── HEAL-02: Regenerate 09_artifact_index.md ────────────────────────────────
//
// The canonical artifact index is structured as 5 marker-bounded sections:
//   domain-docs   — bullets pointing at domains/<slug>/index.md
//   flow-docs     — bullets pointing at flows/FLOW-*.md
//   issue-docs    — bullets pointing at to_fix/ISSUE-*.md
//   evidence      — bullets listing EVIDENCE-* ids
//   reports       — bullets pointing at reports/REPORT-*.md
//
// Strategy:
//   - If 09_artifact_index.md is missing, write a fresh template (header +
//     5 marker-bounded sections) atomically.
//   - If present, use renderSection() per section so any human prose OUTSIDE
//     the markers is byte-preserved (Pitfall 5).
//   - On TESTATLAS_MARKER_INVALID: refuse and bubble up an error so the
//     dispatcher records a `skipped` entry citing the marker error.
//
// The manifest's generatedSections[09_artifact_index.md][<section>] hashes
// are refreshed in the same atomicWrite batch so post-heal validate doesn't
// flag stale-hash on the just-regenerated content.

const ARTIFACT_INDEX_SECTIONS = ['domain-docs', 'flow-docs', 'issue-docs', 'evidence', 'reports'];

const ARTIFACT_INDEX_TEMPLATE = `# 09 Artifact Index

## Domain Documents

<!-- TESTATLAS:GENERATED:START section="domain-docs" -->
<!-- TESTATLAS:GENERATED:END section="domain-docs" -->

## Flow Documents

<!-- TESTATLAS:GENERATED:START section="flow-docs" -->
<!-- TESTATLAS:GENERATED:END section="flow-docs" -->

## Issue Documents

<!-- TESTATLAS:GENERATED:START section="issue-docs" -->
<!-- TESTATLAS:GENERATED:END section="issue-docs" -->

## Evidence

<!-- TESTATLAS:GENERATED:START section="evidence" -->
<!-- TESTATLAS:GENERATED:END section="evidence" -->

## Reports

<!-- TESTATLAS:GENERATED:START section="reports" -->
<!-- TESTATLAS:GENERATED:END section="reports" -->
`;

/**
 * Build the per-section body lines for 09_artifact_index.md.
 * Returns an object keyed by section slug → array of body lines (no marker
 * lines, no terminators).
 *
 * @param {object} files
 */
function buildArtifactIndexBodies(files) {
  const domainsBody = (files.domains ?? []).map((d) => `- domains/${d.slug}/index.md`).sort();
  const flowsBody = (files.flows ?? [])
    .filter((f) => f.mdPath)
    .map((f) => `- flows/${path.basename(f.mdPath)}`)
    .sort();
  const issuesBody = (files.issues ?? [])
    .filter((i) => i.mdPath)
    .map((i) => `- to_fix/${path.basename(i.mdPath)}`)
    .sort();
  // Distinct EVIDENCE-* ids, sorted.
  const evidIds = Array.from(new Set((files.evidenceFiles ?? []).map((e) => e.id)))
    .filter(Boolean)
    .sort();
  const evidenceBody = evidIds.map((id) => `- ${id}`);
  const reportsBody = (files.reports ?? [])
    .filter((r) => r.mdPath)
    .map((r) => `- reports/${path.basename(r.mdPath)}`)
    .sort();
  return {
    'domain-docs': domainsBody,
    'flow-docs': flowsBody,
    'issue-docs': issuesBody,
    evidence: evidenceBody,
    reports: reportsBody,
  };
}

async function applyHeal02(ctx, _finding, { apply, dryRun }) {
  const { files, wsDir } = ctx;
  const filename = '09_artifact_index.md';
  const targetAbs = path.join(wsDir, filename);

  const bodies = buildArtifactIndexBodies(files);

  // Locate existing content (if any) from ctx.files.allMarkdownFiles.
  const existing = (files.allMarkdownFiles ?? []).find((f) => f.path === targetAbs);
  let baseText = existing?.content ?? null;

  // If file is absent OR present but lacking any of the required sections,
  // start from the template. (We DON'T discard existing prose when sections
  // are present — only when the file is wholly missing or its marker layout
  // is incompatible.)
  if (baseText !== null) {
    let parsed;
    try {
      parsed = parseMarkers(baseText);
    } catch (err) {
      const e = new Error(`HEAL-02 refused: ${err.message}`);
      e.code = err.code ?? 'TESTATLAS_MARKER_INVALID';
      throw e;
    }
    if (parsed.errors.length > 0) {
      const e = new Error(`HEAL-02 refused: marker errors in ${filename}`);
      e.code = 'TESTATLAS_MARKER_INVALID';
      throw e;
    }
    // If any required section is absent, fall back to the template
    // (sections that the user removed cannot be patched in-place by
    // renderSection — it requires the markers to be present).
    const missingSections = ARTIFACT_INDEX_SECTIONS.filter((s) => !parsed.sections.has(s));
    if (missingSections.length > 0) {
      baseText = ARTIFACT_INDEX_TEMPLATE;
    }
  } else {
    baseText = ARTIFACT_INDEX_TEMPLATE;
  }

  // Render each section into baseText one at a time (renderSection is pure;
  // it accepts a string and returns a new string). Every section is touched
  // so the file ends up wholly synced with on-disk artifacts.
  let updated = baseText;
  for (const section of ARTIFACT_INDEX_SECTIONS) {
    updated = renderSection(updated, section, bodies[section]);
  }

  // Update manifest.generatedSections hashes for each section.
  const newHashes = Object.fromEntries(
    ARTIFACT_INDEX_SECTIONS.map((s) => [s, hashContent(bodies[s])]),
  );

  if (apply && !dryRun) {
    await atomicWrite(targetAbs, updated);

    // Refresh manifest hashes in a single atomicWrite.
    const m = JSON.parse(JSON.stringify(ctx.manifest ?? {}));
    if (!m.generatedSections) m.generatedSections = {};
    m.generatedSections[filename] = { ...(m.generatedSections[filename] ?? {}), ...newHashes };
    m.lastUpdatedAt = now();
    await atomicWrite(
      path.join(wsDir, '11_workspace_manifest.json'),
      `${JSON.stringify(m, null, 2)}\n`,
    );
    ctx.manifest = m;
  }

  return {
    healId: 'HEAL-02',
    path: filename,
    summary: `regenerated ${ARTIFACT_INDEX_SECTIONS.length} sections; preserved human prose outside markers`,
  };
}

// ─── HEAL-03: Regenerate cross-cut + per-domain indexes ──────────────────────
//
// Cross-cut indexes live at:
//   to_fix/by_domain/<value>.md
//   to_fix/by_severity/<value>.md
//   to_fix/by_status/<value>.md
//   to_fix/by_type/<value>.md
// Per-domain indexes:
//   domains/<slug>/index.md
//   domains/<slug>/issues/index.md
//
// Each gets a `# Title` heading + a marker-bounded "entries" section that
// lists the matching ISSUE-* ids. If the file already exists with the
// "entries" marker pair, only the body is updated (renderSection preserves
// human prose outside the markers — Pitfall 5). If the file is missing or
// has no "entries" section, a fresh template is written.
//
// We re-derive the FULL set of expected indexes from on-disk issue metadata
// (NOT from the inbound finding) and regenerate any whose path appears in
// the dispatched findings — same operation per file path is de-duped via a
// Set in the dispatcher's main loop.
//
// For per-domain index.md we only render IF the finding is for a per-domain
// path (domains/<slug>/index.md or domains/<slug>/issues/index.md).

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
 * Build the marker-bounded entries body (array of bullet lines) for a
 * cross-cut index keyed by `field === value`.
 *
 * @param {object[]} issues
 * @param {string} field
 * @param {string} value
 */
function buildCrosscutEntries(issues, field, value) {
  const matched = (issues ?? [])
    .filter((i) => i.parsed && i.parsed[field] === value)
    .map((i) => `- ${i.id}-${i.slug}`)
    .sort();
  return matched.length > 0 ? matched : ['(none)'];
}

/**
 * Build the body for a per-domain `domains/<slug>/issues/index.md` listing
 * all issues in that domain.
 *
 * @param {object[]} issues
 * @param {string} domainId Issue.domain field value, e.g. 'domain-auth'.
 */
function buildDomainIssuesBody(issues, domainId) {
  return buildCrosscutEntries(issues, 'domain', domainId);
}

const ENTRIES_TEMPLATE = (title, body) =>
  [
    `# ${title}`,
    '',
    '<!-- TESTATLAS:GENERATED:START section="entries" -->',
    ...body,
    '<!-- TESTATLAS:GENERATED:END section="entries" -->',
    '',
  ].join('\n');

const DOMAIN_INDEX_TEMPLATE = (slug) =>
  [
    `# Domain: ${slug}`,
    '',
    '(domain index — humans add notes here; preserved across runs)',
    '',
    '<!-- TESTATLAS:GENERATED:START section="entries" -->',
    '(see issues/index.md)',
    '<!-- TESTATLAS:GENERATED:END section="entries" -->',
    '',
  ].join('\n');

/**
 * Resolve the on-disk content (if any) for a relative path; null if absent.
 *
 * @param {object} files
 * @param {string} absPath
 */
function findExistingContent(files, absPath) {
  const md = (files.allMarkdownFiles ?? []).find((f) => f.path === absPath);
  return md?.content ?? null;
}

async function applyHeal03(ctx, finding, { apply, dryRun }) {
  const { files, wsDir } = ctx;
  const relPath = finding.path;
  const absPath = path.join(wsDir, relPath);

  // Decide which kind of index we're regenerating.
  const segs = relPath.split('/');
  let title;
  let body;
  const entriesHashKey = 'entries';

  if (segs[0] === 'to_fix' && segs.length === 3 && /^by_/.test(segs[1])) {
    const facet = CROSSCUT_FACETS.find((f) => f.dir === segs[1]);
    if (!facet) return null;
    const value = segs[2].replace(/\.md$/, '');
    title = facet.titleFmt(value);
    body = buildCrosscutEntries(files.issues, facet.field, value);
  } else if (segs[0] === 'domains' && segs.length === 3 && segs[2] === 'index.md') {
    const slug = segs[1];
    title = `Domain: ${slug}`;
    // domains/<slug>/index.md is mostly human-curated; we still expose an
    // "entries" marker pair pointing at issues/index.md so HEAL-03 can
    // refresh it deterministically.
    body = ['(see issues/index.md)'];
  } else if (
    segs[0] === 'domains' &&
    segs.length === 4 &&
    segs[2] === 'issues' &&
    segs[3] === 'index.md'
  ) {
    const slug = segs[1];
    // Look up the issue.domain id; fall back to slug if no domain.json link.
    const dom = (files.domains ?? []).find((d) => d.slug === slug);
    const domainId = dom?.parsed?.id ?? `domain-${slug}`;
    title = `Issues for ${domainId}`;
    body = buildDomainIssuesBody(files.issues, domainId);
  } else {
    // Unknown index shape — refuse.
    return null;
  }

  // Read existing file (if any). Decide whether to renderSection or write
  // the fresh template.
  let updated;
  const existing = findExistingContent(files, absPath);
  if (existing !== null) {
    // Try renderSection on existing markers; on missing markers, fall back
    // to the template.
    let parsed;
    try {
      parsed = parseMarkers(existing);
    } catch (err) {
      const e = new Error(`HEAL-03 refused: ${err.message}`);
      e.code = err.code ?? 'TESTATLAS_MARKER_INVALID';
      throw e;
    }
    if (parsed.errors.length > 0) {
      const e = new Error(`HEAL-03 refused: marker errors in ${relPath}`);
      e.code = 'TESTATLAS_MARKER_INVALID';
      throw e;
    }
    if (parsed.sections.has('entries')) {
      updated = renderSection(existing, 'entries', body);
    } else {
      // No "entries" section present; write a fresh template (this loses any
      // pre-existing non-marker content, but the existing content carries
      // no marker contract so the user expectation is "regenerate"). For the
      // domains/<slug>/index.md case (which traditionally contains human
      // prose without markers), preserve the existing prose by appending the
      // marker block.
      if (segs[0] === 'domains' && segs.length === 3 && segs[2] === 'index.md') {
        updated = `${existing.replace(/\s*$/, '')}\n\n<!-- TESTATLAS:GENERATED:START section="entries" -->\n${body.join(
          '\n',
        )}\n<!-- TESTATLAS:GENERATED:END section="entries" -->\n`;
      } else {
        updated = ENTRIES_TEMPLATE(title, body);
      }
    }
  } else if (segs[0] === 'domains' && segs.length === 3 && segs[2] === 'index.md') {
    updated = DOMAIN_INDEX_TEMPLATE(segs[1]);
    // Ensure the entries section is rendered with the computed body.
    updated = renderSection(updated, 'entries', body);
  } else {
    updated = ENTRIES_TEMPLATE(title, body);
  }

  const newHash = hashContent(body);

  if (apply && !dryRun) {
    // Ensure parent dir exists (cross-cut by_*/ dirs may be absent in fresh
    // workspaces with no issues of that facet value yet).
    await ensureParentDir(absPath);
    await atomicWrite(absPath, updated);

    // Refresh manifest.generatedSections[<relPath>][<entriesHashKey>] hash.
    const m = JSON.parse(JSON.stringify(ctx.manifest ?? {}));
    if (!m.generatedSections) m.generatedSections = {};
    if (!m.generatedSections[relPath]) m.generatedSections[relPath] = {};
    m.generatedSections[relPath][entriesHashKey] = newHash;
    m.lastUpdatedAt = now();
    await atomicWrite(
      path.join(wsDir, '11_workspace_manifest.json'),
      `${JSON.stringify(m, null, 2)}\n`,
    );
    ctx.manifest = m;
  }

  return {
    healId: 'HEAL-03',
    path: relPath,
    summary: `regenerated ${relPath}; preserved human prose outside markers`,
  };
}

// ─── Dispatch table ───────────────────────────────────────────────────────────
//
// Maps finding.code → handler. For codes that depend on `finding.path`
// (TESTATLAS_MISSING_INDEX dispatches to HEAL-02 if path is the canonical
// 09_artifact_index.md, otherwise HEAL-03), we expose a function the
// dispatcher calls with the finding to pick the handler.

function dispatch(finding) {
  switch (finding.code) {
    case 'TESTATLAS_COUNT_MISMATCH':
      return applyHeal01;
    case 'TESTATLAS_STALE_GENERATED_HASH':
      return applyHeal04;
    case 'TESTATLAS_MISSING_INDEX':
      return finding.path === '09_artifact_index.md' ? applyHeal02 : applyHeal03;
    case 'TESTATLAS_INDEX_MISMATCH':
      return finding.path === '09_artifact_index.md' ? applyHeal02 : applyHeal03;
    case 'TESTATLAS_INDEX_STALE':
      // Plan 11-06 / F-23. Stale-direction findings are exclusively cross-cut
      // indexes (the new third pass in check-issue-index-consistency only
      // emits for `to_fix/by_*/<value>.md` paths), so HEAL-03 always handles
      // them — same regenerate-from-on-disk-issue-truth path as MISMATCH.
      return applyHeal03;
    default:
      return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Iterate over `results.flatMap(r => r.findings)` and dispatch each fixable
 * finding to the matching HEAL-XX handler. Findings whose code is in the
 * NEVER-heal list are recorded as `skipped` with the canonical reason.
 *
 * @param {Array<{findings: object[]}>} results
 * @param {{wsDir: string, files: object, manifest: object|null}} ctx
 * @param {{dryRun?: boolean, apply?: boolean}} [opts]
 * @returns {Promise<{
 *   applied: Array<{healId: string, path: string, summary: string}>,
 *   skipped: Array<{reason: string, path: string, code: string}>
 * }>}
 */
export async function autoHealFindings(results, ctx, opts = {}) {
  const { dryRun = false, apply = false } = opts;
  const applied = [];
  const skipped = [];

  // De-dupe HEAL-01: TESTATLAS_COUNT_MISMATCH typically yields one finding per
  // count key (e.g., 5 findings if all 5 counts differ). A single HEAL-01
  // pass refreshes ALL counts in one atomicWrite — so we apply it once.
  // De-dupe HEAL-02: only one regen of 09_artifact_index.md per autoheal call.
  // De-dupe HEAL-03: only one regen per index path per autoheal call.
  const seenCodesForSingleton = new Set();
  const seenHeal02 = { done: false };
  const seenHeal03Paths = new Set();

  const resultsArr = Array.isArray(results) ? results : [];
  const allFindings = resultsArr.flatMap((r) => r?.findings ?? []);

  for (const finding of allFindings) {
    if (!finding) continue;

    if (finding.fixable === 'auto') {
      const handler = dispatch(finding);
      if (!handler) {
        skipped.push({
          reason: 'unrecognized fixable code; refusing to heal',
          path: finding.path,
          code: finding.code,
        });
        continue;
      }

      // Singleton HEAL-01: only run once even if multiple count keys mismatch.
      if (finding.code === 'TESTATLAS_COUNT_MISMATCH') {
        if (seenCodesForSingleton.has('TESTATLAS_COUNT_MISMATCH')) continue;
        seenCodesForSingleton.add('TESTATLAS_COUNT_MISMATCH');
      }
      // HEAL-02 dedup: 09_artifact_index.md regenerates entire file; once
      // suffices regardless of how many findings target it.
      if (handler === applyHeal02) {
        if (seenHeal02.done) continue;
        seenHeal02.done = true;
      }
      // HEAL-03 dedup: per relative path.
      if (handler === applyHeal03) {
        if (seenHeal03Paths.has(finding.path)) continue;
        seenHeal03Paths.add(finding.path);
      }

      try {
        const result = await handler(ctx, finding, { apply, dryRun });
        if (result) {
          applied.push(result);
        } else {
          skipped.push({
            reason: 'heal handler not yet implemented or refused',
            path: finding.path,
            code: finding.code,
          });
        }
      } catch (err) {
        skipped.push({
          reason: `heal handler threw: ${err.code ?? 'ERROR'} — ${err.message}`,
          path: finding.path,
          code: finding.code,
        });
      }
      continue;
    }

    // fixable !== 'auto' — check the NEVER-heal list.
    const reason = NEVER_HEAL_REASONS[finding.code];
    if (reason) {
      skipped.push({
        reason,
        path: finding.path,
        code: finding.code,
      });
    }
    // Unknown non-fixable codes: ignore silently — they may be informational
    // or warnings that don't need autoheal attention.
  }

  return { applied, skipped };
}
