// test/commands/walkthrough-toolset.test.js
//
// Phase 13 / Plan 13-02 — Wave-0 RED-bar contract scaffolding.
//
// Asserts each UI-touching command cites the verbatim Chrome DevTools MCP
// tool names appropriate to its tier (per 13-RESEARCH.md §"Toolset Audit"
// Recommendation, lines 134–146).
//
// Tier 1 (mandatory in every UI-touching command body)
// Tier 2 (mandatory when interactive surfaces are present)
// Tier 3 (mandatory for a11y commands) = Tier 1 + lighthouse_audit + press_key
// Tier 4 (mandatory for perf commands)  = Tier 1 + perf trace tools + emulate
//
// Wave-0 contract: this test is intentionally RED until plans 13-04..13-07
// land. Tier-1 gap today is `handle_dialog`; Tier-2 gaps are `hover`,
// `type_text`, `upload_file`.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const TIER_1 = [
  'navigate_page',
  'wait_for',
  'take_snapshot',
  'take_screenshot',
  'list_console_messages',
  'list_network_requests',
  'evaluate_script',
  'handle_dialog',
];

const TIER_2_INTERACTIVE = ['click', 'fill_form', 'press_key', 'hover', 'type_text', 'upload_file'];

const TIER_3_A11Y = ['lighthouse_audit', 'take_snapshot', 'press_key', 'evaluate_script'];

const TIER_4_PERF = [
  'performance_start_trace',
  'performance_stop_trace',
  'performance_analyze_insight',
  'emulate',
];

async function readCmd(name) {
  return readFile(`.testatlas/commands/${name}`, 'utf8');
}

function assertCites(text, tools, file) {
  const missing = tools.filter((t) => !new RegExp(`\\b${t}\\b`).test(text));
  assert.deepEqual(missing, [], `${file}: missing verbatim tool names: ${missing.join(', ')}`);
}

test('explore-ui.md cites Tier-1 toolset verbatim', async () => {
  assertCites(await readCmd('explore-ui.md'), TIER_1, 'explore-ui.md');
});

test('explore-ui.md cites Tier-2 interactive surface tools verbatim', async () => {
  assertCites(await readCmd('explore-ui.md'), TIER_2_INTERACTIVE, 'explore-ui.md');
});

test('explore-accessibility.md + test-accessibility.md cite Tier-3 a11y tools verbatim', async () => {
  assertCites(await readCmd('explore-accessibility.md'), TIER_3_A11Y, 'explore-accessibility.md');
  assertCites(await readCmd('test-accessibility.md'), TIER_3_A11Y, 'test-accessibility.md');
});

test('explore-performance.md + test-performance.md cite Tier-4 perf tools verbatim', async () => {
  assertCites(await readCmd('explore-performance.md'), TIER_4_PERF, 'explore-performance.md');
  assertCites(await readCmd('test-performance.md'), TIER_4_PERF, 'test-performance.md');
});

test('test-flow.md + test-domain.md cite handle_dialog for interactive-surface walkthroughs', async () => {
  assertCites(await readCmd('test-flow.md'), ['handle_dialog'], 'test-flow.md');
  assertCites(await readCmd('test-domain.md'), ['handle_dialog'], 'test-domain.md');
});
