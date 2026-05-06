// test/agentic/triage-command-preferred-path.test.js
//
// Quick 260506-esm: pin .testatlas/commands/triage.md to advertise the
// triage.js accelerator under "Required Actions" item 1 ("Preferred path
// (if `shell` is available):"), mirroring the create-issue / generate-report
// pattern. Drift here means agents fall back to hand-rolled triage which is
// non-idempotent and not AJV-validated.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const TRIAGE_CMD_PATH = path.join(REPO_ROOT, '.testatlas', 'commands', 'triage.md');

test('triage.md: Required Actions item 1 advertises the triage.js Preferred path', async () => {
  const text = await readFile(TRIAGE_CMD_PATH, 'utf8');
  // Required Actions section exists.
  assert.match(text, /## Required Actions/);
  // Item 1 is the Preferred path call.
  assert.match(
    text,
    /1\.\s+\*\*Preferred path \(if `shell` is available\):\*\*/,
    '"Required Actions" item 1 must lead with the Preferred-path advert',
  );
  // The script path is referenced.
  assert.match(text, /node\s+\.testatlas\/scripts\/triage\.js/);
});

test('triage.md: Preferred path mentions the schema-validation contract', async () => {
  const text = await readFile(TRIAGE_CMD_PATH, 'utf8');
  // The advertised line should claim AJV-validates against issue.schema.json
  // so agents understand they can skip the manual validate step.
  assert.match(text, /AJV[-\s]?validates?/i);
  assert.match(text, /issue\.schema\.json/);
});

test('triage.md: Preferred path notes idempotency / dry-run support', async () => {
  const text = await readFile(TRIAGE_CMD_PATH, 'utf8');
  assert.match(text, /idempotent/i);
  assert.match(text, /--dry-run/);
});

test('triage.md: Preferred path advertises --severity-override flag', async () => {
  const text = await readFile(TRIAGE_CMD_PATH, 'utf8');
  assert.match(text, /--severity-override/);
});
