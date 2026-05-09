// test/00-overview-domain-count.test.js
//
// Phase 23 / Plan 23-01 / Wave 0 (TDD red-bar) — DEC-005 regression test.
//
// Pins the contract that the producer for 00_overview.md GENERATED markers
// (confirmed: `scripts/sync-status.js`, the same module already driving
// `current-status`/`latest-report-pointer`/`last-updated` blocks per
// `_testatlas/00_overview.md` lines 45-69) emits a fourth GENERATED block
// `section="domain-count"` whose body reflects the on-disk domain count
// (and/or `_testatlas/brain/state.json#counts.domains` when present —
// Wave 1 may freely choose either source-of-truth).
//
// Today the producer does not emit a `domain-count` block — the placeholder
// inside the marker stays untouched. Tests 1, 2, 4 fail RED on the missing
// "N domains discovered" substring.
//
// Reference: 23-RESEARCH.md lines 298-314 + 691-701 (DEC-005 fix recipe).

import { strict as assert } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { syncStatus } from '../scripts/sync-status.js';
import { makeValidationFixture } from './_helpers.js';

const OVERVIEW_TEMPLATE_WITH_DOMAIN_COUNT = `# 00 Overview

## Application Summary

(stub)

## Core Domains

<!-- TESTATLAS:GENERATED:START section="domain-count" -->
(placeholder)
<!-- TESTATLAS:GENERATED:END section="domain-count" -->

## Current Testing Status

<!-- TESTATLAS:GENERATED:START section="current-status" -->
- Status: initialized
- Domains mapped: 1
<!-- TESTATLAS:GENERATED:END section="current-status" -->

## Latest Report Pointer

<!-- TESTATLAS:GENERATED:START section="latest-report-pointer" -->
- Latest report: (none)
- Generated at: (none)
<!-- TESTATLAS:GENERATED:END section="latest-report-pointer" -->

## Last Updated Timestamp

<!-- TESTATLAS:GENERATED:START section="last-updated" -->
2026-05-01T00:00:00Z
<!-- TESTATLAS:GENERATED:END section="last-updated" -->
`;

async function injectDomainCountMarker(wsDir) {
  const overviewPath = path.join(wsDir, '00_overview.md');
  await writeFile(overviewPath, OVERVIEW_TEMPLATE_WITH_DOMAIN_COUNT, 'utf8');
}

async function makeNDomains(wsDir, n) {
  for (let i = 0; i < n; i++) {
    const dir = path.join(wsDir, 'domains', `dom-${i}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.md'), `# Domain ${i}\n`, 'utf8');
  }
}

async function writeBrainState(wsDir, domainsCount) {
  const brainDir = path.join(wsDir, 'brain');
  await mkdir(brainDir, { recursive: true });
  const state = {
    schema_version: '2.0.0',
    counts: { domains: domainsCount, council_sessions: 0, evidence_artifacts: 0 },
    project: { name: 'fixture', primary_stack: 'node' },
    confidence: { overall: 'unknown', highest_risk_domains: [], stale_domains: [] },
    next_recommended_commands: [],
    status: { phase: 'test', last_updated: '2026-05-09T00:00:00Z' },
  };
  await writeFile(path.join(brainDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
}

test('Test 1: domain-count GENERATED block populated with "N domains discovered"', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Fixture seeds 1 `domains/auth/` directory; add 16 more for total 17.
  await makeNDomains(fx.wsDir, 16);
  await writeBrainState(fx.wsDir, 17);
  await injectDomainCountMarker(fx.wsDir);

  await syncStatus({ cwd: fx.cwd });

  const text = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  assert.match(
    text,
    /<!-- TESTATLAS:GENERATED:START section="domain-count" -->[\s\S]*?17 domains/,
    'expected "17 domains" inside the domain-count GENERATED block',
  );
});

test('Test 2: count syncs live (different fixture → different number)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Seed 41 additional domain dirs (1 baseline + 41 = 42).
  await makeNDomains(fx.wsDir, 41);
  await writeBrainState(fx.wsDir, 42);
  await injectDomainCountMarker(fx.wsDir);

  await syncStatus({ cwd: fx.cwd });

  const text = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  assert.match(
    text,
    /<!-- TESTATLAS:GENERATED:START section="domain-count" -->[\s\S]*?42 domains/,
    'expected live-synced count of 42 domains in domain-count block',
  );
  assert.doesNotMatch(
    text,
    /<!-- TESTATLAS:GENERATED:START section="domain-count" -->[\s\S]*?17 domains discovered/,
    'must not echo the pre-baked 17 from another scenario',
  );
});

test('Test 3: idempotency — re-running producer twice produces byte-identical output', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await makeNDomains(fx.wsDir, 4);
  await writeBrainState(fx.wsDir, 5);
  await injectDomainCountMarker(fx.wsDir);

  await syncStatus({ cwd: fx.cwd });
  const first = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  await syncStatus({ cwd: fx.cwd });
  const second = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');

  assert.equal(second, first, 'second producer run must be byte-identical to first');
});

test('Test 4: existing GENERATED blocks preserved (current-status + latest-report + last-updated)', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await makeNDomains(fx.wsDir, 2);
  await writeBrainState(fx.wsDir, 3);
  await injectDomainCountMarker(fx.wsDir);

  await syncStatus({ cwd: fx.cwd });

  const text = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  const startCount = (text.match(/<!-- TESTATLAS:GENERATED:START/g) || []).length;
  assert.equal(
    startCount,
    4,
    `expected 4 GENERATED:START markers (domain-count + current-status + latest-report-pointer + last-updated); got ${startCount}`,
  );
  // Verify each section header still appears
  assert.match(text, /section="domain-count"/);
  assert.match(text, /section="current-status"/);
  assert.match(text, /section="latest-report-pointer"/);
  assert.match(text, /section="last-updated"/);
});

test('Test 5: missing brain/state.json — block still rendered without crash', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Do NOT call writeBrainState — leave state.json absent.
  await injectDomainCountMarker(fx.wsDir);

  // Producer must not throw even if state.json is absent (graceful degrade).
  await syncStatus({ cwd: fx.cwd });

  const text = await readFile(path.join(fx.wsDir, '00_overview.md'), 'utf8');
  assert.match(
    text,
    /<!-- TESTATLAS:GENERATED:START section="domain-count" -->/,
    'block markers preserved even when state.json absent',
  );
  // Block must NOT still contain the unrendered "(placeholder)" fixture seed —
  // either the fallback "0 domains" / live-counted value should fill it.
  const block = text.match(
    /<!-- TESTATLAS:GENERATED:START section="domain-count" -->([\s\S]*?)<!-- TESTATLAS:GENERATED:END section="domain-count" -->/,
  );
  assert.ok(block, 'block extracted');
  assert.doesNotMatch(
    block[1],
    /\(placeholder\)/,
    'producer must rewrite the placeholder, not leave it',
  );
});
