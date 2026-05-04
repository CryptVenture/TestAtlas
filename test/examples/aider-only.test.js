// test/examples/aider-only.test.js
//
// Plan 08-04 Task 1 — Aider-only adapter set + needs-validation issue assertions
// for examples/cli-tool/. Closes EX-07 (capability-aware degradation proof).

import { strict as assert } from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { REPO_ROOT, runRegenerate } from './_helpers.js';

const EXAMPLE = path.join(REPO_ROOT, 'examples', 'cli-tool');
const TO_FIX = path.join(EXAMPLE, '_testatlas', 'to_fix');

test('cli-tool aider-only: .aider.conf.yml exists and is valid YAML-ish', async () => {
  const text = await readFile(path.join(EXAMPLE, '.aider.conf.yml'), 'utf8');
  // Minimal YAML sanity: the aider template is `read:` block referencing
  // bootstrap.md + CONVENTIONS.md. Assert both references plus a colon
  // at the end of a top-level key.
  assert.match(text, /read:/);
  assert.match(text, /CONVENTIONS\.md/);
  assert.match(text, /bootstrap\.md/);
});

test('cli-tool aider-only: CONVENTIONS.md exists with ≥50 lines, contains TestAtlas + /atlas-* command refs', async () => {
  const text = await readFile(path.join(EXAMPLE, 'CONVENTIONS.md'), 'utf8');
  const lines = text.split('\n');
  assert.ok(lines.length >= 50, `expected ≥50 lines, got ${lines.length}`);
  assert.ok(text.includes('TestAtlas'), 'CONVENTIONS.md must mention TestAtlas');
  assert.match(text, /\/atlas-/, 'must reference at least one /atlas-* command');
});

test('cli-tool aider-only: NO .claude/ directory', async () => {
  await assert.rejects(() => stat(path.join(EXAMPLE, '.claude')), { code: 'ENOENT' });
});

test('cli-tool aider-only: NO .opencode/ directory', async () => {
  await assert.rejects(() => stat(path.join(EXAMPLE, '.opencode')), { code: 'ENOENT' });
});

test('cli-tool aider-only: NO .cursor/ directory and no .cursorrules / .cursor.rules files', async () => {
  await assert.rejects(() => stat(path.join(EXAMPLE, '.cursor')), { code: 'ENOENT' });
  await assert.rejects(() => stat(path.join(EXAMPLE, '.cursorrules')), { code: 'ENOENT' });
  await assert.rejects(() => stat(path.join(EXAMPLE, '.cursor.rules')), { code: 'ENOENT' });
});

test('cli-tool aider-only: NO .kilo/ or .kilocode/ directory', async () => {
  await assert.rejects(() => stat(path.join(EXAMPLE, '.kilo')), { code: 'ENOENT' });
  await assert.rejects(() => stat(path.join(EXAMPLE, '.kilocode')), { code: 'ENOENT' });
});

test('cli-tool aider-only: NO MCP-server adapter trees (.mcp.json / mcp-config.json / mcp-server-manifest.json at root)', async () => {
  for (const f of ['.mcp.json', 'mcp-config.json', 'mcp-server-manifest.json']) {
    await assert.rejects(
      () => stat(path.join(EXAMPLE, f)),
      { code: 'ENOENT' },
      `unexpected MCP artifact at example root: ${f}`,
    );
  }
});

test('cli-tool aider-only: ≥1 issue under to_fix/ with confidence: "needs-validation"', async () => {
  const entries = await readdir(TO_FIX, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.startsWith('ISSUE-') && e.name.endsWith('.json'))
    .map((e) => e.name);
  let found = 0;
  for (const fname of jsonFiles) {
    const data = JSON.parse(await readFile(path.join(TO_FIX, fname), 'utf8'));
    if (data.confidence === 'needs-validation') found += 1;
  }
  assert.ok(
    found >= 1,
    `expected ≥1 needs-validation issue under to_fix/, got ${found} of ${jsonFiles.length}`,
  );
});

test('cli-tool aider-only: needs-validation issue body documents a degradation reason', async () => {
  const entries = await readdir(TO_FIX, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.startsWith('ISSUE-') && e.name.endsWith('.json'))
    .map((e) => e.name);
  let documented = false;
  for (const fname of jsonFiles) {
    const data = JSON.parse(await readFile(path.join(TO_FIX, fname), 'utf8'));
    if (data.confidence !== 'needs-validation') continue;
    // The degradation reason must be documented somewhere in the issue body.
    // Per Task 1 option (A): description-only — the reason is embedded in
    // `summary` / `userImpact` / `suspectedRootCause` with a discoverable
    // marker substring. Accept any of: "Degradation reason", "no browser",
    // "no shell", "no MCP", "needs runtime verification", "code-reading only".
    const haystack = JSON.stringify(data).toLowerCase();
    if (
      haystack.includes('degradation reason') ||
      haystack.includes('no browser') ||
      haystack.includes('no shell') ||
      haystack.includes('no mcp') ||
      haystack.includes('needs runtime verification') ||
      haystack.includes('code-reading only')
    ) {
      documented = true;
      break;
    }
  }
  assert.ok(documented, 'no needs-validation issue documents a degradation reason marker');
});

test('cli-tool aider-only: regenerate --check exits 0 (fixture and disk in sync)', async () => {
  const r = await runRegenerate(EXAMPLE, { check: true });
  assert.equal(r.code, 0, `expected 0; stdout:${r.stdout}\nstderr:${r.stderr}`);
});
