// scripts/lib/adapters/render-windsurf.js
//
// Adapter renderer for Windsurf / Cascade (https://windsurf.com).
//
// Windsurf workflows live at:
//   project: .windsurf/workflows/<name>.md
// (Windsurf has no documented global filesystem path for workflows; --global
// install is therefore unsupported and the adapter declares no
// globalOutputPattern in adapter-capabilities.json.)
//
// Format: markdown with YAML frontmatter:
//   description: <copied from source>
//   auto_execution_mode: 1     ← Cascade workflows convention; mode 1 = manual
//                                  step-through, the safest default.
//
// Input  : raw text of `.testatlas/commands/<name>.md` (frontmatter + body).
// Output : derived `.windsurf/workflows/atlas-<name>.md` content as a string.

import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, serializeFrontmatter, wrapInAdapterEnvelope } from './_shared.js';

function stripExistingPreamble(body) {
  const sentinelRe = /^Before doing anything else:\s*$/m;
  const m = body.match(sentinelRe);
  if (!m) return body.trimStart();
  const headingIdx = body.search(/^##\s+/m);
  if (headingIdx === -1) return body.trimStart();
  return body.slice(headingIdx);
}

/**
 * Render a Windsurf / Cascade workflow file from a source command's text.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderWindsurf({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const targetFm = serializeFrontmatter({
    description,
    auto_execution_mode: '1',
  });

  const cleanedBody = stripExistingPreamble(body);
  const envelopeBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const envelope = wrapInAdapterEnvelope({ sourcePath, sourceText, body: envelopeBody });

  return `${targetFm}\n${envelope}`;
}
