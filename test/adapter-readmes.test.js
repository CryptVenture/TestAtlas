// test/adapter-readmes.test.js
//
// Phase 6 closure (Plan 06-05): audit gate over the per-adapter README files
// authored across Plans 06-01/03/04 plus the top-level adapters index
// authored in this plan.
//
// Three guarantees:
//
//   1. For each of the 7 adapters (claude-code, generic, opencode, kilocode,
//      cursor, aider, mcp), `.testatlas/adapters/<name>/README.md` exists.
//   2. Every per-adapter README contains the required H2 sections:
//      - `## Install`
//      - `## Capabilities`
//      - `## Regeneration`
//      Plus a "Limitations equivalent" section. The vocabulary is open for
//      adapters whose limitations are best framed differently (aider:
//      `## Why one file, not 30`; cursor: `## Note on flat-MDC vs folder
//      format`); a plain `## Limitations` heading is also accepted.
//   3. The top-level `.testatlas/adapters/README.md` exists and references
//      all 7 adapter names — each must appear at least once in the file.
//
// Headings are matched case-insensitively at the start of a line so the
// audit doesn't get fragile about future copyedits.

import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTERS_DIR = path.join(repoRoot, '.testatlas', 'adapters');

const ADAPTERS = ['claude-code', 'generic', 'opencode', 'kilocode', 'cursor', 'aider', 'mcp'];

// Per-adapter "Limitations equivalent" alternatives. A plain `## Limitations`
// heading is always accepted; specific adapters use a contextual variant
// because rendering-strategy quirks are clearer than a generic header.
// 06-01..04 each authored its adapter's README with a domain-specific section
// covering the limitations/quirks; this gate accepts those by name.
const LIMITATIONS_ALTERNATIVES = {
  aider: [/^##\s+Why one file,? not 30/im, /^##\s+Limitations/im],
  cursor: [/^##\s+Note on flat-MDC/im, /^##\s+Limitations/im],
  generic: [/^##\s+How to use/im, /^##\s+Limitations/im],
  opencode: [/^##\s+Note on the `agent:` field/im, /^##\s+Limitations/im],
  kilocode: [/^##\s+Permission philosophy/im, /^##\s+Limitations/im],
  mcp: [/^##\s+NO PER-COMMAND FILES/im, /^##\s+Why prompts\//im, /^##\s+Limitations/im],
  // claude-code falls through to default `## Limitations`.
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

test('Test 1: each of the 7 per-adapter README.md files exists', async () => {
  for (const name of ADAPTERS) {
    const p = path.join(ADAPTERS_DIR, name, 'README.md');
    assert.ok(await exists(p), `expected README.md for adapter '${name}' at ${p}`);
  }
});

test('Test 2: each per-adapter README contains required H2 sections', async () => {
  for (const name of ADAPTERS) {
    const p = path.join(ADAPTERS_DIR, name, 'README.md');
    const text = await readFile(p, 'utf8');

    assert.match(text, /^##\s+Install/im, `${name}/README.md must contain '## Install' H2 heading`);
    assert.match(
      text,
      /^##\s+Capabilities/im,
      `${name}/README.md must contain '## Capabilities' H2 heading`,
    );
    assert.match(
      text,
      /^##\s+Regeneration/im,
      `${name}/README.md must contain '## Regeneration' H2 heading`,
    );

    // Limitations equivalent: either plain `## Limitations` or an adapter-
    // specific alternative.
    const alternatives = LIMITATIONS_ALTERNATIVES[name] ?? [/^##\s+Limitations/im];
    const matched = alternatives.some((re) => re.test(text));
    assert.ok(
      matched,
      `${name}/README.md must contain a limitations-equivalent H2 heading; tried: ${alternatives.map((r) => r.source).join(' | ')}`,
    );
  }
});

test('Test 3: top-level .testatlas/adapters/README.md exists and lists all 7 adapters', async () => {
  const p = path.join(ADAPTERS_DIR, 'README.md');
  assert.ok(await exists(p), `top-level adapters README must exist at ${p}`);
  const text = await readFile(p, 'utf8');
  for (const name of ADAPTERS) {
    assert.ok(
      text.includes(name),
      `top-level adapters README must reference adapter name '${name}'`,
    );
  }
});
