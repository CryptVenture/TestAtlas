// Tests for Phase 0 package.json, biome.json, and .changeset/config.json.
// Covers gaps: gov-07-package-engines, gov-07-package-scripts,
// gov-07-package-devdeps, gov-07-biome-config, gov-07-changeset-config.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const readJson = async (relPath) => {
  const raw = await readFile(path.join(repoRoot, relPath), 'utf8');
  return JSON.parse(raw);
};

// Minimal semver "satisfies" check sufficient for the engines floor assertion.
// Verifies that the engines.node range string would accept Node 20.11.0+.
const enginesRangeAcceptsNode2011 = (range) => {
  // Accept patterns like ">=20.11.0", ">=20.11", ">=20.11.0 <23", "^20.11.0".
  const m = range.match(/>=\s*(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return false;
  const [, major, minor] = m;
  const maj = Number.parseInt(major, 10);
  const min = Number.parseInt(minor, 10);
  if (maj > 20) return false; // floor must be at most 20.x to accept 20.11.0
  if (maj < 20) return true;
  return min <= 11;
};

// ---- GOV-07: package.json engines / type / license ----
test('package.json engines.node satisfies >=20.11.0 with engineStrict and ESM', async () => {
  const pkg = await readJson('package.json');
  assert.ok(pkg.engines?.node, 'package.json must have engines.node');
  assert.ok(
    enginesRangeAcceptsNode2011(pkg.engines.node),
    `engines.node range "${pkg.engines.node}" must accept Node 20.11.0+`,
  );
  assert.equal(pkg.engineStrict, true, 'package.json must have engineStrict: true');
  assert.equal(pkg.type, 'module', 'package.json must declare "type": "module" (ESM)');
  assert.equal(pkg.license, 'MIT', 'package.json license must be "MIT"');
});

// ---- GOV-07: package.json scripts ----
test('package.json scripts include lint, lint:fix, format, test, changeset, prepare', async () => {
  const pkg = await readJson('package.json');
  assert.ok(pkg.scripts, 'package.json must have a scripts block');
  const required = ['lint', 'lint:fix', 'format', 'test', 'changeset', 'prepare'];
  for (const name of required) {
    assert.ok(
      typeof pkg.scripts[name] === 'string' && pkg.scripts[name].length > 0,
      `package.json scripts must define "${name}"`,
    );
  }
});

// ---- GOV-07: package.json devDependencies ----
test('package.json devDependencies include @biomejs/biome, @changesets/cli, simple-git-hooks', async () => {
  const pkg = await readJson('package.json');
  assert.ok(pkg.devDependencies, 'package.json must have a devDependencies block');
  const required = ['@biomejs/biome', '@changesets/cli', 'simple-git-hooks'];
  for (const dep of required) {
    assert.ok(
      typeof pkg.devDependencies[dep] === 'string' && pkg.devDependencies[dep].length > 0,
      `package.json devDependencies must include "${dep}"`,
    );
  }
});

// ---- GOV-07: biome.json valid + schema ----
test('biome.json is valid JSON and references the Biome schema', async () => {
  const biome = await readJson('biome.json');
  assert.ok(biome.$schema, 'biome.json must have a $schema field');
  assert.match(
    biome.$schema,
    /biomejs/i,
    'biome.json $schema must reference biome (biomejs.dev)',
  );
});

// ---- GOV-07: .changeset/config.json ----
test('.changeset/config.json is valid JSON and declares public access', async () => {
  const cfg = await readJson('.changeset/config.json');
  assert.equal(cfg.access, 'public', '.changeset/config.json access must be "public"');
});
