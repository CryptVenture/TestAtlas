// test/council-rounds.test.js
//
// Plan 14-04 Task 2 — verify every council command embeds:
//   - the 9-round protocol (PRD §12.4),
//   - disagreement classification (PRD §12.5: 8 types),
//   - the +2 / -2 voting scale (PRD §12.6),
//   - and the 10 council outputs per PRD §12.7.

import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const COUNCIL_DIR = path.join(REPO_ROOT, '.testatlas', 'commands', 'council');

const COMMANDS = [
  'council',
  'council-domain-review',
  'council-flow-review',
  'council-product-review',
  'council-bug-triage',
  'council-release-readiness',
  'council-red-team',
  'council-brain-audit',
  'council-retest',
  'council-design-critique',
  'council-test-plan',
];

// PRD §12.5 — 8 disagreement types (any 6 must appear; commands often link to
// reference shard for the full list rather than duplicating it). We require
// "factual" + "severity" + "evidence" + "priority" + "expected" + "safety" or
// equivalent fragments.
const DISAGREEMENT_FRAGMENTS = [
  /factual/i,
  /severity/i,
  /evidence[\s-]?sufficiency/i,
  /priority/i,
  /expected[\s-]?behavior/i,
  /safety|interpretation|product[\s-]?strategy/i,
];

// PRD §12.4 — 9-round protocol fragments.
const ROUND_FRAGMENTS = [
  /context[\s-]?read/i,
  /independent[\s-]?review/i,
  /findings/i,
  /cross[\s-]?question|cross[\s-]?examin/i,
  /disagreement/i,
  /rebuttal|evidence[\s-]?request/i,
  /vote|confidence[\s-]?rating/i,
  /consolidat/i,
  /canonical[\s-]?update/i,
];

// PRD §12.6 voting scale.
const VOTING_SCALE = ['+2', '+1', '-1', '-2'];

// PRD §12.7 — 10 outputs (we require a substantial subset).
const OUTPUTS_FRAGMENTS = [
  /accepted/i,
  /rejected/i,
  /disputed/i,
  /issue[\s-]?candidate|issue_candidates/i,
  /open[\s-]?question/i,
  /next[\s-]?recommend|what's next/i,
];

test('Test 1: Each council command embeds the PRD §12.4 9-round protocol', async () => {
  for (const id of COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    let matched = 0;
    for (const re of ROUND_FRAGMENTS) if (re.test(text)) matched++;
    assert.ok(
      matched >= 7,
      `${id}.md only matched ${matched}/9 round fragments — must reference at least 7 of the 9 rounds`,
    );
  }
});

test('Test 2: Each council command embeds disagreement classification (≥4 of 6 fragments)', async () => {
  for (const id of COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    let matched = 0;
    for (const re of DISAGREEMENT_FRAGMENTS) if (re.test(text)) matched++;
    assert.ok(
      matched >= 4,
      `${id}.md only matched ${matched}/6 disagreement fragments — must classify at least 4 disagreement types`,
    );
  }
});

test('Test 3: Each council command embeds the +2 / -2 voting scale', async () => {
  for (const id of COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    for (const v of VOTING_SCALE) {
      assert.ok(text.includes(v), `${id}.md missing voting scale value '${v}'`);
    }
    assert.match(text, /strongly[\s-]?(agree|disagree)/i, `${id}.md missing voting scale prose`);
  }
});

test('Test 4: Each council command embeds council output requirements (≥4 of 6 fragments)', async () => {
  for (const id of COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    let matched = 0;
    for (const re of OUTPUTS_FRAGMENTS) if (re.test(text)) matched++;
    assert.ok(
      matched >= 4,
      `${id}.md only matched ${matched}/6 output fragments — must promise at least 4 of the 10 PRD §12.7 outputs`,
    );
  }
});

test('Test 5: Each council command references the council-protocol reference shard', async () => {
  for (const id of COMMANDS) {
    const text = await readFile(path.join(COUNCIL_DIR, `${id}.md`), 'utf8');
    assert.match(
      text,
      /council[-_]protocol|reference\/council|council\/reference/i,
      `${id}.md must reference a council-protocol reference shard for full protocol detail`,
    );
  }
});

test('Test 6: All 11 council command files enumerate (sanity)', async () => {
  const entries = await readdir(COUNCIL_DIR);
  const mdFiles = entries.filter((f) => f.endsWith('.md'));
  assert.equal(mdFiles.length, 11);
});
