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
import { listCommandFiles } from '../scripts/lib/list-command-files.js';

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

test('Test 1: 32 derived atlas-*.toml files exist (one per source command)', async () => {
  const sources = await listCommandFiles({ cwd: repoRoot });
  assert.equal(sources.length, 32, `expected 32 source commands; got ${sources.length}`);

  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.toml'));
  assert.equal(derived.length, 32, `expected 32 derived TOML files; got ${derived.length}`);

  const expectedNames = new Set(sources.map((p) => `atlas-${path.basename(p, '.md')}.toml`));
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

test('Test 3: marker source + hash match commands/<name>.md and hashContent(source)', async () => {
  const entries = await readdir(ADAPTER_DIR);
  const derived = entries.filter((n) => n.startsWith('atlas-') && n.endsWith('.toml'));
  for (const name of derived) {
    const text = await readFile(path.join(ADAPTER_DIR, name), 'utf8');
    const marker = parseAdapterMarker(text);
    assert.ok(marker);
    const cmdName = name.replace(/^atlas-/, '').replace(/\.toml$/, '');
    assert.equal(marker.source, `commands/${cmdName}.md`);
    const sourceText = await readFile(
      path.join(repoRoot, '.testatlas', 'commands', `${cmdName}.md`),
      'utf8',
    );
    assert.equal(marker.hash, hashContent(sourceText), `${name}: hash mismatch with source`);
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
