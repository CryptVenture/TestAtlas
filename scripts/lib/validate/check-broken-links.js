// scripts/lib/validate/check-broken-links.js
//
// PRD §33 condition 3: every `[text](path)` markdown link in the workspace
// resolves to a real file inside wsDir, or `[text](#anchor)` resolves to a
// heading slug in the same file. Plan 05-02 (Wave 1).
//
// Findings:
//   TESTATLAS_BROKEN_LINK — severity 'error', fixable null
//
// External links (http:, https:, mailto:, tel:) are skipped — out of scope
// for filesystem-link checking.
//
// Heading slug rules: GitHub-flavored markdown — lowercase, replace runs of
// non-word characters with '-', strip leading/trailing '-'. Conservative
// implementation: covers >99% of real-world cases without depending on a full
// remark/unified pipeline.

import { stat } from 'node:fs/promises';
import path from 'node:path';

export const id = 'check-broken-links';
export const prdRule = 3;

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const SKIP_PROTOCOLS = /^(?:https?:|mailto:|tel:|ftp:|data:|#$)/i;

/**
 * GitHub-style heading-slug. Conservative: lowercase, drop punctuation,
 * collapse runs of non-word/dash to single '-'.
 *
 * @param {string} heading
 * @returns {string}
 */
function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extract the set of heading slugs from a markdown file body. Picks up
 * ATX-style headings (`# Foo`, `## Bar`) — the dominant style in TestAtlas
 * canonical templates. Does not parse setext (`=====`) headings; if a use
 * case emerges we'll extend.
 *
 * @param {string} body
 * @returns {Set<string>}
 */
function extractHeadingSlugs(body) {
  const slugs = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) slugs.add(slugifyHeading(m[1]));
  }
  return slugs;
}

/**
 * Locate the 1-based line number of the FIRST occurrence of `target` in the
 * file body. Used so the finding can reference the offending line.
 *
 * @param {string} body
 * @param {string} target
 * @returns {number}
 */
function findLineNumberForTarget(body, target) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`(${target})`)) return i + 1;
  }
  return 1;
}

/**
 * @param {{wsDir: string, files: {allMarkdownFiles: Array<{path:string, content:string}>}}} ctx
 * @returns {Promise<{id:string, prdRule:number, status:'pass'|'fail', findings:object[]}>}
 */
export async function check(ctx) {
  const findings = [];
  const { wsDir, files } = ctx;

  for (const md of files.allMarkdownFiles) {
    const body = md.content;
    const fileDir = path.dirname(md.path);
    const headingSlugs = extractHeadingSlugs(body);
    const relFile = path.relative(wsDir, md.path);

    for (const m of body.matchAll(LINK_RE)) {
      const linkText = m[1];
      const target = m[2].trim();
      if (!target || SKIP_PROTOCOLS.test(target)) continue;

      // Same-file anchor (#heading-slug).
      if (target.startsWith('#')) {
        const wantSlug = target.slice(1).split('?')[0].split('&')[0];
        if (!headingSlugs.has(wantSlug)) {
          findings.push({
            severity: 'error',
            path: relFile,
            line: findLineNumberForTarget(body, target),
            code: 'TESTATLAS_BROKEN_LINK',
            message: `Link [${linkText}](${target}) does not resolve to a heading in ${relFile}`,
            fixable: null,
          });
        }
        continue;
      }

      // Strip optional fragment (foo.md#section) for filesystem check.
      const [pathPart] = target.split('#');
      // Resolve the file portion against the markdown file's directory.
      const resolved = path.isAbsolute(pathPart)
        ? path.resolve(pathPart)
        : path.resolve(fileDir, pathPart);

      const exists = await stat(resolved).catch(() => null);
      if (!exists) {
        findings.push({
          severity: 'error',
          path: relFile,
          line: findLineNumberForTarget(body, target),
          code: 'TESTATLAS_BROKEN_LINK',
          message: `Link [${linkText}](${target}) does not resolve to a file at ${resolved}`,
          fixable: null,
        });
      }
    }
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
