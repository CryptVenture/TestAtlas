// test/update/update-safety.test.js
//
// Phase 18-01 / ISSUE-011 — runUpdate() must enforce the destructive-fs
// capability gate at function entry. Two cases:
//
//   A. safeMode:true + allowDestructiveActions:false → throws CAPABILITY_DENIED
//      and zero FS mutation under <target>/.testatlas/.
//   B. safeMode:false + allowDestructiveActions:true → proceeds past the gate.
//      Subsequent failure (no real install / no network) is acceptable; the
//      assertion is that the error code is NOT CAPABILITY_DENIED.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runUpdate } from '../../scripts/lib/update-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = path.resolve(__dirname, '..', '..');

// Seed `<tmp>/.testatlas/{default.config.json,config.schema.json}` and an
// optional `<tmp>/testatlas.config.json` override so loadConfig succeeds.
async function seedConfig(tmp, override) {
  const dst = path.join(tmp, '.testatlas');
  await mkdir(dst, { recursive: true });
  await cp(
    path.join(SUITE_ROOT, '.testatlas', 'default.config.json'),
    path.join(dst, 'default.config.json'),
  );
  await cp(
    path.join(SUITE_ROOT, '.testatlas', 'config.schema.json'),
    path.join(dst, 'config.schema.json'),
  );
  if (override) {
    await writeFile(path.join(tmp, 'testatlas.config.json'), JSON.stringify(override, null, 2));
  }
}

async function snapshot(root) {
  const out = new Map();
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const buf = await readFile(full);
        const st = await stat(full);
        const sha = createHash('sha256').update(buf).digest('hex');
        out.set(path.relative(root, full), `${sha}:${st.size}`);
      }
    }
  }
  await walk(root);
  return out;
}

test('runUpdate halts under safeMode:true with no FS mutation under .testatlas', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'upd-deny-'));
  try {
    await seedConfig(tmp, { safeMode: true, allowDestructiveActions: false });

    const pre = await snapshot(path.join(tmp, '.testatlas'));

    await assert.rejects(
      runUpdate({
        target: tmp,
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        noUpdateCheck: true,
        logger: () => {},
      }),
      (e) => e.code === 'CAPABILITY_DENIED' && e.action === 'destructive-fs',
      'runUpdate must throw CAPABILITY_DENIED with action=destructive-fs under safeMode',
    );

    const post = await snapshot(path.join(tmp, '.testatlas'));
    assert.deepStrictEqual(post, pre, '.testatlas/ must be byte-identical after denied call');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runUpdate proceeds past gate under permissive config', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'upd-allow-'));
  try {
    await seedConfig(tmp, { safeMode: false, allowDestructiveActions: true });

    // We don't expect a clean run (no real install / no network mocking here),
    // but the gate must NOT be the failure mode.
    let err;
    try {
      await runUpdate({
        target: tmp,
        currentVersion: '1.0.0',
        latestVersion: '1.0.0', // up-to-date short-circuit avoids network
        noUpdateCheck: true,
        logger: () => {},
      });
    } catch (e) {
      err = e;
    }
    if (err) {
      assert.notEqual(
        err.code,
        'CAPABILITY_DENIED',
        `unexpected CAPABILITY_DENIED under permissive config: ${err.message}`,
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// v2.0.1 fix — explicit user-CLI consent bypasses the gate.
//
// Pre-fix (v2.0.0): `npx @webventures/testatlas update --force-reinstall`
// against a fresh install hit `Capability denied (destructive-fs): safeMode
// is enabled` because the default config seeds `safeMode: true` and the
// gate denied the user's explicit CLI invocation. v2.0.1 adds an
// `opts.bypassSafetyGate` flag that `bin/testatlas.js` passes when the
// user invoked the CLI — explicit consent. Programmatic/sub-agent callers
// do NOT pass the flag and remain config-gated (Test A above pins that).
test('runUpdate with bypassSafetyGate:true skips gate even under safeMode:true (CLI explicit-consent path)', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'upd-bypass-'));
  try {
    await seedConfig(tmp, { safeMode: true, allowDestructiveActions: false });

    let err;
    try {
      await runUpdate({
        target: tmp,
        currentVersion: '1.0.0',
        latestVersion: '1.0.0', // up-to-date short-circuit avoids network
        noUpdateCheck: true,
        logger: () => {},
        bypassSafetyGate: true, // v2.0.1: CLI = explicit user consent
      });
    } catch (e) {
      err = e;
    }
    if (err) {
      assert.notEqual(
        err.code,
        'CAPABILITY_DENIED',
        `bypassSafetyGate:true must skip the gate; unexpected CAPABILITY_DENIED: ${err.message}`,
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runUpdate WITHOUT bypassSafetyGate still denies under safeMode:true (sub-agent path stays gated)', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'upd-still-gated-'));
  try {
    await seedConfig(tmp, { safeMode: true, allowDestructiveActions: false });

    await assert.rejects(
      runUpdate({
        target: tmp,
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        noUpdateCheck: true,
        logger: () => {},
        // NB: bypassSafetyGate intentionally omitted — programmatic caller.
      }),
      (e) => e.code === 'CAPABILITY_DENIED' && e.action === 'destructive-fs',
      'programmatic call without bypassSafetyGate MUST still throw CAPABILITY_DENIED',
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
