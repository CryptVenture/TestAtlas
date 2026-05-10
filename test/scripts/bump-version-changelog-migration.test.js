// test/scripts/bump-version-changelog-migration.test.js
//
// Quick 260506-hqu — CHANGELOG migration: [Unreleased] → [X.Y.Z].
//
// Asserts:
//   - Non-empty [Unreleased] subsections (Added / Changed / Removed) are
//     hoisted under a new ## [X.Y.Z] - YYYY-MM-DD heading.
//   - [Unreleased] is reset to a clean stub with empty subsection scaffolds.
//   - The new [X.Y.Z] section preserves bullet lists byte-for-byte (we don't
//     reformat user content).
//   - When [Unreleased] body is empty, the new section is created with the
//     "_No notable changes since [PREV]._" placeholder.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const isWindows = process.platform === 'win32';

import {
  defaultChangelog,
  makeBumpFixture,
  makeStubBin,
  runBump,
} from './_bump-version-helpers.js';

test('CHANGELOG migration: hoists Unreleased body into new [X.Y.Z] section', {
  skip: isWindows,
}, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0', changelog: defaultChangelog() });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--skip-gates', '--no-commit', '--no-tag'], {
    pathPrepended: stubs.pathPrepended,
  });

  assert.equal(result.status, 0, `should succeed; got ${result.status}\n${result.stderr}`);

  const updated = await readFile(path.join(fx.cwd, 'CHANGELOG.md'), 'utf8');

  // New [1.0.1] section exists with today's date.
  const today = new Date().toISOString().slice(0, 10);
  assert.match(
    updated,
    new RegExp(`^## \\[1\\.0\\.1\\] - ${today}\\s*$`, 'm'),
    'expected ## [1.0.1] - YYYY-MM-DD heading',
  );

  // The new section must contain the previously-Unreleased bullets, byte-for-byte.
  assert.match(updated, /- Feature A: a new thing/);
  assert.match(updated, /- Feature B: another thing/);
  assert.match(updated, /- Internal refactor of widget X/);
  assert.match(updated, /- Deprecated Y removed/);

  // [Unreleased] block exists and is RESET (empty subsections).
  // Match scaffolded structure: ## [Unreleased]\n\n### Added\n\n### Changed\n\n### Removed
  const unreleased = updated.match(/## \[Unreleased\][\s\S]*?(?=\n## \[)/);
  assert.ok(unreleased, 'expected [Unreleased] block to remain present');
  assert.doesNotMatch(unreleased[0], /Feature A:/, '[Unreleased] should be reset (no old content)');
  assert.match(unreleased[0], /### Added/, '[Unreleased] should retain Added scaffold');
  assert.match(unreleased[0], /### Changed/, '[Unreleased] should retain Changed scaffold');
  assert.match(unreleased[0], /### Removed/, '[Unreleased] should retain Removed scaffold');

  // Original [1.0.0] section is preserved further down.
  assert.match(updated, /## \[1\.0\.0\] - 2026-05-04/);
  assert.match(updated, /First production release\./);

  // Ordering: [Unreleased] → [1.0.1] → [1.0.0]
  const idxUnreleased = updated.indexOf('## [Unreleased]');
  const idxNew = updated.indexOf('## [1.0.1]');
  const idxOld = updated.indexOf('## [1.0.0]');
  assert.ok(
    idxUnreleased < idxNew && idxNew < idxOld,
    `expected ordering Unreleased → 1.0.1 → 1.0.0; got ${idxUnreleased}, ${idxNew}, ${idxOld}`,
  );
});

test('CHANGELOG migration: empty [Unreleased] yields placeholder section', {
  skip: isWindows,
}, async (t) => {
  const empty = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '### Changed',
    '',
    '### Removed',
    '',
    '## [1.0.0] - 2026-05-04',
    '',
    'First release.',
    '',
  ].join('\n');

  const fx = await makeBumpFixture({ version: '1.0.0', changelog: empty });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--skip-gates', '--no-commit', '--no-tag'], {
    pathPrepended: stubs.pathPrepended,
  });
  assert.equal(result.status, 0, `should succeed; got ${result.status}\n${result.stderr}`);

  const updated = await readFile(path.join(fx.cwd, 'CHANGELOG.md'), 'utf8');
  // Placeholder copy must reference prior version (1.0.0).
  assert.match(
    updated,
    /No notable changes since.*1\.0\.0/,
    'expected placeholder line referencing prior version 1.0.0',
  );
});

test('CHANGELOG migration: --release --dry-run extracts notes for gh release create', {
  skip: isWindows,
}, async (t) => {
  const fx = await makeBumpFixture({ version: '1.0.0', changelog: defaultChangelog() });
  t.after(fx.cleanup);

  const stubs = await makeStubBin({ realBins: ['git'] });
  t.after(stubs.cleanup);

  const result = runBump(fx.cwd, ['--patch', '--release', '--dry-run', '--skip-gates'], {
    pathPrepended: stubs.pathPrepended,
  });
  assert.equal(result.status, 0, `dry-run should succeed; got ${result.status}\n${result.stderr}`);

  const out = `${result.stdout}\n${result.stderr}`;
  // Dry-run must surface the planned `gh release create` invocation with
  // --notes-file (NOT --generate-notes).
  assert.match(out, /gh release create v1\.0\.1/, 'expected gh release create vX.Y.Z preview');
  assert.match(out, /--notes-file/, 'expected --notes-file flag in dry-run output');
  assert.doesNotMatch(
    out,
    /--generate-notes/,
    '--generate-notes must NOT appear (we use --notes-file)',
  );
});
