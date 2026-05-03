// test/commands/anti-hallucination.test.js
//
// PITFALL 15: the 5 finding-producing commands must restate the
// "No evidence, no finding." rule from bootstrap §8 verbatim. plan.md is
// not a finding-producing command and is skipped. Empty-dir tolerant.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const FINDING_PRODUCERS = /^(explore-codebase|map-domains|test-flow|log-issue|report)\.md$/;
const ANTI_HALLUC = 'No evidence, no finding.';

test('PITFALL-15: finding-producing commands restate the no-evidence rule', async () => {
  const files = await listCommandFiles();
  if (files.length === 0) return;
  const failures = [];
  for (const file of files) {
    const base = path.basename(file);
    if (!FINDING_PRODUCERS.test(base)) continue;
    const text = await readFile(file, 'utf8');
    if (!text.includes(ANTI_HALLUC)) {
      failures.push(`${base}: missing verbatim "${ANTI_HALLUC}"`);
    }
  }
  assert.deepEqual(failures, []);
});
