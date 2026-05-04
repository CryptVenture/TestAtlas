// Wave 0 — Bucket #4: each of the 4 umbrella commands must contain a
// "## Sub-Agent Orchestration" H2 section. Inside that section the
// orchestration block must contain all 5 brief slots from 09-RESEARCH.md
// Pattern 1 (objective, scope, files-to-read, output-format, exit-criteria)
// AND must mention both the parallel path ("subagent-spawn") and the
// sequential-fallback path ("sequential-fallback" + "executionMode").

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMMANDS = path.join(REPO_ROOT, '.testatlas', 'commands');

const UMBRELLAS = ['explore.md', 'plan.md', 'test-flow.md', 'consolidate.md'];

const BRIEF_SLOTS = ['objective', 'scope', 'files-to-read', 'output-format', 'exit-criteria'];

/**
 * Slice the markdown content from the H2 heading matching `h2Title` (exact)
 * to the next H2 (or EOF). Returns null if the heading is not found.
 */
function extractSection(text, h2Title) {
  const start = text.search(new RegExp(`^##\\s+${h2Title}\\s*$`, 'm'));
  if (start === -1) return null;
  const after = text.slice(start);
  const nextH2 = after.slice(1).search(/^##\s+/m);
  return nextH2 === -1 ? after : after.slice(0, nextH2 + 1);
}

for (const fileName of UMBRELLAS) {
  test(`${fileName} has a "## Sub-Agent Orchestration" H2 section`, async () => {
    const text = await readFile(path.join(COMMANDS, fileName), 'utf8');
    assert.match(
      text,
      /^##\s+Sub-Agent Orchestration\s*$/m,
      `${fileName} must contain an H2 heading exactly "## Sub-Agent Orchestration"`,
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
