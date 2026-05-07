// test/commands/adapter-command-path-substitution.test.js
//
// Quick 260507-hzw regression suite for the {{ADAPTER_COMMAND_PATH}}
// render-time substitution contract:
//
//   1. NO file under any `.testatlas/adapters/<adapter>/<output-dir>/` path
//      may contain the literal placeholder string {{ADAPTER_COMMAND_PATH}}.
//      If even one rendered output leaks the placeholder, the user's agent
//      reads it literally and probes the wrong filesystem path. This is the
//      empirical KiloCode bug that motivated the Quick.
//
//   2. BOOTSTRAP_PREAMBLE in scripts/lib/adapters/_shared.js MUST still
//      contain the placeholder — that's the single source-of-truth template
//      that all adapter renderers compose into their output.
//
//   3. Per-adapter spot checks: claude-code, kilocode, cursor, codex
//      bootstrap files MUST contain their adapter-specific install path
//      verbatim (e.g. `.kilocode/workflows/atlas-bootstrap.md` for KiloCode).

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADAPTER_COMMAND_PATH_PLACEHOLDER,
  BOOTSTRAP_PREAMBLE,
} from '../../scripts/lib/adapters/_shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const ADAPTERS_DIR = path.join(repoRoot, '.testatlas', 'adapters');

/** Recursively list every regular file under `dir`. */
async function* walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else if (e.isFile()) yield p;
  }
}

test('Quick 260507-hzw: no rendered adapter file contains the {{ADAPTER_COMMAND_PATH}} placeholder', async () => {
  const leaks = [];
  for await (const file of walkFiles(ADAPTERS_DIR)) {
    // Skip the adapter-capabilities.json registry + per-adapter README.md
    // files at the adapter root — they don't go through the render pipeline
    // and aren't user-facing rendered command bodies. The README files DO
    // get scanned but should never contain the placeholder either, so
    // there's no legitimate skip — we walk everything.
    const text = await readFile(file, 'utf8');
    if (text.includes(ADAPTER_COMMAND_PATH_PLACEHOLDER)) {
      leaks.push(path.relative(repoRoot, file));
    }
  }
  assert.deepEqual(
    leaks,
    [],
    `placeholder leaked into ${leaks.length} adapter files (each will mislead the agent at runtime):\n  ${leaks.join('\n  ')}`,
  );
});

test('Quick 260507-hzw: BOOTSTRAP_PREAMBLE retains the placeholder (source-of-truth template)', () => {
  assert.ok(
    BOOTSTRAP_PREAMBLE.includes(ADAPTER_COMMAND_PATH_PLACEHOLDER),
    'BOOTSTRAP_PREAMBLE must carry the {{ADAPTER_COMMAND_PATH}} placeholder so adapter renderers can substitute it at render-time',
  );
});

test('Quick 260507-hzw: claude-code atlas-bootstrap.md contains its install path verbatim', async () => {
  const file = path.join(ADAPTERS_DIR, 'claude-code', '.claude', 'commands', 'atlas-bootstrap.md');
  const text = await readFile(file, 'utf8');
  assert.ok(
    text.includes('`.claude/commands/atlas-bootstrap.md`'),
    'claude-code atlas-bootstrap.md must contain its install path .claude/commands/atlas-bootstrap.md verbatim',
  );
});

test('Quick 260507-hzw: kilocode atlas-bootstrap.md contains its install path verbatim', async () => {
  const file = path.join(ADAPTERS_DIR, 'kilocode', '.kilocode', 'workflows', 'atlas-bootstrap.md');
  const text = await readFile(file, 'utf8');
  assert.ok(
    text.includes('`.kilocode/workflows/atlas-bootstrap.md`'),
    'kilocode atlas-bootstrap.md must contain its install path .kilocode/workflows/atlas-bootstrap.md verbatim',
  );
});

test('Quick 260507-hzw: cursor atlas-bootstrap.mdc contains its install path verbatim', async () => {
  const file = path.join(ADAPTERS_DIR, 'cursor', '.cursor', 'rules', 'atlas-bootstrap.mdc');
  const text = await readFile(file, 'utf8');
  assert.ok(
    text.includes('`.cursor/rules/atlas-bootstrap.mdc`'),
    'cursor atlas-bootstrap.mdc must contain its install path .cursor/rules/atlas-bootstrap.mdc verbatim',
  );
});

test('Quick 260507-hzw: codex atlas-bootstrap.md contains its install path verbatim', async () => {
  const file = path.join(ADAPTERS_DIR, 'codex', '.codex', 'prompts', 'atlas-bootstrap.md');
  const text = await readFile(file, 'utf8');
  assert.ok(
    text.includes('`.codex/prompts/atlas-bootstrap.md`'),
    'codex atlas-bootstrap.md must contain its install path .codex/prompts/atlas-bootstrap.md verbatim',
  );
});

test('Quick 260507-hzw: aggregate adapters substitute the placeholder with their aggregate file path', async () => {
  // Aider's CONVENTIONS.md should reference itself as the aggregate; the
  // BOOTSTRAP_PREAMBLE inside its envelope substitutes with `CONVENTIONS.md`.
  const aiderText = await readFile(path.join(ADAPTERS_DIR, 'aider', 'CONVENTIONS.md'), 'utf8');
  assert.ok(
    aiderText.includes('Then read `CONVENTIONS.md`'),
    'aider CONVENTIONS.md must substitute placeholder with its own file name',
  );

  // Roo Code's .roo/rules/atlas.md
  const rooText = await readFile(
    path.join(ADAPTERS_DIR, 'roo-code', '.roo', 'rules', 'atlas.md'),
    'utf8',
  );
  assert.ok(
    rooText.includes('Then read `.roo/rules/atlas.md`'),
    'roo-code atlas.md must substitute placeholder with its install path',
  );
});
