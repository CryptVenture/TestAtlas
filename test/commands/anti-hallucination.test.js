// test/commands/anti-hallucination.test.js
//
// PITFALL 15: the 22 finding-producing commands (5 Phase 3 + 17 Phase 4)
// must restate the "No evidence, no finding." rule from bootstrap §8
// verbatim. The 8 non-finding-producing commands are intentionally
// excluded from the regex and MUST NOT contain the phrase:
//   - Phase 3 non-producers: init, bootstrap, validate-workspace, plan
//   - Phase 4 non-producers: explore (umbrella), handoff, cleanup, update
// Empty-dir tolerant.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { listCommandFiles } from '../../scripts/lib/list-command-files.js';

const FINDING_PRODUCERS = /^(consolidate|explore-accessibility|explore-api|explore-cli|explore-codebase|explore-data|explore-docs|explore-integrations|explore-performance|explore-runtime|explore-security|explore-ui|log-issue|map-domains|report|retest|test-accessibility|test-domain|test-flow|test-performance|test-regression|triage)\.md$/;
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
