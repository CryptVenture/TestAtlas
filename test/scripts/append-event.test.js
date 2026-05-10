// test/scripts/append-event.test.js
//
// Plan 14-02 Task 1 — append-event.js writes a schema-valid line to events.jsonl.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'append-event.js');

async function setupWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'tb-append-event-'));
  const brainDir = path.join(dir, '_testatlas', 'brain');
  await mkdir(brainDir, { recursive: true });
  await writeFile(path.join(brainDir, 'events.jsonl'), '');
  return { dir, brainDir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('Test 1: appendEvent writes a schema-valid line', async () => {
  const ctx = await setupWorkspace();
  try {
    const { appendEvent } = await import(pathToFileURL(SCRIPT).href);
    const r = await appendEvent({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      actor: 'agent',
      command: 'init',
      type: 'command_completed',
      summary: 'Workspace initialized.',
    });
    assert.equal(r.ok, true);
    const text = await readFile(path.join(ctx.brainDir, 'events.jsonl'), 'utf8');
    const lines = text.split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const ev = JSON.parse(lines[0]);
    assert.match(ev.id, /^EVENT-\d+$/);
    assert.equal(ev.actor, 'agent');
    assert.equal(ev.type, 'command_completed');
    assert.equal(ev.summary, 'Workspace initialized.');
    assert.equal(ev.status, 'completed');
    assert.match(ev.timestamp, /\d{4}-\d{2}-\d{2}T/);
  } finally {
    await ctx.cleanup();
  }
});

test('Test 2: appendEvent rejects invalid event.type via AJV', async () => {
  const ctx = await setupWorkspace();
  try {
    const { appendEvent } = await import(pathToFileURL(SCRIPT).href);
    await assert.rejects(
      appendEvent({
        cwd: ctx.dir,
        suiteCwd: REPO_ROOT,
        actor: 'agent',
        type: 'NOT_AN_EVENT_TYPE',
        summary: 'x',
      }),
      (e) => /TESTATLAS_INVALID|enum/i.test(`${String(e.code)} ${String(e.message)}`),
    );
  } finally {
    await ctx.cleanup();
  }
});

test('Test 3: appendEvent allocates monotonically increasing IDs', async () => {
  const ctx = await setupWorkspace();
  try {
    const { appendEvent } = await import(pathToFileURL(SCRIPT).href);
    const r1 = await appendEvent({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      actor: 'agent',
      type: 'command_started',
      summary: 'a',
    });
    const r2 = await appendEvent({
      cwd: ctx.dir,
      suiteCwd: REPO_ROOT,
      actor: 'agent',
      type: 'command_completed',
      summary: 'b',
    });
    const n1 = parseInt(r1.event.id.replace(/^EVENT-/, ''), 10);
    const n2 = parseInt(r2.event.id.replace(/^EVENT-/, ''), 10);
    assert.ok(n2 > n1, `expected increasing IDs, got ${n1} vs ${n2}`);
  } finally {
    await ctx.cleanup();
  }
});
