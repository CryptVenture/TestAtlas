// test/commands/mesh-graph.test.js
//
// Phase 17 Plan 03 (REVIEW-INV-C) — mesh-graph regression validator.
//
// Audits the directed graph of `/atlas:*` references across all source command
// files at `.testatlas/commands/**/*.md`. Each source file maps to a flat slug
// per Phase 16 render policy: `atlas-` + path.basename(file, '.md'). Edges are
// every `/atlas:[a-z][a-z0-9-]*` token found in a source body.
//
// Four orthogonal invariants:
//   1) orphans: every non-allowlisted slug has inbound count >= 1.
//   2) dead-ends: every source file has a `## What's Next` section AND that
//      section contains at least one `/atlas:` reference.
//   3) broken-refs: every `/atlas:X` reference targets an existing source slug.
//   4) collisions: no two source files render to the same flat slug.
//
// Allowlisted roots (no inbound expected): atlas-init (entry point),
// atlas-bootstrap (constitution refresh entry).
//
// Plan 17-03 lands fixes that flip orphans/dead-ends/broken-refs to 0 but
// LEAVES the atlas-init slug collision until Plan 17-04 deletes the V1
// `init.md`. The collisions test is therefore expected to FAIL after Plan
// 17-03 lands, with exactly 1 collision (atlas-init -> [init.md, core/init.md]).
// Plan 17-04 (Task 2) deleted V1 init.md — collisions assertion now runs
// unconditionally. Remaining 13 orphans are closed by Plan 17-05.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { listCommandFiles } from '../../scripts/lib/list-command-files.js';
import { extractFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

// Match `/atlas:<slug>` where slug starts with a lowercase letter, contains
// `[a-z0-9-]`, and DOES NOT end with `-`. The trailing-dash exclusion is
// deliberate: text like `/atlas:explore-<area>` is a literal placeholder
// describing user-supplied input, not a real reference. The regex's negative
// lookahead `(?![a-z0-9-])` ensures we capture the maximal valid slug; the
// non-trailing-dash anchor `[a-z0-9]` after the optional dash-segment ensures
// `explore-` (truncated form) is not captured as `explore-`.
const ATLAS_REF_RE = /\/atlas:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;

// Roots that are entry points; no inbound link expected.
const ROOT_ALLOWLIST = new Set(['atlas-init', 'atlas-bootstrap']);

// Plan 17-05 (this plan) closed all remaining deferred orphans via:
//  - mesh fix #7: explore.md classification table now surfaces the V1 + V2
//    explorers as /atlas: slash links (cli, docs, runtime, security-privacy,
//    plus the 10 V2 explorers including tests).
//  - mesh fix #9: /atlas:create-persona command surfaced from core/init.md
//    What's Next; create-persona.md links to /atlas:council, /atlas:status,
//    /atlas:brain-sync.
//  - mesh fix #10: council.md What's Next is now an explicit dispatcher
//    listing all 10 council sub-commands.
//  - bridges added in 17-05: bootstrap.md -> bootstrap-refresh; brain-sync.md
//    -> brain-compact + brain-query; report.md -> report-domain;
//    test-flow.md -> test-all.
//
// As of Plan 17-05, the orphan invariant runs UNCONDITIONALLY with no
// allowlist beyond ROOT_ALLOWLIST. Any future regression that introduces
// a new orphan fails this test with no escape hatch.
const DEFERRED_TO_PLAN_17_05 = new Set();

/**
 * Load all source command files, build slug map and per-file body text.
 *
 * @param {string} cwd
 * @returns {Promise<{
 *   files: Array<{ absPath: string, rel: string, slug: string, body: string }>,
 *   slugToFiles: Map<string, string[]>,
 * }>}
 */
async function loadCommandGraph(cwd = process.cwd()) {
  const absPaths = await listCommandFiles({ cwd, includeCategorized: true });
  /** @type {Array<{ absPath: string, rel: string, slug: string, body: string }>} */
  const files = [];
  /** @type {Map<string, string[]>} */
  const slugToFiles = new Map();

  for (const absPath of absPaths) {
    const text = await readFile(absPath, 'utf8');
    let body;
    try {
      ({ body } = extractFrontmatter(text));
    } catch {
      // Malformed frontmatter is a different defect class; skip here.
      continue;
    }
    const slug = `atlas-${path.basename(absPath, '.md')}`;
    const rel = path.relative(cwd, absPath);
    files.push({ absPath, rel, slug, body });
    if (!slugToFiles.has(slug)) slugToFiles.set(slug, []);
    slugToFiles.get(slug).push(rel);
  }

  return { files, slugToFiles };
}

/**
 * Extract every `/atlas:slug` reference token from `body`. Returns an array of
 * {target, snippet} where target is the dash-joined slug like `atlas-test-flow`.
 *
 * @param {string} body
 * @returns {Array<{ target: string, snippet: string }>}
 */
function extractAtlasRefs(body) {
  /** @type {Array<{ target: string, snippet: string }>} */
  const refs = [];
  for (const m of body.matchAll(ATLAS_REF_RE)) {
    const cmd = m[1];
    refs.push({
      target: `atlas-${cmd}`,
      snippet: body.slice(Math.max(0, m.index - 20), Math.min(body.length, m.index + 60)),
    });
  }
  return refs;
}

/**
 * Slice the body to just the `## What's Next` section content (until next H2
 * heading or EOF). Returns null when the section is missing.
 *
 * @param {string} body
 * @returns {string | null}
 */
function extractWhatsNextSection(body) {
  const lines = body.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## What.s Next\s*$/.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

test('REVIEW-INV-C orphans: every non-root command slug has inbound /atlas: links', async () => {
  const { files } = await loadCommandGraph();
  const inbound = new Map();
  for (const f of files) inbound.set(f.slug, 0);

  for (const f of files) {
    const refs = extractAtlasRefs(f.body);
    const seenInThisFile = new Set();
    for (const r of refs) {
      // Don't count self-references; don't double-count multiple references
      // from the same source file (one inbound edge per source).
      if (r.target === f.slug) continue;
      if (seenInThisFile.has(r.target)) continue;
      seenInThisFile.add(r.target);
      if (inbound.has(r.target)) {
        inbound.set(r.target, inbound.get(r.target) + 1);
      }
    }
  }

  /** @type {string[]} */
  const orphans = [];
  for (const [slug, count] of inbound) {
    if (ROOT_ALLOWLIST.has(slug)) continue;
    if (DEFERRED_TO_PLAN_17_05.has(slug)) continue;
    if (count === 0) orphans.push(slug);
  }
  orphans.sort();

  const detail = orphans.map((s) => `  - ${s}`).join('\n');
  assert.deepStrictEqual(
    orphans,
    [],
    `mesh-graph orphan invariant violated: ${orphans.length} slug(s) have zero inbound /atlas: links:\n${detail}\n` +
      "Fix: add forward links from a related command's `## What's Next` so each surface is reachable.",
  );
});

test("REVIEW-INV-C dead-ends: every source file has a What's Next section with /atlas: links", async () => {
  const { files } = await loadCommandGraph();

  /** @type {Array<{ rel: string, reason: string }>} */
  const deadEnds = [];
  for (const f of files) {
    const section = extractWhatsNextSection(f.body);
    if (section === null) {
      deadEnds.push({ rel: f.rel, reason: 'missing-whats-next' });
      continue;
    }
    if (!ATLAS_REF_RE.test(section)) {
      deadEnds.push({ rel: f.rel, reason: 'whats-next-has-no-atlas-ref' });
    }
    // Reset stateful regex (matchAll handles state internally; .test() does not).
    ATLAS_REF_RE.lastIndex = 0;
  }
  deadEnds.sort((a, b) => a.rel.localeCompare(b.rel));

  const detail = deadEnds.map((d) => `  - ${d.rel} [${d.reason}]`).join('\n');
  assert.deepStrictEqual(
    deadEnds,
    [],
    `mesh-graph dead-end invariant violated: ${deadEnds.length} source file(s) lack forward links:\n${detail}\n` +
      "Fix: append a `## What's Next` section with one or more `/atlas:slug` bullets.",
  );
});

test('REVIEW-INV-C broken-refs: every /atlas: reference targets an existing source slug', async () => {
  const { files, slugToFiles } = await loadCommandGraph();
  const validSlugs = new Set(slugToFiles.keys());

  /** @type {Array<{ source: string, target: string, snippet: string }>} */
  const broken = [];
  for (const f of files) {
    const refs = extractAtlasRefs(f.body);
    for (const r of refs) {
      if (!validSlugs.has(r.target)) {
        broken.push({
          source: f.rel,
          target: r.target,
          snippet: r.snippet.replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }
  broken.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  const detail = broken
    .map(
      (b) =>
        `  - ${b.source} -> /atlas:${b.target.replace(/^atlas-/, '')}\n      ctx: ${b.snippet}`,
    )
    .join('\n');
  assert.deepStrictEqual(
    broken,
    [],
    `mesh-graph broken-ref invariant violated: ${broken.length} reference(s) target nonexistent slugs:\n${detail}\n` +
      'Fix: rewrite the reference to a dash-joined slug that resolves (see Phase 17 review §2.4).',
  );
});

// Plan 17-04 (Task 2) deleted V1 init.md, collapsing atlas-init to a single
// source file (core/init.md). The collisions assertion now runs unconditionally
// — no allowlist. Any future collision regression fails the test.

test('REVIEW-INV-C collisions: no two source files render to the same flat slug', async () => {
  const { slugToFiles } = await loadCommandGraph();

  /** @type {Array<{ slug: string, files: string[] }>} */
  const collisions = [];
  for (const [slug, fileList] of slugToFiles) {
    if (fileList.length > 1) {
      collisions.push({ slug, files: [...fileList].sort() });
    }
  }
  collisions.sort((a, b) => a.slug.localeCompare(b.slug));

  const detail = collisions.map((c) => `  - ${c.slug} -> [${c.files.join(', ')}]`).join('\n');
  assert.deepStrictEqual(
    collisions,
    [],
    `mesh-graph slash-collision invariant violated: ${collisions.length} slug(s) have multiple source files:\n${detail}\n` +
      'Fix: delete or rename one of the colliding source files (see Phase 17 review §2.5).',
  );
});
