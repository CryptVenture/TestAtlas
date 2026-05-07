// test/commands/shell-capability-invariant.test.js
//
// Phase 17 Plan 01 (REVIEW-T1-1, REVIEW-INV-A) — regression gate for ISSUE-006.
//
// Invariant A — shell-capability:
//   Every source command at `.testatlas/commands/**/*.md` whose body invokes a
//   `node` accelerator (regex `\bnode\s+(\.testatlas\/)?scripts\/`) MUST declare
//   `shell` in its frontmatter `capabilities` array.
//
// Why: render-kilocode.js:99-101 emits `bash: allow` only when caps include
// `shell`; capsToTools() at _shared.js:216-230 includes `Bash` in Claude Code's
// allowed-tools only when caps include `shell`. Source data drives all 18
// per-command renderers — wrong source data = wrong rendered output across
// every adapter.
//
// Test 1 (RED → GREEN): enumerate every source command, assert no shell-
// capability violations.
// Test 2: pure-function fixture test — exercise the predicate against canned
// inputs.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { listCommandFiles } from '../../scripts/lib/list-command-files.js';
import { extractFrontmatter, parseFrontmatter } from '../../scripts/lib/parse-frontmatter.js';

// Canonical regex for body-detects-node-script. Mirrors the validate-workspace
// invariant. Matches both the universal installed-target form
// (`node .testatlas/scripts/foo.js`) and the legacy suite-dogfood form
// (`node scripts/foo.js`).
const NODE_SCRIPT_RE = /\bnode\s+(\.testatlas\/)?scripts\//;

/**
 * Pure predicate: returns true when frontmatter+body together violate the
 * shell-capability invariant — body uses a node script accelerator AND
 * frontmatter `capabilities` does not declare `shell`.
 *
 * @param {{ capabilities?: string[] | string }} fm
 * @param {string} body
 * @returns {boolean}
 */
export function violatesShellCapabilityInvariant(fm, body) {
  if (!NODE_SCRIPT_RE.test(body)) return false;
  const caps = Array.isArray(fm?.capabilities) ? fm.capabilities : [];
  return !caps.includes('shell');
}

test('REVIEW-INV-A: every source command that invokes node scripts declares `shell` capability', async () => {
  const files = await listCommandFiles({ includeCategorized: true });
  assert.ok(files.length > 0, 'expected at least one command file under .testatlas/commands/');

  /** @type {Array<{ file: string, reason: string }>} */
  const violations = [];
  for (const absPath of files) {
    const text = await readFile(absPath, 'utf8');
    let fm;
    let body;
    try {
      fm = parseFrontmatter(text);
      ({ body } = extractFrontmatter(text));
    } catch (_err) {
      // A malformed frontmatter is a different defect class; CMD-04
      // catches it. Skip here so this test reports exactly one signal.
      continue;
    }
    if (violatesShellCapabilityInvariant(fm, body)) {
      const rel = path.relative(process.cwd(), absPath);
      violations.push({ file: rel, reason: 'shell-capability-missing' });
    }
  }

  // Detailed diagnostic: name every offending file in the failure message so
  // the fixer (Task 2) can act without re-running this test.
  const detail = violations.map((v) => `  - ${v.file} [${v.reason}]`).join('\n');
  assert.deepStrictEqual(
    violations,
    [],
    `shell-capability invariant violated by ${violations.length} source command(s):\n${detail}\n` +
      "Fix: add `shell` to the `capabilities` array in each file's frontmatter.",
  );
});

test('predicate fixtures — violatesShellCapabilityInvariant returns true/false correctly', () => {
  // Body invokes node script + caps lacks shell → violation.
  assert.strictEqual(
    violatesShellCapabilityInvariant(
      { capabilities: ['file-write'] },
      'Run `node .testatlas/scripts/foo.js` to do the thing.',
    ),
    true,
    'body uses .testatlas/scripts/ form without shell cap → must violate',
  );

  // Legacy form (no .testatlas/) also triggers.
  assert.strictEqual(
    violatesShellCapabilityInvariant(
      { capabilities: ['file-write'] },
      'Run `node scripts/foo.js` for the legacy suite-dogfood path.',
    ),
    true,
    'body uses scripts/ form without shell cap → must violate',
  );

  // Body uses script + caps include shell → OK.
  assert.strictEqual(
    violatesShellCapabilityInvariant(
      { capabilities: ['shell', 'file-write'] },
      'Run `node .testatlas/scripts/foo.js` here.',
    ),
    false,
    'body uses script and caps include shell → no violation',
  );

  // Body has no script invocation → OK regardless of caps.
  assert.strictEqual(
    violatesShellCapabilityInvariant({ capabilities: ['file-write'] }, 'Pure prose, no scripts.'),
    false,
    'body has no node-script invocation → no violation',
  );

  // Empty caps array.
  assert.strictEqual(
    violatesShellCapabilityInvariant({}, 'node scripts/x.js'),
    true,
    'missing capabilities key counts as violation when body uses script',
  );

  // Word-boundary respect — "anode" should NOT match "node".
  assert.strictEqual(
    violatesShellCapabilityInvariant(
      { capabilities: ['file-write'] },
      'The anode scripts/x.js word should not match.',
    ),
    false,
    '\\bnode\\s+ word boundary must reject "anode"',
  );
});

test('validate-workspace check-shell-capability — passes on the current source tree', async () => {
  const { check } = await import('../../scripts/lib/validate/check-shell-capability.js');
  // Mimic the orchestrator-supplied ctx: wsDir is `_testatlas/` under the
  // suite root; the check derives suite cwd as dirname(wsDir).
  const wsDir = path.resolve(process.cwd(), '_testatlas');
  const result = await check({ wsDir });
  assert.strictEqual(result.id, 'check-shell-capability');
  assert.strictEqual(
    result.status,
    'pass',
    `expected pass, got ${result.status} with findings: ${JSON.stringify(result.findings, null, 2)}`,
  );
  assert.deepStrictEqual(result.findings, []);
});

test('validate-workspace check-shell-capability — fails on synthetic violating fixture', async () => {
  // Fixture: temp suite root with a single command file that uses
  // `node scripts/foo.js` in body + missing shell cap. This validates that
  // the check truly reports a violation when one exists, complementing the
  // GREEN-on-real-tree assertion above.
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');

  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'testatlas-shellcap-'));
  try {
    const cmdDir = path.join(tmpRoot, '.testatlas', 'commands');
    await mkdir(cmdDir, { recursive: true });
    const violatingBody = [
      '---',
      'command: bad-cmd',
      'version: 1.0.0',
      'description: synthetic',
      'capabilities: [file-write]',
      'produces: []',
      'consumes: []',
      '---',
      '',
      '# Body',
      '',
      'Run `node scripts/foo.js` to do the thing.',
      '',
    ].join('\n');
    await writeFile(path.join(cmdDir, 'bad-cmd.md'), violatingBody, 'utf8');

    const { check } = await import('../../scripts/lib/validate/check-shell-capability.js');
    // The check derives suite cwd from dirname(wsDir), so wsDir must be
    // <tmpRoot>/_testatlas (not tmpRoot itself).
    const wsDir = path.join(tmpRoot, '_testatlas');
    await mkdir(wsDir, { recursive: true });
    const result = await check({ wsDir });

    assert.strictEqual(result.status, 'fail', 'expected fail on violating fixture');
    assert.strictEqual(result.findings.length, 1, 'expected exactly 1 violation');
    const f = result.findings[0];
    assert.strictEqual(f.code, 'TESTATLAS_SHELL_CAPABILITY_MISSING');
    assert.strictEqual(f.reason, 'shell-capability-missing');
    assert.match(f.path, /bad-cmd\.md$/);
    assert.match(f.message, /shell/);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
