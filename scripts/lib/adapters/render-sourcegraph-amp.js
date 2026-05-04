// scripts/lib/adapters/render-sourcegraph-amp.js
//
// Adapter renderer for Sourcegraph Amp (https://ampcode.com).
//
// Amp commands live at:
//   project: .agents/commands/<name>.md
//   global:  ~/.agents/commands/<name>.md
// Amp walks AGENTS.md from cwd up to $HOME; per-command files in
// `~/.agents/commands/` are the practical global path.
//
// Format: plain markdown, no required frontmatter. An HTML-comment header
// carries the description for humans browsing the file; the standard
// adapter envelope wraps the body.
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body).
// Output : derived `.agents/commands/atlas-<name>.md` content as a string.

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
 * Render a Sourcegraph Amp command file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderSourcegraphAmp({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const cmdName = commandBaseName(sourcePath);

  const headerComment = `<!-- TestAtlas command: atlas-${cmdName}. Invoke as /atlas-${cmdName}. Description: ${description} -->`;

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${headerComment}\n\n${envelope}`;
}
