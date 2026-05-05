// scripts/lib/command-log.js
//
// Quick 260505-wjp Task 1 (G2): Code-backed regenerators for the two
// canonical "log" files updated after every TestAtlas command run.
//
//   appendCommandLogRow(wsDir, {command, status, executionMode?, evidenceRef?, timestamp?})
//     → appends a pipe-table row to `_testatlas/10_command_log.md`
//
//   appendRunLogEntry(wsDir, {command, summary, timestamp?})
//     → appends a heading-prefixed paragraph to `_testatlas/history/run_log.md`
//
// Both helpers are append-only (never rewrite preserved prose), use
// atomic-write for safety, and accept a `timestamp` injection so callers and
// tests can run deterministically. Idempotency: appendCommandLogRow short-
// circuits when the EXACT row string already exists on disk.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './atomic-write.js';
import { now } from './determinism.js';

const COMMAND_LOG_FILE = '10_command_log.md';
const RUN_LOG_FILE = path.join('history', 'run_log.md');

/**
 * Append a single pipe-table row to `_testatlas/10_command_log.md`.
 *
 * Row shape (matches command-result.schema.json's minimal projection):
 *   `| <ISO> | <command> | <status> | <executionMode|-> | <evidenceRef|-> |`
 *
 * Idempotency: if the EXACT computed row already appears in the file
 * (line-equal), returns `{wrote:false, reason:'duplicate'}` without touching
 * the file. This protects against re-emission when a caller retries.
 *
 * @param {string} wsDir Absolute workspace directory (where `10_command_log.md` lives).
 * @param {{command: string, status: string, executionMode?: string, evidenceRef?: string, timestamp?: string}} fields
 * @param {{atomicWrite?: typeof atomicWrite, now?: () => string}} [_inject] Test-only DI.
 * @returns {Promise<{wrote: boolean, row?: string, path: string, reason?: string}>}
 * @throws {Error} `TESTATLAS_CANONICAL_MISSING` when `10_command_log.md` is absent.
 */
export async function appendCommandLogRow(wsDir, fields, _inject = {}) {
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _now = _inject.now ?? now;

  const targetPath = path.join(wsDir, COMMAND_LOG_FILE);
  let current;
  try {
    current = await readFile(targetPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(
        `command-log: ${COMMAND_LOG_FILE} not found at ${targetPath} — run /atlas:init to bootstrap the workspace.`,
      );
      e.code = 'TESTATLAS_CANONICAL_MISSING';
      throw e;
    }
    throw err;
  }

  const ts = fields.timestamp ?? _now();
  const command = fields.command;
  const status = fields.status;
  const executionMode = fields.executionMode ?? '-';
  const evidenceRef = fields.evidenceRef ?? '-';
  const row = `| ${ts} | ${command} | ${status} | ${executionMode} | ${evidenceRef} |`;

  // Idempotency: line-exact duplicate detection.
  const lines = current.split('\n');
  if (lines.includes(row)) {
    return { wrote: false, reason: 'duplicate', path: targetPath };
  }

  // Preserve trailing-newline policy: ensure exactly one trailing '\n'
  // before appending, and exactly one after the new row.
  const trimmed = current.replace(/\n*$/, '\n');
  const next = `${trimmed}${row}\n`;
  await _atomicWrite(targetPath, next);
  return { wrote: true, row, path: targetPath };
}

/**
 * Append a heading-prefixed entry to `_testatlas/history/run_log.md`.
 *
 * Entry shape:
 *   ```
 *   ## <ISO> — <command>
 *
 *   <summary>
 *   ```
 *
 * Creates `history/` recursively when missing, and creates the run_log.md
 * file when missing. Always atomic-write.
 *
 * @param {string} wsDir Absolute workspace directory.
 * @param {{command: string, summary: string, timestamp?: string}} fields
 * @param {{atomicWrite?: typeof atomicWrite, now?: () => string}} [_inject] Test-only DI.
 * @returns {Promise<{wrote: boolean, entry: string, path: string}>}
 */
export async function appendRunLogEntry(wsDir, fields, _inject = {}) {
  const _atomicWrite = _inject.atomicWrite ?? atomicWrite;
  const _now = _inject.now ?? now;

  const targetPath = path.join(wsDir, RUN_LOG_FILE);
  await mkdir(path.dirname(targetPath), { recursive: true });

  let current = '';
  try {
    current = await readFile(targetPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const ts = fields.timestamp ?? _now();
  const heading = `## ${ts} — ${fields.command}`;
  const entry = `${heading}\n\n${fields.summary}\n`;

  // Normalize: ensure exactly one trailing '\n' on existing content, then
  // separate from the new entry with a single blank line. If file is empty,
  // start fresh.
  let next;
  if (!current.length) {
    next = `${entry}`;
  } else {
    const trimmed = current.replace(/\n*$/, '\n');
    next = `${trimmed}\n${entry}`;
  }
  await _atomicWrite(targetPath, next);
  return { wrote: true, entry, path: targetPath };
}
