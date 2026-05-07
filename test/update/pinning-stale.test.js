// test/update/pinning-stale.test.js
//
// Plan 07-04 Task 2 — integration: runUpdate respects pinnedVersion (in-range
// short-circuits; stale-pin emits warning; --force-reinstall overrides).
//
// Pattern: tarball + update-check via _testHooks; capture stderr via
// process.stderr.write override.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as tarball from '../../scripts/lib/tarball.js';
import * as updateCheck from '../../scripts/lib/update-check.js';
import { runUpdate } from '../../scripts/lib/update-core.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isoDaysAgo = (n) => new Date(Date.now() - n * MS_PER_DAY).toISOString();

async function setupTarget(opts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-pin-stale-'));
  const suite = path.join(dir, '.testatlas');
  await mkdir(suite, { recursive: true });
  await mkdir(path.join(dir, '_testatlas'), { recursive: true });
  // Minimal manifest so update-core doesn't choke.
  await writeFile(
    path.join(suite, '.install-manifest.json'),
    JSON.stringify({ files: [] }, null, 2),
  );
  // Default config (read by loadConfig).
  const defaults = {
    $schema: '../../.testatlas/config.schema.json',
    suiteName: 'TestAtlas',
    workspaceDir: './_testatlas',
    instructionDir: './.testatlas',
    defaultEnvironment: 'local',
    // Phase 18-01 / ISSUE-011: permissive for runUpdate gate. Override-friendly.
    safeMode: false,
    allowDestructiveActions: true,
    allowProductionTesting: false,
    evidence: {
      screenshots: true,
      videos: false,
      network: true,
      console: true,
      logs: true,
      api: true,
      db: false,
    },
    explorers: {
      ui: true,
      cli: true,
      codebase: true,
      api: true,
      docs: true,
      runtime: true,
      data: true,
      integrations: true,
      accessibility: true,
      performance: true,
    },
    qualityBars: {
      requireIssueEvidence: true,
      requireFlowConfidence: true,
      requireStatusUpdateAfterCommand: true,
      requireArtifactIndexUpdate: true,
    },
    adapters: { claudeCode: true, openCode: true, kiloCode: true, generic: true },
    pinnedVersion: null,
    disableUpdateCheck: false,
    updateCheckTtlHours: 24,
    pinnedSince: null,
    pinAlertThresholdDays: 90,
    ...opts.configOverrides,
  };
  await writeFile(path.join(suite, 'default.config.json'), JSON.stringify(defaults, null, 2));
  // Copy the real schema so AJV validation succeeds.
  const schemaSrc = path.resolve(import.meta.dirname, '../../.testatlas/config.schema.json');
  const { readFile } = await import('node:fs/promises');
  const schemaText = await readFile(schemaSrc, 'utf8');
  await writeFile(path.join(suite, 'config.schema.json'), schemaText);
  return dir;
}

function captureStderr() {
  const lines = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ..._rest) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  return { lines, restore: () => (process.stderr.write = orig) };
}

function captureLogger() {
  const lines = [];
  return {
    lines,
    logger: (msg) => lines.push(msg),
  };
}

describe('runUpdate — pinning integration', () => {
  let target;
  let cap;

  beforeEach(async () => {
    cap = captureStderr();
  });

  afterEach(async () => {
    cap?.restore();
    delete updateCheck._testFetchOverride;
    delete tarball._testHooks.downloadTarball;
    delete tarball._testHooks.verifyChecksum;
    delete tarball._testHooks.extractTarball;
    if (target) await rm(target, { recursive: true, force: true });
    target = null;
  });

  it('in-range pin: no stale warning; update flow proceeds normally', async () => {
    target = await setupTarget({
      configOverrides: {
        pinnedVersion: '1.x',
        pinnedSince: isoDaysAgo(7),
      },
    });

    // Stub fetch: latest is 1.5.0 (in range of 1.x). Current is also 1.5.0
    // so update is up-to-date — proves the pin path didn't short-circuit.
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v1.5.0' }),
    });

    const log = captureLogger();
    try {
      const result = await runUpdate({
        target,
        currentVersion: '1.5.0',
        logger: log.logger,
      });
      // In-range pin → not 'pinned-skip'. Same version → 'up-to-date'.
      assert.equal(result.status, 'up-to-date');
      assert.equal(result.pin?.satisfied, true);
      const stderrText = cap.lines.join('');
      assert.doesNotMatch(stderrText, /Pinned to/i);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('stale pin: emits stderr warning AND skips update (exit 0 path)', async () => {
    target = await setupTarget({
      configOverrides: {
        pinnedVersion: '1.x',
        pinnedSince: isoDaysAgo(120),
      },
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v2.0.0' }),
    });

    const log = captureLogger();
    try {
      const result = await runUpdate({
        target,
        currentVersion: '1.0.0',
        logger: log.logger,
      });
      assert.equal(result.status, 'pinned-skip');
      const stderrText = cap.lines.join('');
      // Quick 260504-pjh: stderr warning is now routed through colors.warning().
      // The line prefix is the warn symbol (`⚠` or `[!]` under NO_UNICODE).
      assert.match(stderrText, /(⚠|\[!\])/);
      assert.match(stderrText, /Pinned to 1\.x for \d+ days/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('disableUpdateCheck:true config skips fetch entirely (up-to-date)', async () => {
    target = await setupTarget({
      configOverrides: {
        disableUpdateCheck: true,
      },
    });

    let fetchCalled = false;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('should not be called');
    };

    const log = captureLogger();
    try {
      const result = await runUpdate({
        target,
        currentVersion: '1.0.0',
        logger: log.logger,
      });
      assert.equal(result.status, 'up-to-date');
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('--no-update-check (noUpdateCheck:true) suppresses the fetch', async () => {
    target = await setupTarget();

    let fetchCalled = false;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('should not be called');
    };

    const log = captureLogger();
    try {
      const result = await runUpdate({
        target,
        currentVersion: '1.0.0',
        noUpdateCheck: true,
        logger: log.logger,
      });
      assert.equal(result.status, 'up-to-date');
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
