// scripts/lib/adapters/render-gemini.js
//
// Adapter renderer for Google Gemini CLI (per geminicli.com/docs/cli/custom-commands/).
//
// Project-local: <repo>/.gemini/commands/<name>.toml
// Global:        ~/.gemini/commands/<name>.toml
// Slash invoke:  /<name>   (filename minus .toml; subdirs become namespaces)
//
// Format is TOML, NOT markdown — a hard departure from every other adapter
// in this repo. Documented keys:
//   prompt      (string, required)  — the actual prompt body. Multi-line OK
//                                     via TOML triple-quoted strings.
//   description (string, optional)  — shown in /help; default is auto-
//                                     generated from filename (ugly).
//
// Gemini supports `{{args}}` placeholder and `!{...}` shell injection inside
// `prompt`. We don't author either — TestAtlas commands are deterministic
// recipes — but we DO escape any literal `{{` and `!{` sequences in the
// source body so user prose can't accidentally be templated.
//
// Reload behavior: after writing new files, the Gemini CLI must be told to
// re-read commands via `/commands reload` (or restart). Documented for the
// user in the adapter README.

import path from 'node:path';
import { hashContent } from '../content-hash.js';
import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';
import { BOOTSTRAP_PREAMBLE, sourceRelFromAbs } from './_shared.js';

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
 * Escape characters that have special meaning inside a TOML triple-quoted
 * string AND inside Gemini's templating layer.
 *
 *   - `\` → `\\`     (TOML escape)
 *   - `"""` → `\"""`  (close-marker collision; rare but real for prose
 *                       quoting nested examples)
 *   - `{{...}}` → `{ {...}}`  (Gemini args expander; never wanted in our
 *                                source body — TestAtlas is deterministic)
 *   - `!{...}` → `! {...}`    (Gemini shell injection; same reason)
 *
 * @param {string} s
 * @returns {string}
 */
function escapeForTomlTripleString(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"""')
    .replace(/\{\{/g, '{ {')
    .replace(/!\{/g, '! {');
}

/**
 * Render a Gemini CLI command file from a source command's text. Output is
 * a complete TOML document.
 *
 *   description = "..."
 *   prompt = """
 *   <!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
 *   First read `.testatlas/bootstrap.md`. ...
 *
 *   <body>
 *   <!-- TESTATLAS:GENERATED:END section="adapter-body" -->
 *   """
 *
 * The marker envelope sits INSIDE the TOML triple-quoted prompt so the
 * parity gate's hash check still works — we just emit it as raw text rather
 * than wrapping a markdown blob.
 *
 * @param {{ sourceText: string, sourcePath: string }} opts
 * @returns {string}
 */
export function renderGemini({ sourceText, sourcePath }) {
  const fm = parseFrontmatter(sourceText);
  const { body } = extractFrontmatter(sourceText);

  const description = fm.description ?? '';
  const cmdName = commandBaseName(sourcePath);
  const cleanedBody = stripExistingPreamble(body);

  // Marker envelope — emit by hand because wrapInAdapterEnvelope writes
  // the canonical `<!-- ... -->\n<body>\n<!-- ... -->\n` form which is
  // also what we want here. We just escape the result for TOML embedding.
  // V2 (Phase 14 Wave 5): source paths now include category subdirs for
  // categorized commands (commands/core/...), so use sourceRelFromAbs to
  // derive the canonical marker `source` attribute.
  const fullSourceRel = sourceRelFromAbs(sourcePath);
  const sourceRel = fullSourceRel.startsWith('.testatlas/')
    ? fullSourceRel.slice('.testatlas/'.length)
    : `commands/${cmdName}.md`;
  const hash = hashContent(sourceText);
  const start = `<!-- TESTATLAS:GENERATED:START section="adapter-body" source="${sourceRel}" hash="${hash}" -->`;
  const end = '<!-- TESTATLAS:GENERATED:END section="adapter-body" -->';

  const innerBody = `${BOOTSTRAP_PREAMBLE}\n\n${cleanedBody.trimEnd()}`;
  const promptInner = `${start}\n${innerBody}\n${end}`;

  // TOML serialization. `description` is a single-line string; escape `"`
  // and `\`. `prompt` uses triple-quoted multi-line; opens on its own line
  // so leading whitespace inside the body isn't trimmed.
  const safeDesc = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safePrompt = escapeForTomlTripleString(promptInner);

  return [`description = "${safeDesc}"`, 'prompt = """', safePrompt, '"""', ''].join('\n');
}
