// test/adapter-gemini-cli.test.js
//
// Structural assertions on the 32 generated Gemini CLI adapter commands.
// Gemini CLI commands are TOML files with `description` and `prompt` keys
// (per geminicli.com/docs/cli/custom-commands). The marker envelope sits
// inside the triple-quoted `prompt` value.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_PREAMBLE, parseAdapterMarker } from '../scripts/lib/adapters/_shared.js';
import { hashContent } from '../scripts/lib/content-hash.js';
import { buildAdapterSourceSet } from './_helpers/adapter-source-set.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(
  repoRoot,
  '.testatlas',
  'adapters',
  'gemini-cli',
  '.gemini',
  'commands',
);

test('Test 1: every source command (V1 + V2 categorized) has a flat-root atlas-*.toml file', async () => {
  // Phase 16: gemini-cli renders flat. The pre-flatten namespace mutation
  // `/atlas-explore:atlas-explore-state` is gone; the TOML now sits at the
  // flat root (`atlas-explore-state.toml`) as a single-segment slash command.
  const { total, expectedNames } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.toml' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.toml'));
  assert.equal(
    derived.length,
    total,
    `expected ${total} derived TOML files; got ${derived.length}`,
  );

  for (const name of derived) {
    assert.ok(expectedNames.has(name), `unexpected derived file: ${name}`);
  }
});

test('Test 2: each TOML file declares description + prompt keys; envelope inside prompt', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.toml'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    // TOML structure: first non-blank line is `description = "..."`, then
    // `prompt = """`, then body, then closing `"""`.
    assert.match(
      text,
      /^description = "[^"]*"$/m,
      `${name}: missing or malformed description = "..."`,
    );
    assert.match(text, /^prompt = """$/m, `${name}: missing prompt = """ opener`);
    assert.match(text, /^"""$/m, `${name}: missing prompt = """ closer`);
    // Marker envelope present (parseAdapterMarker scans line-by-line so it
    // finds the marker even though it's inside a TOML literal).
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing GENERATED:START marker`);
    assert.equal(marker.section, 'adapter-body');
    assert.ok(text.includes(BOOTSTRAP_PREAMBLE), `${name}: missing bootstrap preamble`);
  }
});

test('Test 3: marker source + hash match V1-flat or V2-categorized source', async () => {
  // Phase 16: marker.source carries the SOURCE path
  // (`commands/<name>.md` for V1, `commands/<category>/<name>.md` for V2).
  const { flatNameToSource } = await buildAdapterSourceSet({ cwd: repoRoot, ext: '.toml' });
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.toml'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker, `${name}: missing marker`);
    const expected = flatNameToSource.get(name);
    assert.ok(expected, `${name}: no expected source mapping`);
    assert.equal(marker.source, expected.sourceRel, `${name}: marker.source mismatch`);
    assert.equal(
      marker.hash,
      hashContent(expected.sourceText),
      `${name}: hash mismatch with source`,
    );
  }
});

test('Test 4: TOML escaping — no unescaped {{ args }} or !{ shell } in the rendered prompt', async () => {
  // Gemini's templating layer would interpret these as user-arg expansion or
  // shell injection; the renderer escapes them defensively.
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.toml'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    assert.equal(
      text.includes('{{'),
      false,
      `${name}: contains unescaped {{ — would trigger Gemini args expansion`,
    );
    assert.equal(
      text.match(/(^|[^\\])!\{/) === null,
      true,
      `${name}: contains unescaped !{ — would trigger Gemini shell injection`,
    );
  }
});

test('Test 5: README.md exists with required sections + reload note', async () => {
  const text = await readFile(
    path.join(repoRoot, '.testatlas', 'adapters', 'gemini-cli', 'README.md'),
    'utf8',
  );
  for (const heading of ['Install', 'Format', 'Capabilities', 'Caveats', 'Regeneration']) {
    assert.match(text, new RegExp(heading, 'i'), `README missing section: ${heading}`);
  }
  assert.match(text, /\/commands reload/, 'README must mention /commands reload');
  assert.match(text, /~\/\.gemini\/commands/, 'README must point to ~/.gemini/commands/');
});
