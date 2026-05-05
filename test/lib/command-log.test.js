// test/lib/command-log.test.js
//
// Quick 260505-wjp Task 1 (G2): RED→GREEN tests for code-backed
// appendCommandLogRow() + appendRunLogEntry() helpers.
//
// Both helpers append-only update canonical files in the workspace:
//   - appendCommandLogRow → _testatlas/10_command_log.md
//   - appendRunLogEntry   → _testatlas/history/run_log.md

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appendCommandLogRow, appendRunLogEntry } from '../../scripts/lib/command-log.js';

async function makeWs(t) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'cmdlog-'));
  const wsDir = path.join(tmp, '_testatlas');
  await mkdir(wsDir, { recursive: true });
  t.after(() => rm(tmp, { recursive: true, force: true }));
  return { tmp, wsDir };
}

const HEADERS = [
  '# 10 Command Log',
  '',
  '| Timestamp | Command | Status | Execution Mode | Evidence Ref |',
  '| --------- | ------- | ------ | -------------- | ------------ |',
  '',
].join('\n');

// ─── appendCommandLogRow ─────────────────────────────────────────────────────

test('appendCommandLogRow: appends a row to fresh 10_command_log.md (header-only)', async (t) => {
  const { wsDir } = await makeWs(t);
  await writeFile(path.join(wsDir, '10_command_log.md'), HEADERS);

  const r = await appendCommandLogRow(wsDir, {
    command: 'init',
    status: 'ok',
    timestamp: '2026-05-05T20:00:00.000Z',
  });

  assert.equal(r.wrote, true);
  const out = await readFile(path.join(wsDir, '10_command_log.md'), 'utf8');
  // Header preserved
  assert.ok(out.startsWith('# 10 Command Log'));
  // One row appended
  const rowLines = out.split('\n').filter((l) => /^\| 2026-/.test(l));
  assert.equal(rowLines.length, 1, 'exactly one timestamp row');
  assert.match(rowLines[0], /\| init \|/);
  assert.match(rowLines[0], /\| ok \|/);
});

test('appendCommandLogRow: appending twice produces 2 rows in chronological order', async (t) => {
  const { wsDir } = await makeWs(t);
  await writeFile(path.join(wsDir, '10_command_log.md'), HEADERS);

  await appendCommandLogRow(wsDir, {
    command: 'init',
    status: 'ok',
    timestamp: '2026-05-05T20:00:00.000Z',
  });
  await appendCommandLogRow(wsDir, {
    command: 'plan',
    status: 'ok',
    timestamp: '2026-05-05T20:01:00.000Z',
  });

  const out = await readFile(path.join(wsDir, '10_command_log.md'), 'utf8');
  const rows = out.split('\n').filter((l) => /^\| 2026-/.test(l));
  assert.equal(rows.length, 2, 'two appended rows');
  assert.match(rows[0], /\| init \|/);
  assert.match(rows[1], /\| plan \|/);
});

test('appendCommandLogRow: row format matches the canonical pipe-table shape', async (t) => {
  const { wsDir } = await makeWs(t);
  await writeFile(path.join(wsDir, '10_command_log.md'), HEADERS);

  await appendCommandLogRow(wsDir, {
    command: 'test-flow',
    status: 'ok',
    executionMode: 'parallel-subagents',
    evidenceRef: 'EVIDENCE-007',
    timestamp: '2026-05-05T20:00:00.000Z',
  });

  const out = await readFile(path.join(wsDir, '10_command_log.md'), 'utf8');
  const row = out.split('\n').find((l) => /^\| 2026-/.test(l));
  assert.match(
    row,
    /\| 2026-05-05T20:00:00\.000Z \| test-flow \| ok \| parallel-subagents \| EVIDENCE-007 \|/,
  );
});

test('appendCommandLogRow: idempotency — same {command,timestamp} appended twice only writes once', async (t) => {
  const { wsDir } = await makeWs(t);
  await writeFile(path.join(wsDir, '10_command_log.md'), HEADERS);

  const r1 = await appendCommandLogRow(wsDir, {
    command: 'init',
    status: 'ok',
    timestamp: '2026-05-05T20:00:00.000Z',
  });
  const r2 = await appendCommandLogRow(wsDir, {
    command: 'init',
    status: 'ok',
    timestamp: '2026-05-05T20:00:00.000Z',
  });
  assert.equal(r1.wrote, true);
  assert.equal(r2.wrote, false);
  assert.equal(r2.reason, 'duplicate');

  const out = await readFile(path.join(wsDir, '10_command_log.md'), 'utf8');
  const rows = out.split('\n').filter((l) => /^\| 2026-/.test(l));
  assert.equal(rows.length, 1, 'only one row on disk');
});

test('appendCommandLogRow: throws TESTATLAS_CANONICAL_MISSING when 10_command_log.md is absent', async (t) => {
  const { wsDir } = await makeWs(t);
  await assert.rejects(
    () =>
      appendCommandLogRow(wsDir, {
        command: 'init',
        status: 'ok',
        timestamp: '2026-05-05T20:00:00.000Z',
      }),
    (err) => err.code === 'TESTATLAS_CANONICAL_MISSING' && /10_command_log\.md/.test(err.message),
  );
});

// ─── appendRunLogEntry ───────────────────────────────────────────────────────

test('appendRunLogEntry: appends a heading-prefixed entry to fresh history/run_log.md', async (t) => {
  const { wsDir } = await makeWs(t);
  await mkdir(path.join(wsDir, 'history'), { recursive: true });
  await writeFile(path.join(wsDir, 'history', 'run_log.md'), '# History — Run Log\n');

  const r = await appendRunLogEntry(wsDir, {
    command: 'init',
    summary: 'Initialized workspace.',
    timestamp: '2026-05-05T20:00:00.000Z',
  });

  assert.equal(r.wrote, true);
  const out = await readFile(path.join(wsDir, 'history', 'run_log.md'), 'utf8');
  assert.match(out, /^## 2026-05-05T20:00:00\.000Z — init$/m);
  assert.match(out, /Initialized workspace\./);
});

test('appendRunLogEntry: appending twice produces 2 entries in order, separated by blank line', async (t) => {
  const { wsDir } = await makeWs(t);
  await mkdir(path.join(wsDir, 'history'), { recursive: true });
  await writeFile(path.join(wsDir, 'history', 'run_log.md'), '# History — Run Log\n');

  await appendRunLogEntry(wsDir, {
    command: 'init',
    summary: 'First.',
    timestamp: '2026-05-05T20:00:00.000Z',
  });
  await appendRunLogEntry(wsDir, {
    command: 'plan',
    summary: 'Second.',
    timestamp: '2026-05-05T20:01:00.000Z',
  });

  const out = await readFile(path.join(wsDir, 'history', 'run_log.md'), 'utf8');
  const headings = out.match(/^## 2026-/gm) ?? [];
  assert.equal(headings.length, 2, 'two entry headings');
  // First must precede second
  assert.ok(out.indexOf('First.') < out.indexOf('Second.'));
});

test('appendRunLogEntry: timestamp injected via opts is honored (not now())', async (t) => {
  const { wsDir } = await makeWs(t);
  await mkdir(path.join(wsDir, 'history'), { recursive: true });
  await writeFile(path.join(wsDir, 'history', 'run_log.md'), '# History — Run Log\n');

  await appendRunLogEntry(wsDir, {
    command: 'init',
    summary: 'X.',
    timestamp: '1999-01-01T00:00:00.000Z',
  });
  const out = await readFile(path.join(wsDir, 'history', 'run_log.md'), 'utf8');
  assert.match(out, /## 1999-01-01T00:00:00\.000Z — init/);
});

test('appendRunLogEntry: missing run_log.md (and history/ dir) is created via mkdir-recursive + write', async (t) => {
  const { wsDir } = await makeWs(t);
  // history/ doesn't exist yet — appendRunLogEntry must create it.
  const r = await appendRunLogEntry(wsDir, {
    command: 'init',
    summary: 'Bootstrap.',
    timestamp: '2026-05-05T20:00:00.000Z',
  });
  assert.equal(r.wrote, true);
  const out = await readFile(path.join(wsDir, 'history', 'run_log.md'), 'utf8');
  assert.match(out, /## 2026-05-05T20:00:00\.000Z — init/);
  assert.match(out, /Bootstrap\./);
});
