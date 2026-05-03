// test/commands/capability-fallback.test.js
//
// CMD-04: a command declaring a capability in frontmatter must also cite a
// fallback path in prose so the agent has guidance when the capability is
// unavailable. Empty-dir tolerant.
//
// Phase 4 closure: PATTERNS extended with `web-fetch`. `file-write` is
// declared by ~all 30 commands but does not yet have fallback prose authored
// across the suite — adding the regex now would force a sweep across all 30
// files. `file-write` is therefore DEFERRED to Phase 5 alongside the
// suite-wide file-write fallback prose authoring pass.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';
import { parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

const PATTERNS = {
  shell: /shell.*unavailable|If `shell`|`shell`.*unavailable/i,
  browser: /browser.*unavailable|If `browser`|`browser`.*unavailable/i,
  MCP: /MCP.*unavailable|If `MCP`|`MCP`.*unavailable/i,
  'web-fetch': /web-fetch.*unavailable|If `web-fetch`|`web-fetch`.*unavailable/i,
  // 'file-write' deferred to Phase 5 — current commands declare file-write
  // without prose; adding the regex now would force a sweep across all 30 files.
};

async function checkCapability(name) {
  const files = await listCommandFiles();
  if (files.length === 0) return [];
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    let fm;
    try {
      fm = parseFrontmatter(text);
    } catch {
      continue; // command-frontmatter test reports parse errors
    }
    if (!Array.isArray(fm.capabilities) || !fm.capabilities.includes(name)) continue;
    if (!PATTERNS[name].test(text)) {
      failures.push(`${path.basename(file)}: declares "${name}" but lacks fallback prose`);
    }
  }
  return failures;
}

test('CMD-04: commands declaring shell capability cite a fallback', async () => {
  assert.deepEqual(await checkCapability('shell'), []);
});

test('CMD-04: commands declaring browser capability cite a fallback', async () => {
  assert.deepEqual(await checkCapability('browser'), []);
});

test('CMD-04: commands declaring MCP capability cite a fallback', async () => {
  assert.deepEqual(await checkCapability('MCP'), []);
});

test('CMD-04: commands declaring web-fetch capability cite a fallback', async () => {
  assert.deepEqual(await checkCapability('web-fetch'), []);
});
