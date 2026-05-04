// test/install/bin-cli.test.js
//
// Plan 07-01 Task 2 — bin/testatlas.js commander v14 CLI tests.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'testatlas.js');
const INSTALL_JS = path.join(REPO_ROOT, 'install.js');

// ANSI-CSI regex (built via String.fromCharCode to satisfy Biome's
// noControlCharactersInRegex rule).
const ANSI_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[`, 'u');

// Default env layered onto every spawn — keeps captured output deterministic
// (no color escapes, ASCII-bracket symbols) so assertions are stable.
const DETERMINISTIC_ENV = { NO_COLOR: '1', NO_UNICODE: '1' };

/**
 * Run a node CLI script, capturing stdout, stderr, and exit code.
 * @param {string[]} args
 */
function runNode(scriptPath, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...DETERMINISTIC_ENV, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-bincli-'));
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  return await run(dir);
}

test('bin-cli: --version prints package.json version', async () => {
  const r = await runNode(BIN, ['--version']);
  assert.equal(r.code, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+(-[\w.-]+)?$/);
  // Read the canonical version from package.json so the test tracks
  // future bumps (Plan 07-05 flipped 0.1.0-pre → 0.1.0; Phase 8 will
  // bump again).
  const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(r.stdout.trim(), pkg.version);
});

test('bin-cli: --help lists subcommands init/update/uninstall', async () => {
  const r = await runNode(BIN, ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /\binit\b/);
  assert.match(r.stdout, /\bupdate\b/);
  assert.match(r.stdout, /\buninstall\b/);
  // Banner is rendered before the help block (Quick 260504-pjh).
  assert.match(r.stdout, /Agent-agnostic AI product testing/);
});

test('bin-cli: --help renders the ASCII banner above the subcommand list', async () => {
  // Force NO_UNICODE so banner falls back to `#` art (deterministic).
  const r = await runNode(BIN, ['--help'], { env: { NO_UNICODE: '1' } });
  assert.equal(r.code, 0);
  // ASCII art starts with at least one `#`-block letter row.
  assert.match(r.stdout, /########/);
  assert.match(r.stdout, /Agent-agnostic AI product testing/);
  // GitHub URL appears in the version line.
  assert.match(r.stdout, /github\.com\/CryptVenture\/TestAtlas/);
});

test('bin-cli: init --help shows the locked option set', async () => {
  const r = await runNode(BIN, ['init', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--all-adapters/);
  assert.match(r.stdout, /--force/);
  assert.match(r.stdout, /--no-update-check/);
  assert.match(r.stdout, /--target <dir>/);
  assert.match(r.stdout, /--dry-run/);
});

test('bin-cli: init --help lists --adapter <name> repeatable flag (Quick 260504-q4s)', async () => {
  const r = await runNode(BIN, ['init', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--adapter <name>/);
  // Examples block mentions the flag.
  assert.match(r.stdout, /--adapter cline/);
});

test('bin-cli: init --adapter cline --target <tmp> --dry-run reports only cline (Quick 260504-q4s)', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--adapter', 'cline', '--target', dir, '--dry-run']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Adapters:\s*cline/);
    assert.doesNotMatch(r.stdout, /Adapters:\s*[^,\n]*generic/);
  });
});

test('bin-cli: init --adapter unknown errors with full valid-adapter list (Quick 260504-q4s)', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--adapter', 'notreal', '--target', dir, '--dry-run']);
    assert.notEqual(r.code, 0);
    const all = `${r.stdout}\n${r.stderr}`;
    assert.match(all, /Unknown adapter 'notreal'/);
    assert.match(all, /claude-code/);
    assert.match(all, /amazon-q/);
  });
});

test('bin-cli: init --target <tmp> --dry-run does not write', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--target', dir, '--dry-run']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /dry-run/i);
    // No .testatlas/ written.
    await assert.rejects(
      () => stat(path.join(dir, '.testatlas')),
      (err) => err.code === 'ENOENT',
    );
  });
});

test('bin-cli: init --target <tmp> writes the suite tree + manifest, exits 0', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--target', dir]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    await stat(path.join(dir, '.testatlas', 'bootstrap.md'));
    await stat(path.join(dir, '.testatlas', '.install-manifest.json'));
  });
});

test('bin-cli: update --help lists --target/--force-reinstall/--dry-run/--no-update-check', async () => {
  const r = await runNode(BIN, ['update', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--target/);
  assert.match(r.stdout, /--force-reinstall/);
  assert.match(r.stdout, /--dry-run/);
  assert.match(r.stdout, /--no-update-check/);
});

test('bin-cli: update against unchanged target reports up-to-date', async () => {
  // No --latest-version → kernel infers latest=current → "already up to date".
  // We don't pass --target so it falls back to cwd; that's fine since the
  // up-to-date short-circuit returns BEFORE any disk mutation.
  const r = await runNode(BIN, ['update']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /up to date/i);
});

test('bin-cli: uninstall --help lists --target/--purge/--force-untracked/--dry-run', async () => {
  const r = await runNode(BIN, ['uninstall', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--target/);
  assert.match(r.stdout, /--purge/);
  assert.match(r.stdout, /--force-untracked/);
  assert.match(r.stdout, /--dry-run/);
});

test('bin-cli: uninstall against missing manifest exits non-zero', async (t) => {
  // No init was run on this tmp; manifest is absent.
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['uninstall', '--target', dir]);
    // Without --force-untracked, refuses (non-zero).
    assert.notEqual(r.code, 0, `expected non-zero on missing manifest; stderr=${r.stderr}`);
    assert.match(`${r.stdout}\n${r.stderr}`, /Manifest missing or invalid|--force-untracked/i);
  });
});

test('install.js (git-clone path): node install.js <tmp> writes the suite tree', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(INSTALL_JS, [dir]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    await stat(path.join(dir, '.testatlas', 'bootstrap.md'));
    await stat(path.join(dir, '.testatlas', '.install-manifest.json'));
  });
});

test('install.js: --dry-run produces no writes', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(INSTALL_JS, [dir, '--dry-run']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    await assert.rejects(
      () => stat(path.join(dir, '.testatlas')),
      (err) => err.code === 'ENOENT',
    );
  });
});

// ---- Quick 260504-pjh — polish CLI tests ----------------------------------

test('bin-cli: init --help shows Examples block with ≥2 example invocations', async () => {
  const r = await runNode(BIN, ['init', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Examples:/);
  const exampleLines = r.stdout.split('\n').filter((l) => /^\s*\$ testatlas/.test(l));
  assert.ok(
    exampleLines.length >= 2,
    `expected ≥2 example lines under init --help, got ${exampleLines.length}`,
  );
});

test('bin-cli: update --help includes Examples block with ≥2 example invocations', async () => {
  const r = await runNode(BIN, ['update', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Examples:/);
  const exampleLines = r.stdout.split('\n').filter((l) => /^\s*\$ testatlas/.test(l));
  assert.ok(
    exampleLines.length >= 2,
    `expected ≥2 example lines under update --help, got ${exampleLines.length}`,
  );
});

test('bin-cli: uninstall --help includes Examples block with ≥2 example invocations', async () => {
  const r = await runNode(BIN, ['uninstall', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Examples:/);
  const exampleLines = r.stdout.split('\n').filter((l) => /^\s*\$ testatlas/.test(l));
  assert.ok(
    exampleLines.length >= 2,
    `expected ≥2 example lines under uninstall --help, got ${exampleLines.length}`,
  );
});

test('bin-cli: NO_COLOR=1 --version emits zero ANSI escape sequences', async () => {
  const r = await runNode(BIN, ['--version'], { env: { NO_COLOR: '1' } });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stdout, ANSI_RE, `stdout: ${JSON.stringify(r.stdout)}`);
});

test('bin-cli: init --target <tmp> emits step markers and [OK] tag', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['init', '--target', dir]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    // Step markers from install-core.js step(...).
    assert.match(r.stdout, /\[1\/4\]/);
    assert.match(r.stdout, /\[4\/4\]/);
    // [OK] tag appears under NO_UNICODE=1 (forced by DETERMINISTIC_ENV).
    assert.match(r.stdout, /\[OK\]/);
    // Next-steps tip is surfaced.
    assert.match(r.stdout, /\/atlas:init/);
  });
});

// ---- Quick 260504-q4s — add-adapter subcommand tests ---------------------

test('bin-cli: add-adapter --help shows description, options, and Examples block', async () => {
  const r = await runNode(BIN, ['add-adapter', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /add-adapter/);
  assert.match(r.stdout, /--target/);
  assert.match(r.stdout, /--global/);
  assert.match(r.stdout, /--dry-run/);
  assert.match(r.stdout, /Examples:/);
  const exampleLines = r.stdout.split('\n').filter((l) => /^\s*\$ testatlas/.test(l));
  assert.ok(
    exampleLines.length >= 2,
    `expected ≥2 example lines under add-adapter --help, got ${exampleLines.length}`,
  );
});

test('bin-cli: add-adapter without names exits non-zero (missing argument)', async () => {
  const r = await runNode(BIN, ['add-adapter']);
  assert.notEqual(r.code, 0);
  // Commander v14's missing-argument error contains "missing required argument".
  assert.match(`${r.stdout}\n${r.stderr}`, /missing required argument|argument 'names'/i);
});

test('bin-cli: add-adapter against missing manifest exits non-zero with actionable error', async (t) => {
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['add-adapter', 'cline', '--target', dir]);
    assert.notEqual(r.code, 0);
    assert.match(`${r.stdout}\n${r.stderr}`, /requires an existing TestAtlas install/i);
  });
});

test('bin-cli: init then add-adapter — manifest tracks both adapters', async (t) => {
  await withTmp(t, async (dir) => {
    const init = await runNode(BIN, ['init', '--adapter', 'claude-code', '--target', dir]);
    assert.equal(init.code, 0, `init stderr: ${init.stderr}`);
    const add = await runNode(BIN, ['add-adapter', 'cline', '--target', dir]);
    assert.equal(add.code, 0, `add stderr: ${add.stderr}`);
    const manifest = JSON.parse(
      await readFile(path.join(dir, '.testatlas', '.install-manifest.json'), 'utf8'),
    );
    assert.ok(manifest.adapters.includes('claude-code'));
    assert.ok(manifest.adapters.includes('cline'));
    // Re-run is idempotent (no-op + exit 0).
    const reAdd = await runNode(BIN, ['add-adapter', 'cline', '--target', dir]);
    assert.equal(reAdd.code, 0);
    assert.match(reAdd.stdout, /already installed|nothing to do/i);
  });
});

// ---- Quick 260504-r3q — validate subcommand tests ------------------------

test('bin-cli: --help lists validate subcommand (Quick 260504-r3q)', async () => {
  const r = await runNode(BIN, ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /\bvalidate\b/);
});

test('bin-cli: validate --help shows banner + Examples + all six flags (Quick 260504-r3q)', async () => {
  const r = await runNode(BIN, ['validate', '--help']);
  assert.equal(r.code, 0, `stderr: ${r.stderr}`);
  // Banner is rendered (matches the same `Agent-agnostic` line as other
  // help blocks).
  assert.match(r.stdout, /Agent-agnostic AI product testing/);
  // All six options listed.
  assert.match(r.stdout, /--target <dir>/);
  assert.match(r.stdout, /--auto-heal/);
  assert.match(r.stdout, /--apply/);
  assert.match(r.stdout, /--json/);
  assert.match(r.stdout, /--output <file>/);
  assert.match(r.stdout, /--only <ids>/);
  // Examples block exists with at least one canonical example invocation.
  assert.match(r.stdout, /Examples:/);
  assert.match(r.stdout, /\$ testatlas validate --target \.\/my-app/);
  // ≥2 example lines (matches the convention enforced for init/update/uninstall).
  const exampleLines = r.stdout.split('\n').filter((l) => /^\s*\$ testatlas validate/.test(l));
  assert.ok(
    exampleLines.length >= 2,
    `expected ≥2 example lines under validate --help, got ${exampleLines.length}`,
  );
});

test('bin-cli: error path prints trimmed [ERR] Error: with ≤8 stderr lines', async (t) => {
  // Force a thrown error from runUninstall: missing manifest + no
  // --force-untracked → throws "Manifest missing or invalid…".
  await withTmp(t, async (dir) => {
    const r = await runNode(BIN, ['uninstall', '--target', dir]);
    assert.notEqual(r.code, 0);
    // Top-level catch stamps the message with the error symbol.
    assert.match(r.stderr, /\[ERR\] Error:/);
    // Stack should be trimmed — we cap at 3 'at' frames + 1 message line.
    const lineCount = r.stderr.trim().split('\n').length;
    assert.ok(lineCount <= 8, `expected ≤8 stderr lines, got ${lineCount}: ${r.stderr}`);
  });
});
