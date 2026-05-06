// test/scripts/generate-report-coverage.test.js
//
// Quick 260506-dyb Gap 2 — per-domain coverage detection.
//
// scripts/generate-report.js was reading r.parsed.domain (top-level field)
// for the testedDomains Set, but test-run.schema.json scenariosRun is an
// array of scenario IDs (strings) — domain info lives on the scenario
// sidecar (test-scenario.schema.json /properties/domain).
//
// Fix walks scenariosRun[] and resolves each ID against
// _testatlas/tests/scenarios/TEST-<id>.json to harvest the domain.

import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { generateReport } from '../../scripts/generate-report.js';
import { makeValidationFixture } from '../_helpers.js';

async function seedScenarioSidecar(wsDir, id, domain, type) {
  const dir = path.join(wsDir, 'tests', 'scenarios');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify(
      {
        $schema: 'https://testatlas.dev/schemas/v1/test-scenario.schema.json',
        id,
        name: id,
        domain,
        flow: 'FLOW-x-y',
        priority: 'medium',
        type,
        status: 'draft',
        userGoal: 'g',
        preconditions: [],
        testData: {},
        steps: [],
        expectedResults: [],
        evidence: [],
        issues: [],
        lastUpdatedAt: '2026-05-06T00:00:00Z',
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function seedDomain(wsDir, slug) {
  const dir = path.join(wsDir, 'domains', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'domain.json'),
    JSON.stringify(
      {
        $schema: 'https://testatlas.dev/schemas/v1/domain.schema.json',
        id: `domain-${slug}`,
        name: slug,
        purpose: 'p',
        owners: [],
        primarySurfaces: [],
        keyFlows: [],
        knownStates: [],
        flagsAndDependencies: [],
        evidence: [],
        confidence: 'low',
        lastUpdatedAt: '2026-05-06T00:00:00Z',
      },
      null,
      2,
    ),
    'utf8',
  );
}

test('Gap 2: generate-report harvests domain coverage from scenariosRun[] sidecars', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  // Two extra domains so we can prove the gaps list is correct.
  await seedDomain(fx.wsDir, 'covered-one');
  await seedDomain(fx.wsDir, 'covered-two');
  await seedDomain(fx.wsDir, 'uncovered-three');

  // Two scenario sidecars (covered-one regression + covered-two smoke).
  await seedScenarioSidecar(fx.wsDir, 'TEST-covered-one-alpha', 'domain-covered-one', 'regression');
  await seedScenarioSidecar(fx.wsDir, 'TEST-covered-two-beta', 'domain-covered-two', 'smoke');

  // One run that exercises both scenarios.
  const runsDir = path.join(fx.wsDir, 'tests', 'runs');
  await mkdir(runsDir, { recursive: true });
  await writeFile(
    path.join(runsDir, 'RUN-20260301T000000Z.json'),
    JSON.stringify(
      {
        $schema: 'https://testatlas.dev/schemas/v1/test-run.schema.json',
        id: 'RUN-20260301T000000Z',
        startedAt: '2026-03-01T00:00:00.000Z',
        endedAt: '2026-03-01T00:01:00.000Z',
        environment: 'local',
        commandsExecuted: ['/atlas:test-flow'],
        scenariosRun: ['TEST-covered-one-alpha', 'TEST-covered-two-beta'],
        passed: 2,
        failed: 0,
        blocked: 0,
        evidence: [],
        issuesCreated: [],
        flowConfidenceUpdates: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  const r = await generateReport({ cwd: fx.cwd, dryRun: true });

  // gaps must list ONLY uncovered-three (and the fixture's domain-auth which
  // has no scenario coverage in this test). It must NOT list covered-one or
  // covered-two.
  const gapsText = r.jsonReport.gaps.join('\n');
  assert.ok(
    !gapsText.includes('domain-covered-one'),
    `gaps should not list domain-covered-one: ${gapsText}`,
  );
  assert.ok(
    !gapsText.includes('domain-covered-two'),
    `gaps should not list domain-covered-two: ${gapsText}`,
  );
  assert.ok(
    gapsText.includes('domain-uncovered-three'),
    `gaps should list domain-uncovered-three: ${gapsText}`,
  );
});

test('Gap 3: generate-report Test Pyramid Health classifies via scenario sidecar type', async (t) => {
  const fx = await makeValidationFixture('_base-good');
  t.after(fx.cleanup);

  await seedDomain(fx.wsDir, 'pyr-x');
  await seedScenarioSidecar(fx.wsDir, 'TEST-pyr-x-smoke-1', 'domain-pyr-x', 'smoke');
  await seedScenarioSidecar(fx.wsDir, 'TEST-pyr-x-regression-1', 'domain-pyr-x', 'regression');
  await seedScenarioSidecar(fx.wsDir, 'TEST-pyr-x-state-1', 'domain-pyr-x', 'state');

  const runsDir = path.join(fx.wsDir, 'tests', 'runs');
  await mkdir(runsDir, { recursive: true });
  await writeFile(
    path.join(runsDir, 'RUN-20260302T000000Z.json'),
    JSON.stringify(
      {
        $schema: 'https://testatlas.dev/schemas/v1/test-run.schema.json',
        id: 'RUN-20260302T000000Z',
        startedAt: '2026-03-02T00:00:00.000Z',
        endedAt: '2026-03-02T00:01:00.000Z',
        environment: 'local',
        commandsExecuted: ['/atlas:test-flow'],
        scenariosRun: ['TEST-pyr-x-smoke-1', 'TEST-pyr-x-regression-1', 'TEST-pyr-x-state-1'],
        passed: 3,
        failed: 0,
        blocked: 0,
        evidence: [],
        issuesCreated: [],
        flowConfidenceUpdates: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  await generateReport({ cwd: fx.cwd });

  const md = await (await import('node:fs/promises')).readFile(
    path.join(fx.wsDir, 'reports', 'REPORT-latest.md'),
    'utf8',
  );

  // Must show smoke, regression, state — NOT "unknown".
  const pyramidSection = md.split('## Test Pyramid Health')[1]?.split('## ')[0] ?? '';
  assert.match(pyramidSection, /- smoke: 1/, `pyramid: ${pyramidSection}`);
  assert.match(pyramidSection, /- regression: 1/, `pyramid: ${pyramidSection}`);
  assert.match(pyramidSection, /- state: 1/, `pyramid: ${pyramidSection}`);
  assert.ok(
    !/- unknown:/.test(pyramidSection),
    `pyramid should not have unknown bucket: ${pyramidSection}`,
  );
});
