// Wave 0 — Bucket #4: each of the 4 umbrella commands must contain a
// "## Sub-Agent Orchestration" H2 section. Inside that section the
// orchestration block must contain all 5 brief slots from 09-RESEARCH.md
// Pattern 1 (objective, scope, files-to-read, output-format, exit-criteria).
//
// Quick 260505-ge3 / F-11 update: explore.md was reclassified as
// "advisory, classification-only" — the umbrella explore router does NOT
// spawn sub-explorers (that's the operator's or a downstream orchestrator's
// job). So:
//   - All 4 umbrellas keep the H2 + the 5 brief slots (advisory contract).
//   - explore.md uses the suffix `(advisory, classification-only)` and
//     marks `executionMode: 'classify-only'` instead of the parallel/
//     sequential-fallback pair.
//   - plan.md, test-flow.md, consolidate.md retain the
//     parallel + sequential-fallback contract — they ARE spawning
//     orchestrators that aggregate child output.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS = path.join(REPO_ROOT, '.testatlas', 'commands');

// Umbrellas that DO spawn + merge sub-agent output: parallel + fallback contract.
const SPAWNING_UMBRELLAS = ['plan.md', 'test-flow.md', 'consolidate.md'];
// Umbrellas with the H2 but a different runtime contract (classify-only, etc.).
const NON_SPAWNING_UMBRELLAS = ['explore.md'];
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

// F-11: explore.md is classify-only — its block must reference the
// `subagent-spawn` capability (so reading agents know how to chain into a
// spawning host) but uses `executionMode: 'classify-only'` instead of the
// parallel/sequential-fallback pair.
test(`explore.md orchestration block is classify-only (Quick 260505-ge3 / F-11)`, async () => {
  const text = await readFile(path.join(COMMANDS, 'explore.md'), 'utf8');
  const block = extractSection(text, 'Sub-Agent Orchestration');
  assert.ok(block, 'explore.md: could not locate "## Sub-Agent Orchestration" section');
  assert.ok(
    block.includes('classify-only'),
    'explore.md orchestration block must declare classify-only contract',
  );
  assert.ok(
    block.includes('subagent-spawn'),
    'explore.md orchestration block must still reference the "subagent-spawn" capability for downstream chaining',
  );
  assert.ok(
    block.includes('executionMode'),
    'explore.md orchestration block must mention "executionMode"',
  );
});
