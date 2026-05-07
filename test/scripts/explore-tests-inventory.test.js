// test/scripts/explore-tests-inventory.test.js
//
// Regression suite for `scripts/explore-tests.js` — the deterministic
// runner-detection + test-inventory accelerator backing
// `/atlas:explore-tests`. Closes ISSUE-003 follow-up: Phase 17 mistakenly
// CLOSED ISSUE-003 by removing the council-release-readiness reference;
// this suite reinstates the script as a real accelerator.
//
// Coverage:
//   1. detectRunners — Jest, Vitest, Mocha, node:test, Pytest, Cargo, RSpec, Go.
//   2. inventoryTests — file pattern coverage + skip-dir discipline.
//   3. categorize — unit / integration / e2e / contract / performance / smoke buckets.
//   4. inferRunner — path-based runner attribution.
//   5. buildTestsSlice — composed output shape + summary correctness.
//   6. buildAppMap — preserves non-tests slices, replaces tests slice.
//   7. Real-repo invocation — runs against the suite's own test/ tree.

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/explore-tests.js');

async function loadScript() {
  try {
    return await import(`file://${SCRIPT_PATH}`);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      assert.fail('scripts/explore-tests.js missing — REVIEW-T3-1 follow-up must create it');
    }
    throw err;
  }
}

async function makeFixture(layout) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tatlas-tests-'));
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
  return dir;
}

test('detectRunners: jest + vitest + node:test from package.json', async (t) => {
  const { detectRunners } = await loadScript();
  const dir = await makeFixture({
    'package.json': JSON.stringify({
      devDependencies: { jest: '^29.0.0', vitest: '^1.0.0' },
      scripts: { test: 'node --test test/**/*.test.js' },
    }),
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runners = await detectRunners({ rootDir: dir });
  const names = runners.map((r) => r.name).sort();
  assert.deepEqual(names, ['jest', 'node-test', 'vitest']);
  const jest = runners.find((r) => r.name === 'jest');
  assert.equal(jest.configFile, 'package.json');
  assert.equal(jest.version, '^29.0.0');
});

test('detectRunners: pytest from pyproject.toml + go-test from go.mod + rspec from Gemfile + cargo-test', async (t) => {
  const { detectRunners } = await loadScript();
  const dir = await makeFixture({
    'pyproject.toml': '[tool.pytest.ini_options]\nminversion = "7.0"\n',
    'go.mod': 'module example.com/foo\ngo 1.22\n',
    Gemfile: 'source "https://rubygems.org"\ngem "rspec", "~> 3.0"\n',
    'Cargo.toml': '[package]\nname = "x"\n[dev-dependencies]\nproptest = "1"\n',
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runners = await detectRunners({ rootDir: dir });
  const names = runners.map((r) => r.name).sort();
  assert.deepEqual(names, ['cargo-test', 'go-test', 'pytest', 'rspec']);
});

test('detectRunners: empty repo emits empty array (no exception)', async (t) => {
  const { detectRunners } = await loadScript();
  const dir = await makeFixture({ 'README.md': '# empty\n' });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runners = await detectRunners({ rootDir: dir });
  assert.deepEqual(runners, []);
});

test('inventoryTests: covers js/ts/py/go/rb/java patterns; skips node_modules', async (t) => {
  const { inventoryTests } = await loadScript();
  const dir = await makeFixture({
    'src/foo.js': 'export {};',
    'src/foo.test.js': 'test("a", () => {});',
    'src/bar.spec.ts': 'describe("b", () => {});',
    'tests/test_baz.py': 'def test_baz(): pass',
    'tests/qux_test.py': 'def test_qux(): pass',
    'pkg/main_test.go': 'package main\nfunc TestMain(t *T) {}',
    'spec/foo_spec.rb': 'describe "x" do; end',
    'src/main/java/com/example/FooTest.java': 'class FooTest {}',
    // skips:
    'node_modules/foo/bar.test.js': 'test("skip", () => {});',
    'dist/built.test.js': 'test("skip", () => {});',
    '.git/hooks/pre-commit.test.js': 'test("skip", () => {});',
    '_testatlas/some.test.js': 'test("skip", () => {});',
    '.testatlas/some.test.js': 'test("skip", () => {});',
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const inv = await inventoryTests({ rootDir: dir });
  const paths = inv.map((t) => t.path).sort();
  assert.deepEqual(paths, [
    'pkg/main_test.go',
    'spec/foo_spec.rb',
    'src/bar.spec.ts',
    'src/foo.test.js',
    'src/main/java/com/example/FooTest.java',
    'tests/qux_test.py',
    'tests/test_baz.py',
  ]);
});

test('inventoryTests: categorize buckets + runner inference', async (t) => {
  const { inventoryTests } = await loadScript();
  const dir = await makeFixture({
    'tests/unit/a.test.js': '',
    'tests/integration/b.test.js': '',
    'e2e/c.spec.ts': '',
    'contract/d.test.ts': '',
    'performance/e_test.go': '',
    'smoke/f.test.js': '',
    'tests/g.test.js': '',
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const inv = await inventoryTests({ rootDir: dir });
  const byPath = Object.fromEntries(inv.map((t) => [t.path, t]));
  assert.equal(byPath['tests/unit/a.test.js'].category, 'unit');
  assert.equal(byPath['tests/integration/b.test.js'].category, 'integration');
  assert.equal(byPath['e2e/c.spec.ts'].category, 'e2e');
  assert.equal(byPath['contract/d.test.ts'].category, 'contract');
  assert.equal(byPath['performance/e_test.go'].category, 'performance');
  assert.equal(byPath['smoke/f.test.js'].category, 'smoke');
  assert.equal(byPath['tests/g.test.js'].category, 'unit');
  assert.equal(byPath['performance/e_test.go'].runner, 'go-test');
  assert.equal(byPath['e2e/c.spec.ts'].runner, 'mocha-or-jasmine');
});

test('buildTestsSlice: composed shape with summary counts', async (t) => {
  const { buildTestsSlice } = await loadScript();
  const dir = await makeFixture({
    'package.json': JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }),
    'tests/a.test.js': '',
    'tests/integration/b.test.js': '',
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const slice = await buildTestsSlice({ rootDir: dir });
  assert.ok(Array.isArray(slice.runners));
  assert.ok(Array.isArray(slice.inventory));
  assert.equal(slice.summary.total, 2);
  assert.equal(slice.summary.byCategory.unit, 1);
  assert.equal(slice.summary.byCategory.integration, 1);
  assert.match(slice.refreshedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('buildAppMap: preserves non-tests slices verbatim', async (t) => {
  const { buildAppMap } = await loadScript();
  const dir = await makeFixture({
    '_testatlas/12_app_map.json': JSON.stringify({
      $schema: 'https://testatlas.dev/schemas/v1/app-map.schema.json',
      domains: [{ id: 'd-1', name: 'Domain One' }],
      routes: [{ path: '/' }],
      components: [],
      apis: [],
      cliCommands: [],
      jobs: [],
      integrations: [{ name: 'gh-action', type: 'github-action' }],
      entities: [],
      flows: [],
      tests: [{ path: 'old/legacy.test.js', category: 'unit' }],
      relationships: [],
    }),
    'src/foo.test.js': '',
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const appMap = await buildAppMap({ rootDir: dir });
  // Preserved verbatim:
  assert.deepEqual(appMap.domains, [{ id: 'd-1', name: 'Domain One' }]);
  assert.deepEqual(appMap.routes, [{ path: '/' }]);
  assert.deepEqual(appMap.integrations, [{ name: 'gh-action', type: 'github-action' }]);
  // Tests slice updated: legacy preserved (no overlap), fresh detected appended.
  assert.equal(appMap.tests.length, 2);
  assert.ok(appMap.tests.find((t) => t.path === 'old/legacy.test.js'));
  assert.ok(appMap.tests.find((t) => t.path === 'src/foo.test.js'));
  // Top-level summary present.
  assert.equal(appMap.testsSummary.total, 1);
});

test('real-repo invocation: detects ≥10 test files in suite repo own tree', async () => {
  const { inventoryTests, detectRunners } = await loadScript();
  const inv = await inventoryTests({ rootDir: REPO_ROOT });
  // Suite has well over 100 tests; safe lower bound.
  assert.ok(inv.length >= 10, `expected ≥10 test files, got ${inv.length}`);
  const runners = await detectRunners({ rootDir: REPO_ROOT });
  const names = runners.map((r) => r.name);
  assert.ok(names.includes('node-test'), `expected node-test in runners, got ${names.join(',')}`);
});
