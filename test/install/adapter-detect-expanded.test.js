// test/install/adapter-detect-expanded.test.js
//
// Quick 260504-q4s Task 1. Coverage for the expanded SIGNALS table — every
// adapter declared in adapter-capabilities.json (except `generic`, which is
// always appended) has at least one detection signal that detectAdapters()
// recognizes.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { detectAdapters, SIGNALS } from '../../scripts/lib/adapter-detect.js';

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-detect-expanded-'));
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

/**
 * Plant the FIRST signal path for an adapter under `dir`. Mirrors the canonical
 * shape: trailing-slash → directory; otherwise file.
 */
async function plantFirstSignal(dir, signalPath) {
  const isDir = signalPath.endsWith('/');
  const target = path.join(dir, signalPath.replace(/\/$/, ''));
  if (isDir) {
    await mkdir(target, { recursive: true });
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '');
  }
}

// The 11 newly-supported adapters from adapter-capabilities.json (kilocode is
// already covered by the existing SIGNALS table; all-18 is enforced by the
// "every capability adapter has a signal" test below).
const NEW_ADAPTERS = [
  'amazon-q',
  'cline',
  'codex',
  'continue-dev',
  'gemini-cli',
  'github-copilot',
  'kiro',
  'roo-code',
  'sourcegraph-amp',
  'windsurf',
  'zed',
];

for (const adapter of NEW_ADAPTERS) {
  test(`adapter-detect: ${adapter} — first signal path triggers detection`, async (t) => {
    await withTmp(t, async (dir) => {
      const entry = SIGNALS.find((s) => s.adapter === adapter);
      assert.ok(entry, `SIGNALS must contain an entry for ${adapter}`);
      await plantFirstSignal(dir, entry.paths[0]);
      const matched = await detectAdapters(dir);
      assert.ok(matched.includes(adapter), `expected ${adapter} in ${matched.join(',')}`);
      assert.equal(matched[matched.length - 1], 'generic', 'generic always last');
    });
  });
}

test('adapter-detect: multi-signal — cursor + windsurf + zed all detected in canonical SIGNALS order', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
    await mkdir(path.join(dir, '.windsurf'), { recursive: true });
    await mkdir(path.join(dir, '.zed'), { recursive: true });
    const matched = await detectAdapters(dir);
    // Canonical order = SIGNALS table order; cursor (early entry) before
    // windsurf/zed (alphabetically appended at the end), generic last.
    const cursorIdx = matched.indexOf('cursor');
    const windsurfIdx = matched.indexOf('windsurf');
    const zedIdx = matched.indexOf('zed');
    const genericIdx = matched.indexOf('generic');
    assert.ok(cursorIdx >= 0 && windsurfIdx >= 0 && zedIdx >= 0);
    assert.ok(cursorIdx < windsurfIdx, 'cursor before windsurf in canonical order');
    assert.ok(cursorIdx < zedIdx, 'cursor before zed');
    assert.equal(genericIdx, matched.length - 1, 'generic always last');
  });
});

test('adapter-detect: empty target → only generic', async (t) => {
  await withTmp(t, async (dir) => {
    const matched = await detectAdapters(dir);
    assert.deepStrictEqual(matched, ['generic']);
  });
});

test('adapter-detect: kilocode — both .kilo/ and .kilocode/ deduped to a single entry', async (t) => {
  await withTmp(t, async (dir) => {
    await mkdir(path.join(dir, '.kilo'), { recursive: true });
    await mkdir(path.join(dir, '.kilocode'), { recursive: true });
    const matched = await detectAdapters(dir);
    const kiloHits = matched.filter((n) => n === 'kilocode').length;
    assert.equal(kiloHits, 1, `kilocode must appear exactly once; got ${matched.join(',')}`);
  });
});

test('adapter-detect: SIGNALS covers every non-generic adapter from adapter-capabilities.json', async () => {
  // Locked invariant — keeps adapter-detect.js honest as new adapters land.
  const capsPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    '..',
    '.testatlas',
    'adapters',
    'adapter-capabilities.json',
  );
  const caps = JSON.parse(await (await import('node:fs/promises')).readFile(capsPath, 'utf8'));
  const declared = caps.adapters.map((a) => a.name).filter((n) => n !== 'generic');
  const signaled = SIGNALS.map((s) => s.adapter);
  for (const name of declared) {
    assert.ok(
      signaled.includes(name),
      `adapter '${name}' is declared in adapter-capabilities.json but has no SIGNALS entry`,
    );
  }
});
