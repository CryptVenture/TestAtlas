// scripts/lib/adapters/render-kiro.js
//
// Adapter renderer for Kiro (https://kiro.dev).
//
// Kiro skills live at:
//   project: .kiro/skills/atlas-<name>.md   (FLAT form — Kiro 2026 supports
//                                              both flat and dir-per-skill;
//                                              we ship flat for parity simplicity)
//   global:  ~/.kiro/skills/atlas-<name>.md
// and are slash-invoked as /atlas-<name>.
//
// Format: markdown with YAML frontmatter:
//   name: atlas-<command>
//   description: <copied from source>
//   inclusion: manual           ← only injected when the user explicitly
//                                   /atlas-<command>s; never auto-applied.
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body)
//          and its absolute filesystem path.
// Output : derived `.kiro/skills/atlas-<name>.md` content as a string.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import {
  BOOTSTRAP_PREAMBLE,
  commandBaseNameFromSource,
  serializeFrontmatter,
  wrapInAdapterEnvelope,
} from './_shared.js';

function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

/**
 * Render a Kiro skill file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderKiro({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  // Phase 16: V2-aware unique flat name keeps the rendered `name:` field in
  // lockstep with the on-disk filename across V1 + V2 categorized commands.
  const cmdName = commandBaseNameFromSource(sourcePath);

  const targetFm = serializeFrontmatter({
    name: `atlas-${cmdName}`,
    description,
    inclusion: 'manual',
  });

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
