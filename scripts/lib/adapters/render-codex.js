// scripts/lib/adapters/render-codex.js
//
// Adapter renderer for OpenAI Codex CLI (and Codex VS Code extension).
//
// Per Codex docs (developers.openai.com/codex/custom-prompts), custom
// prompts live at:
//   ~/.codex/prompts/<name>.md   (USER-HOME ONLY — Codex doesn't auto-load
//                                  prompts from project trees)
// and are typed as `/prompts:<name>` in the chat. Honors $CODEX_HOME if set.
// Plain markdown — NO YAML frontmatter is documented (Codex ignores it).
//
// Caveat: OpenAI's docs note that custom prompts are "deprecated in favor
// of skills"; expect a path drift toward `~/.codex/skills/` in a future
// release. We emit the canonical `prompts/` form today; the Phase 7
// installer copies the rendered files into the user's `~/.codex/prompts/`
// when --global is passed.
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body)
//          and its absolute filesystem path.
// Output : derived `.codex/prompts/atlas-<name>.md` content as a string.
//
// Output shape (no frontmatter):
//   <!-- TestAtlas command: atlas-<name>. Description: <fm.description> -->
//
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <source body, with leading bootstrap-first preamble stripped>
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, commandBaseNameFromSource, wrapInAdapterEnvelope } from './_shared.js';

/**
 * Strip the prior bootstrap-first preamble from a source body, if present.
 * Mirrors render-generic.js / render-claude-code.js — detects the canonical
 * "Before doing anything else:" sentinel and skips past the conflict-rules
 * block before the first `## ` heading.
 *
 * @param {string} body
 * @returns {string}
 */
function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

/**
 * Render a Codex CLI prompt file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderCodex({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  // Phase 16: V2-aware unique flat name keeps the slash-invoke command name
  // in the HTML header in lockstep with the on-disk filename.
  const cmdName = commandBaseNameFromSource(sourcePath);

  // Codex ignores YAML frontmatter; an HTML comment carries the description
  // for humans browsing the file without affecting the prompt content.
  const headerComment = `<!-- TestAtlas command: atlas-${cmdName}. Invoke as /prompts:atlas-${cmdName}. Description: ${description} -->`;

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${headerComment}\n\n${envelope}`;
}
