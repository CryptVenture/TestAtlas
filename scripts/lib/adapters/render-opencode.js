// scripts/lib/adapters/render-opencode.js
//
// Plan 06-03 Task 2: OpenCode adapter renderer.
//
// Input  : raw text of `.testatlas/commands/<name>.md` and its absolute path.
// Output : the derived `.opencode/commands/atlas-<name>.md` content as a string.
//
// Output shape:
//   ---
//   description: <copied from source>
//   ---
//
//   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
//   First read `.testatlas/bootstrap.md`. ...   ← BOOTSTRAP_PREAMBLE (verbatim)
//
//   <source body, with leading bootstrap-first preamble stripped>
//   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
//
// OpenCode contract (06-RESEARCH.md §Q1.2 + Open Question 3):
//   - `description` only — NO `agent:`, NO `model:`. TestAtlas leaves the agent
//     field unset for agent-agnosticism: the user's OpenCode default agent
//     handles the command.
//   - Body identical-shape to claude-code: BOOTSTRAP_PREAMBLE + cleaned body.
//   - OpenCode declares all 5 capabilities (browser via MCP, shell, web-fetch,
//     MCP, file-write); no per-command degradation prose is needed.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, serializeFrontmatter, wrapInAdapterEnvelope } from './_shared.js';

/**
 * Strip the prior bootstrap-first preamble from a source body, if it begins
 * with one. Same contract as render-claude-code.js.
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
 * Render an OpenCode adapter file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderOpencode({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const targetFm = serializeFrontmatter({ description });

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
