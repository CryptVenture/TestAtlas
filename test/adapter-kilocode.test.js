// test/adapter-kilocode.test.js
//
// Plan 06-03 Task 3: structural assertions on the 32 generated KiloCode
// adapter files. KiloCode's canonical 2026 path is
// `.kilocode/workflows/<name>.md` per kilo.ai/docs/customize/custom-modes —
// 32 atlas commands map to slash-invokable workflows.
//
// Critical contract: the `permission` block enforces TestAtlas's two-tree
// invariant (D-RES Open Question 4):
//   permission.edit:
//     "_testatlas/**": allow   ← workspace tree
//     ".testatlas/**": deny    ← suite tree (sacred)
//     "*": ask                 ← everything else requires confirmation
//   permission.bash: allow if source has `shell` capability, else deny.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { listCommandFiles } from '../scripts/lib/list-command-files.js';
import { parseFrontmatter } from '../scripts/lib/parse-frontmatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'kilocode',
  '.kilocode',
  'workflows',
);

test('Test 1: 32 derived atlas-*.md agent files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 32, `expected 32 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, 32, `expected 32 derived files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.md`));
  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each file has description + mode:primary + permission block honoring two-tree invariant', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceText = await readFile(sourcePath, 'utf8');
    const sourceFm = parseFrontmatter(sourceText);
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');

    // Check the YAML frontmatter as raw text — the simple parser does not
    // handle nested objects, so we assert against the literal YAML shape.
    assert.ok(derivedText.startsWith('---\n'), `atlas-${cmdName}.md: missing frontmatter fence`);
    const fmEnd = derivedText.indexOf('\n---\n', 4);
    assert.ok(fmEnd !== -1, `atlas-${cmdName}.md: missing closing frontmatter fence`);
    const fm = derivedText.slice(4, fmEnd);

    assert.match(
      fm,
      new RegExp(`^description:\\s*${escapeRegex(sourceFm.description)}\\s*$`, 'm'),
      `atlas-${cmdName}.md: description must match source verbatim`,
    );
    assert.match(fm, /^mode:\s*primary\s*$/m, `atlas-${cmdName}.md: missing 'mode: primary'`);
    assert.match(fm, /^permission:\s*$/m, `atlas-${cmdName}.md: missing 'permission:' key`);
    assert.match(fm, /^\s+edit:\s*$/m, `atlas-${cmdName}.md: missing 'permission.edit' subkey`);
    // Two-tree invariant — exact YAML lockdown:
    assert.match(
      fm,
      /"_testatlas\/\*\*":\s*allow/,
      `atlas-${cmdName}.md: permission.edit must allow _testatlas/**`,
    );
    assert.match(
      fm,
      /"\.testatlas\/\*\*":\s*deny/,
      `atlas-${cmdName}.md: permission.edit must deny .testatlas/**`,
    );
    assert.match(fm, /"\*":\s*ask/, `atlas-${cmdName}.md: permission.edit must ask for "*"`);

    // permission.bash mirrors the source's `shell` capability.
    const hasShell =
      Array.isArray(sourceFm.capabilities) && sourceFm.capabilities.includes('shell');
    const expectedBash = hasShell ? 'allow' : 'deny';
    assert.match(
      fm,
      new RegExp(`^\\s+bash:\\s*${expectedBash}\\s*$`, 'm'),
      `atlas-${cmdName}.md: permission.bash must be '${expectedBash}' (source shell=${hasShell})`,
    );
  }
});

test('Test 3: envelope present; line after START is BOOTSTRAP_PREAMBLE; marker source/hash valid', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  for (const sourcePath of sources) {
    const cmdName = path.basename(sourcePath, '.md');
    const sourceText = await readFile(sourcePath, 'utf8');
    const expectedHash = hashContent(sourceText);
    const derivedPath = path.join(ADAPTER_DIR, `atlas-${cmdName}.md`);
    const derivedText = await readFile(derivedPath, 'utf8');

    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `atlas-${cmdName}.md: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    assert.equal(marker.hash, expectedHash, `atlas-${cmdName}.md: hash mismatch`);

    const lines = derivedText.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `atlas-${cmdName}.md: missing GENERATED:START marker line`);
    assert.equal(
      lines[startIdx + 1],
      BOOTSTRAP_PREAMBLE,
      `atlas-${cmdName}.md: line after START must be BOOTSTRAP_PREAMBLE verbatim`,
    );
  }
});

test('Test 4: README.md exists with required sections + permission philosophy + canonical-path note', async () => {
  const readmePath = path.join(repoRoot, '.testatlas', 'adapters', 'kilocode', 'README.md');
  const text = await readFile(readmePath, 'utf8');
  for (const heading of ['Install', 'Capabilities', 'Permission', 'canonical']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section/topic: ${heading}`);
  }
  assert.match(
    text,
    /\.kilocode\/workflows/,
    'README must reference canonical .kilocode/workflows path',
  );
  assert.match(text, /two-tree/i, 'README must explain the two-tree invariant');
});

/**
 * Escape regex metacharacters in a string literal for safe inline composition.
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
