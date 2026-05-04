// test/docs/validate-workspace-command-content.test.js
//
// Quick 260504-r3q Task 2. Doc-content assertions that
// `.testatlas/commands/validate-workspace.md` no longer carries the stale
// "Phase 5 ships the runtime" / "Phase 5 not yet installed" framing now that
// the runtime ships in v1, and that it points operators at the two reachable
// invocation paths.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMAND_PATH = path.join(REPO_ROOT, '.testatlas', 'commands', 'validate-workspace.md');
const INSTALL_DOC_PATH = path.join(REPO_ROOT, 'docs', 'INSTALL.md');

test('validate-workspace.md: no longer contains stale Phase-5 framing (Quick 260504-r3q)', async () => {
  const content = await readFile(COMMAND_PATH, 'utf8');
  assert.ok(
    !content.includes('Phase 5 ships the runtime'),
    'must remove "Phase 5 ships the runtime"',
  );
  assert.ok(
    !content.includes('Phase 5 not yet installed'),
    'must remove "Phase 5 not yet installed"',
  );
  assert.ok(
    !content.includes('Phase 5 ships --auto-heal'),
    'must remove "Phase 5 ships --auto-heal"',
  );
});

test('validate-workspace.md: documents both reachable invocation paths (Quick 260504-r3q)', async () => {
  const content = await readFile(COMMAND_PATH, 'utf8');
  assert.ok(
    content.includes('npx @webventures/testatlas validate'),
    'must point to the npx-validate path',
  );
  assert.ok(
    content.includes('node .testatlas/scripts/validate-workspace.js'),
    'must mention the in-tree script path',
  );
});

test('docs/INSTALL.md: contains the Validation section with both invocation paths (Quick 260504-r3q)', async () => {
  const content = await readFile(INSTALL_DOC_PATH, 'utf8');
  assert.match(content, /^## Validation\b/m, 'expected an H2 "## Validation" heading');
  assert.ok(
    content.includes('npx @webventures/testatlas validate'),
    'INSTALL.md must show the npx-validate command',
  );
  assert.ok(
    content.includes('node .testatlas/scripts/validate-workspace.js'),
    'INSTALL.md must show the in-tree validator path',
  );
});

test('docs/INSTALL.md: does not regress to stale Phase-5 framing (Quick 260504-r3q)', async () => {
  const content = await readFile(INSTALL_DOC_PATH, 'utf8');
  assert.ok(
    !content.includes('Phase 5 ships the runtime'),
    'INSTALL.md must not contain "Phase 5 ships the runtime"',
  );
  assert.ok(
    !content.includes('Phase 5 not yet installed'),
    'INSTALL.md must not contain "Phase 5 not yet installed"',
  );
});
