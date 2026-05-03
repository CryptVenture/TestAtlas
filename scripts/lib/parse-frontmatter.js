// scripts/lib/parse-frontmatter.js
//
// Strict, minimal YAML frontmatter parser for .testatlas/commands/*.md files.
// Handles: scalar key:value, inline arrays `[a, b]`, block arrays `- item`,
// quoted scalars. Rejects: nested objects, missing closing fence, malformed lines.
// No external deps — pure regex line scanning.

const FENCE_RE = /^---\s*$/;
const KV_RE = /^([a-zA-Z_$][\w-]*)\s*:\s*(.*)$/;
const BLOCK_ITEM_RE = /^\s+-\s+(.*)$/;
const COMMENT_RE = /^\s*#/;
const BLANK_RE = /^\s*$/;

function stripQuotes(s) {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArray(raw) {
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  return inner
    .split(',')
    .map((s) => stripQuotes(s))
    .filter((s) => s.length > 0);
}

/**
 * Split a markdown file into `{ frontmatterText, body }`. Throws if the file
 * does not start with `---` on line 1, or if the closing `---` fence is missing.
 *
 * @param {string} text
 * @returns {{ frontmatterText: string, body: string }}
 */
export function extractFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !FENCE_RE.test(lines[0])) {
    throw new Error('frontmatter: file must start with `---` on line 1');
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    throw new Error('frontmatter: missing closing `---` fence');
  }
  return {
    frontmatterText: lines.slice(1, closeIdx).join('\n'),
    body: lines.slice(closeIdx + 1).join('\n'),
  };
}

/**
 * Parse the YAML head block of a markdown file into a plain object.
 * Strict: rejects nested objects, malformed lines, missing fences.
 *
 * @param {string} text
 * @returns {Record<string, string | string[]>}
 */
export function parseFrontmatter(text) {
  const { frontmatterText } = extractFrontmatter(text);
  const lines = frontmatterText.split(/\r?\n/);
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK_RE.test(line) || COMMENT_RE.test(line)) {
      i++;
      continue;
    }
    const m = line.match(KV_RE);
    if (!m) {
      throw new Error(`frontmatter: malformed line ${i + 1}: ${line}`);
    }
    const key = m[1];
    const raw = m[2].trim();

    if (raw === '') {
      // Block array follows. Consume contiguous `^\s+-\s+` lines.
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (BLANK_RE.test(next) || COMMENT_RE.test(next)) {
          j++;
          continue;
        }
        const bm = next.match(BLOCK_ITEM_RE);
        if (!bm) break;
        items.push(stripQuotes(bm[1]));
        j++;
      }
      if (items.length === 0) {
        throw new Error(`frontmatter: key "${key}" expects a block array but none followed`);
      }
      out[key] = items;
      i = j;
      continue;
    }

    if (raw.startsWith('[') && raw.endsWith(']')) {
      out[key] = parseInlineArray(raw);
      i++;
      continue;
    }

    out[key] = stripQuotes(raw);
    i++;
  }
  return out;
}
