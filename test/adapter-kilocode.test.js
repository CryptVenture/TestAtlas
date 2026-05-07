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
import { expectedPreambleFor, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { parseFrontmatter } from '../scripts/lib/parse-frontmatter.js';
import { buildAdapterSourceSet } from './_helpers/adapter-source-set.js';

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

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.md', async () => {
  // Phase 16: kilocode renders flat. Total = V1 flat + V2 categorized.
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.md'));
  assert.equal(derived.length, total, `expected ${total} derived files; got ${derived.length}`);

  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
  for (const name of expectedNames) {
    assert.ok(derived.includes(name), `missing derived file: ${name}`);
  }
});

test('Test 2: each file has description + mode:primary + permission block honoring two-tree invariant', async () => {
  // Phase 16: walk every flat-root derived file (V1 + V2).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const sourceFm = parseFrontmatter(expected.sourceText);
    const derivedPath = path.join(ADAPTER_DIR, name);
    const derivedText = await readFile(derivedPath, 'utf8');

    // Check the YAML frontmatter as raw text — the simple parser does not
    // handle nested objects, so we assert against the literal YAML shape.
    assert.ok(derivedText.startsWith('---\n'), `${name}: missing frontmatter fence`);
    const fmEnd = derivedText.indexOf('\n---\n', 4);
    assert.ok(fmEnd !== -1, `${name}: missing closing frontmatter fence`);
    const fm = derivedText.slice(4, fmEnd);

    assert.match(
      fm,
      new RegExp(`^description:\\s*${escapeRegex(sourceFm.description)}\\s*$`, 'm'),
      `${name}: description must match source verbatim`,
    );
    assert.match(fm, /^mode:\s*primary\s*$/m, `${name}: missing 'mode: primary'`);
    assert.match(fm, /^permission:\s*$/m, `${name}: missing 'permission:' key`);
    assert.match(fm, /^\s+edit:\s*$/m, `${name}: missing 'permission.edit' subkey`);
    // Two-tree invariant — exact YAML lockdown:
    assert.match(
      fm,
      /"_testatlas\/\*\*":\s*allow/,
      `${name}: permission.edit must allow _testatlas/**`,
    );
    assert.match(
      fm,
      /"\.testatlas\/\*\*":\s*deny/,
      `${name}: permission.edit must deny .testatlas/**`,
    );
    assert.match(fm, /"\*":\s*ask/, `${name}: permission.edit must ask for "*"`);

    // permission.bash mirrors the source's `shell` capability.
    const hasShell =
      Array.isArray(sourceFm.capabilities) && sourceFm.capabilities.includes('shell');
    const expectedBash = hasShell ? 'allow' : 'deny';
    assert.match(
      fm,
      new RegExp(`^\\s+bash:\\s*${expectedBash}\\s*$`, 'm'),
      `${name}: permission.bash must be '${expectedBash}' (source shell=${hasShell})`,
    );
  }
});

test('Test 3: envelope present; line after START is BOOTSTRAP_PREAMBLE; marker source/hash valid', async () => {
  // Phase 16: marker.source carries the SOURCE path; output is flat.
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.md' });
  for (const [name, expected] of flatNameToSource.entries()) {
    const derivedPath = path.join(ADAPTER_DIR, name);
    const derivedText = await readFile(derivedPath, 'utf8');

    const marker = parseAdapterMarker(derivedText);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(marker.hash, hashContent(expected.sourceText), `${name}: hash mismatch`);

    const lines = derivedText.split('\n');
    const startIdx = lines.findIndex((l) =>
      l.includes('TESTATLAS:GENERATED:START section="adapter-body"'),
    );
    assert.ok(startIdx !== -1, `${name}: missing GENERATED:START marker line`);
    // Quick 260507-hzw: BOOTSTRAP_PREAMBLE carries an {{ADAPTER_COMMAND_PATH}}
    // placeholder substituted per adapter at render-time.
    assert.equal(
      lines[startIdx + 1],
      expectedPreambleFor(`.kilocode/workflows/${name}`),
      `${name}: line after START must be substituted BOOTSTRAP_PREAMBLE verbatim`,
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
