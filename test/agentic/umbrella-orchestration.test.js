// Wave 0 — Bucket #4: each of the 4 umbrella commands must contain a
// "## Sub-Agent Orchestration" H2 section. Inside that section the
// orchestration block must contain all 5 brief slots from 09-RESEARCH.md
// Pattern 1 (objective, scope, files-to-read, output-format, exit-criteria).
//
// Quick 260505-hld / F-11 Option A: explore.md is now a SPAWNING umbrella —
// it spawns recommended sub-explorers in parallel via the host's
// subagent-spawn capability and aggregates their structured findings into
// _testatlas/02_product_overview.md alongside the routing-decision record at
// _testatlas/explore-plan.md. The `classify-only` path is retained as a
// degraded executionMode (host without subagent-spawn AND without sequential
// capability), but the umbrella's contract is no longer "advisory only".
//
// All 4 umbrellas (plan.md, test-flow.md, consolidate.md, explore.md) now
// share the SPAWNING contract: parallel + sequential-fallback paths, plus
// the 5 brief slots and the `executionMode` literal.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS = path.join(REPO_ROOT, '.testatlas', 'commands');

// Umbrellas that DO spawn + merge sub-agent output: parallel + fallback contract.
const SPAWNING_UMBRELLAS = ['plan.md', 'test-flow.md', 'consolidate.md', 'explore.md'];
// Umbrellas with the H2 but a different runtime contract (classify-only, etc.).
// Empty after Quick 260505-hld / F-11 Option A — explore.md flipped to spawning.
// Constant kept so ALL_UMBRELLAS spread + future asymmetric umbrellas don't
// require a new shape.
const NON_SPAWNING_UMBRELLAS = [];
const ALL_UMBRELLAS = [...SPAWNING_UMBRELLAS, ...NON_SPAWNING_UMBRELLAS];

const BRIEF_SLOTS = ['objective', 'scope', 'files-to-read', 'output-format', 'exit-criteria'];

/**
 * Slice the markdown content from the first H2 whose heading text starts
 * with `h2Title` (so trailing parentheticals like
 * "(advisory, classification-only)" are tolerated) to the next H2 (or EOF).
 * Returns null if no such heading is found.
 */
function extractSection(text, h2Title) {
  const start = text.search(new RegExp(`^##\\s+${h2Title}(\\s|$)`, 'm'));
  if (start === -1) return null;
  const after = text.slice(start);
  const nextH2 = after.slice(1).search(/^##\s+/m);
  return nextH2 === -1 ? after : after.slice(0, nextH2 + 1);
}

for (const fileName of ALL_UMBRELLAS) {
  test(`${fileName} has a "## Sub-Agent Orchestration" H2 section`, async () => {
    const text = await readFile(path.join(COMMANDS, fileName), 'utf8');
    assert.match(
      text,
      /^##\s+Sub-Agent Orchestration\b/m,
      `${fileName} must contain an H2 heading starting with "## Sub-Agent Orchestration"`,
    );
  });

  test(`${fileName} orchestration block contains all 5 brief slots`, async () => {
    const text = await readFile(path.join(COMMANDS, fileName), 'utf8');
    const block = extractSection(text, 'Sub-Agent Orchestration');
    assert.ok(block, `${fileName}: could not locate "## Sub-Agent Orchestration" section`);
    const lower = block.toLowerCase();
    for (const slot of BRIEF_SLOTS) {
      assert.ok(
        lower.includes(slot),
        `${fileName} orchestration block must mention brief slot "${slot}"`,
      );
    }
  });
}

for (const fileName of SPAWNING_UMBRELLAS) {
  test(`${fileName} orchestration block documents parallel + sequential-fallback paths`, async () => {
    const text = await readFile(path.join(COMMANDS, fileName), 'utf8');
    const block = extractSection(text, 'Sub-Agent Orchestration');
    assert.ok(block, `${fileName}: could not locate "## Sub-Agent Orchestration" section`);
    assert.ok(
      block.includes('subagent-spawn'),
      `${fileName} orchestration block must reference the "subagent-spawn" capability`,
    );
    assert.ok(
      block.includes('sequential-fallback'),
      `${fileName} orchestration block must document the "sequential-fallback" path`,
    );
    assert.ok(
      block.includes('executionMode'),
      `${fileName} orchestration block must mention "executionMode"`,
    );
  });
}

// F-11 Option A: explore.md is a spawn-and-aggregate orchestrator — its
// block must declare the spawn-and-aggregate contract literally
// (spawn / parallel / aggregate / 02_product_overview.md / parallel-subagents).
// The classify-only literal still appears in the block as one of the 5
// executionMode enum values, but no longer as the umbrella's primary contract.
test(`explore.md orchestration block is spawn-and-aggregate (Quick 260505-hld / F-11 Option A)`, async () => {
  const text = await readFile(path.join(COMMANDS, 'explore.md'), 'utf8');
  const block = extractSection(text, 'Sub-Agent Orchestration');
  assert.ok(block, 'explore.md: could not locate "## Sub-Agent Orchestration" section');
  const lower = block.toLowerCase();
  for (const literal of [
    'spawn',
    'parallel',
    'aggregate',
    '02_product_overview.md',
    'parallel-subagents',
  ]) {
    assert.ok(
      lower.includes(literal.toLowerCase()),
      `explore.md orchestration block must reference "${literal}" for Option A spawn-and-aggregate contract`,
    );
  }
});
