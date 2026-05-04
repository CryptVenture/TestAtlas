// Tests for Phase 1 — BOOT-01 file presence + BOOT-04 reference-shard requirement.
//
// BOOT-01: .testatlas/{bootstrap.md, default.config.json, config.schema.json,
//          VERSION, README.md} all exist and are non-empty.
// BOOT-04: .testatlas/reference/ contains severity.md, confidence.md,
//          capabilities.md per Pattern 7 of 01-RESEARCH.md.
//
// Note: bootstrap.md is authored in plan 01-02 and the config files in 01-04;
// the Test-1 assertion below only flips green once all three plans land.
// 01-01 alone makes Tests 2-8 pass.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const read = (relPath) => readFile(path.join(repoRoot, relPath), 'utf8');

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// ---- BOOT-01: file presence (phase-level) ----
test('BOOT-01: .testatlas/ contains all required files', async () => {
  const required = [
    '.testatlas/bootstrap.md',
    '.testatlas/default.config.json',
    '.testatlas/config.schema.json',
    '.testatlas/VERSION',
    '.testatlas/README.md',
  ];
  for (const rel of required) {
    const content = await read(rel);
    assert.ok(content.length > 0, `${rel} must exist and be non-empty`);
  }
});

// ---- BOOT-01: VERSION format ----
test('BOOT-01: VERSION holds a single semver line with no comments', async () => {
  const raw = await read('.testatlas/VERSION');
  // No comment markers anywhere.
  assert.doesNotMatch(raw, /(^|\n)\s*(#|\/\/|<!--)/, 'VERSION must contain no comments');
  // Single non-empty line.
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  assert.equal(lines.length, 1, 'VERSION must contain exactly one non-empty line');
  // Valid semver.
  const version = lines[0].trim();
  assert.match(
    version,
    /^\d+\.\d+\.\d+(-[\w.-]+)?$/,
    `VERSION must be a valid semver string (got "${version}")`,
  );
});

// ---- BOOT-01: suite README budget + content ----
test('BOOT-01: .testatlas/README.md is under budget and references bootstrap', async () => {
  const readme = await read('.testatlas/README.md');
  assert.match(readme, /^# /m, '.testatlas/README.md must contain an H1 heading');
  assert.ok(
    wordCount(readme) <= 200,
    `.testatlas/README.md must be ≤200 words (got ${wordCount(readme)})`,
  );
  assert.match(readme, /bootstrap\.md/, '.testatlas/README.md must link to bootstrap.md');
  assert.match(
    readme,
    /read\s+bootstrap|bootstrap[-\s]first/i,
    '.testatlas/README.md must declare the read-bootstrap-first contract',
  );
  assert.match(readme, /github\.com/, '.testatlas/README.md must link to the project repo');
});

// ---- BOOT-04: reference shard directory + three shards present ----
test('BOOT-04: .testatlas/reference/ contains severity, confidence, capabilities shards', async () => {
  for (const rel of [
    '.testatlas/reference/severity.md',
    '.testatlas/reference/confidence.md',
    '.testatlas/reference/capabilities.md',
  ]) {
    const content = await read(rel);
    assert.ok(content.length > 0, `${rel} must exist and be non-empty`);
    assert.match(content, /^# /m, `${rel} must have an H1 heading`);
  }
});

// ---- BOOT-04: read-on-demand contract — each shard begins with "When to read this" ----
test('BOOT-04: each reference shard opens with a "When to read this" line', async () => {
  for (const rel of [
    '.testatlas/reference/severity.md',
    '.testatlas/reference/confidence.md',
    '.testatlas/reference/capabilities.md',
  ]) {
    const content = await read(rel);
    const first200 = content.trim().split(/\s+/).filter(Boolean).slice(0, 200).join(' ');
    assert.match(
      first200,
      /when to read this/i,
      `${rel} must open with a "When to read this" line in the first 200 words`,
    );
  }
});

// ---- BOOT-04: severity vocabulary completeness ----
test('BOOT-04: severity.md enumerates all five severity values', async () => {
  const content = await read('.testatlas/reference/severity.md');
  for (const value of ['critical', 'high', 'medium', 'low', 'enhancement']) {
    assert.match(
      content,
      new RegExp(`\\b${value}\\b`, 'i'),
      `severity.md must reference "${value}"`,
    );
  }
});

// ---- BOOT-04: confidence vocabulary completeness ----
test('BOOT-04: confidence.md enumerates all three confidence values', async () => {
  const content = await read('.testatlas/reference/confidence.md');
  for (const value of ['confirmed', 'strong-suspect', 'needs-validation']) {
    assert.match(content, new RegExp(value, 'i'), `confidence.md must reference "${value}"`);
  }
});

// ---- BOOT-04 + BOOT-05 forward-compat: capabilities vocab completeness ----
test('BOOT-04: capabilities.md enumerates all six capabilities + tool_unavailable token', async () => {
  const content = await read('.testatlas/reference/capabilities.md');
  // Plan 09-02 (locked) extends the capability vocabulary to 6 entries by
  // adding "subagent-spawn". The reference doc need only mention each entry;
  // forward-compat assertion is `includes`, not strict-equality.
  for (const cap of ['browser', 'shell', 'web-fetch', 'MCP', 'file-write', 'subagent-spawn']) {
    // case-sensitive for MCP/web-fetch/file-write/subagent-spawn to enforce the canonical spelling
    assert.ok(
      content.includes(cap),
      `capabilities.md must include the canonical capability name "${cap}"`,
    );
  }
  assert.match(
    content,
    /tool_unavailable/,
    'capabilities.md must include the literal tool_unavailable directive (forward-compat with bootstrap §4)',
  );
});
