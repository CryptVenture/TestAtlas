// scripts/lib/adapters/render-cline.js
//
// Adapter renderer for Cline (https://cline.bot).
//
// Cline workflows live at:
//   project: .clinerules/workflows/<name>.md
//   global:  ~/.config/cline/workflows/<name>.md (configurable IDE setting)
// and are slash-invoked WITH the .md extension (e.g. `/atlas-init.md`).
//
// Format: plain markdown, NO YAML frontmatter required (Cline workflows
// are plain markdown). An HTML-comment header carries the description for
// humans browsing the file; the standard adapter envelope wraps the body.
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body)
//          and its absolute filesystem path.
// Output : derived `.clinerules/workflows/atlas-<name>.md` content as a string.

import path from 'node:path';
import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, wrapInAdapterEnvelope } from './_shared.js';

function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

function commandBaseName(sourcePath) {
  const file = path.basename(sourcePath);
  return file.endsWith('.md') ? file.slice(0, -3) : file;
}

/**
 * Render a Cline workflow file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderCline({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const cmdName = commandBaseName(sourcePath);

  // Cline workflows have no YAML frontmatter; an HTML comment carries the
  // description for humans browsing the file.
  const headerComment = `<!-- TestAtlas command: atlas-${cmdName}. Invoke as /atlas-${cmdName}.md. Description: ${description} -->`;

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${headerComment}\n\n${envelope}`;
}
