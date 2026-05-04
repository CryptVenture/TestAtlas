// Tests for Phase 0 governance documentation artifacts.
// Covers gaps: gov-01-license, gov-01-readme, gov-02-contributing,
// gov-03-security, gov-04-adapter-owners, gov-05-scope, gov-06-threat-model.
//
// These tests verify the public-facing governance artifacts hold the
// guarantees declared in the phase plans (GOV-01 through GOV-06).
// Behavioral check: a fresh visitor reading these files at the repo root
// can answer the success-criteria questions for the phase.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const read = (relPath) => readFile(path.join(repoRoot, relPath), 'utf8');

// ---- GOV-01: LICENSE ----
test('LICENSE exists, declares MIT, and includes a copyright year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.length > 0, 'LICENSE should not be empty');
  assert.match(license, /MIT License/, 'LICENSE must contain "MIT License"');
  assert.match(license, /Copyright \(c\) \d{4}/, 'LICENSE must contain a copyright year');
});

// ---- GOV-01: README ----
test('README.md exists, has H1, and links to CONTRIBUTING.md and docs/SCOPE.md', async () => {
  const readme = await read('README.md');
  assert.ok(readme.length > 0, 'README.md should not be empty');
  assert.match(readme, /^# /m, 'README.md must contain an H1 heading');
  assert.match(readme, /CONTRIBUTING\.md/, 'README.md must link to CONTRIBUTING.md');
  assert.match(readme, /docs\/SCOPE\.md/, 'README.md must link to docs/SCOPE.md');
});

// ---- GOV-02: CONTRIBUTING ----
test('CONTRIBUTING.md mentions Node prerequisite, lint/test scripts, and changesets', async () => {
  const contributing = await read('CONTRIBUTING.md');
  assert.ok(contributing.length > 0, 'CONTRIBUTING.md should not be empty');
  // Prerequisites: Node version requirement.
  assert.match(
    contributing,
    /Node\.?js?\s*>=\s*20\.11/i,
    'CONTRIBUTING.md must declare a Node.js >= 20.11 prerequisite',
  );
  // Scripts: must mention lint and test.
  assert.match(contributing, /\blint\b/i, 'CONTRIBUTING.md must mention the lint script');
  assert.match(contributing, /\btest\b/i, 'CONTRIBUTING.md must mention the test script');
  // Changesets: contributors must learn the changeset flow.
  assert.match(
    contributing,
    /changeset/i,
    'CONTRIBUTING.md must mention changesets for contributor flow',
  );
});

// ---- GOV-03: SECURITY ----
test('SECURITY.md provides a private reporting channel, SLA, and links to threat model', async () => {
  const security = await read('SECURITY.md');
  assert.ok(security.length > 0, 'SECURITY.md should not be empty');
  // Private reporting channel: email-style address or "security advisor" wording.
  const hasPrivateChannel =
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(security) ||
    /security\s+advisor/i.test(security) ||
    /private(?:ly)?\s+(?:by\s+)?(?:emailing|report|disclosure)/i.test(security);
  assert.ok(
    hasPrivateChannel,
    'SECURITY.md must provide a private reporting channel (email or security advisor)',
  );
  // Response/SLA timing language.
  const hasSLA =
    /\b\d+\s*(?:hours?|days?|weeks?|months?)\b/i.test(security) ||
    /\backnowledge\b/i.test(security);
  assert.ok(hasSLA, 'SECURITY.md must include response/SLA timing language');
  // Link to threat model.
  assert.match(security, /docs\/THREAT_MODEL\.md/, 'SECURITY.md must link to docs/THREAT_MODEL.md');
});

// ---- GOV-04: ADAPTER-OWNERS ----
test('ADAPTER-OWNERS.md lists all 7 adapter families and bus-factor mitigation', async () => {
  const owners = await read('ADAPTER-OWNERS.md');
  assert.ok(owners.length > 0, 'ADAPTER-OWNERS.md should not be empty');
  // All 7 adapter families.
  const requiredFamilies = [
    'Claude Code',
    'OpenCode',
    'KiloCode',
    'Cursor',
    'Aider',
    'MCP',
    'Generic',
  ];
  for (const family of requiredFamilies) {
    assert.match(
      owners,
      new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `ADAPTER-OWNERS.md must mention adapter family: ${family}`,
    );
  }
  // Bus-factor mitigation: target ≥2 maintainers.
  const hasBusFactor =
    /bus[-\s]?factor/i.test(owners) &&
    /(?:≥\s*2|>=\s*2|at\s+least\s+2|two\s+maintainers)/i.test(owners);
  assert.ok(
    hasBusFactor,
    'ADAPTER-OWNERS.md must declare bus-factor mitigation with ≥2 maintainer target',
  );
});

// ---- GOV-05: SCOPE ----
test('docs/SCOPE.md contains at least 10 enumerated rejections', async () => {
  const scope = await read('docs/SCOPE.md');
  assert.ok(scope.length > 0, 'docs/SCOPE.md should not be empty');
  // Count numbered list items at the start of a line (1. 2. 3. ...).
  const numberedItems = scope.match(/^\s*\d+\.\s+\*\*/gm) || [];
  assert.ok(
    numberedItems.length >= 10,
    `docs/SCOPE.md must enumerate ≥10 rejections; found ${numberedItems.length}`,
  );
});

// ---- GOV-06: THREAT_MODEL ----
test('docs/THREAT_MODEL.md covers the 3 mandated attack surfaces', async () => {
  const threat = await read('docs/THREAT_MODEL.md');
  assert.ok(threat.length > 0, 'docs/THREAT_MODEL.md should not be empty');
  // Surface 1: install pipeline (curl|sh).
  assert.match(
    threat,
    /curl\s*[|│]\s*sh|install(?:er|\.sh|\s+pipeline)/i,
    'docs/THREAT_MODEL.md must cover the install pipeline / curl|sh surface',
  );
  // Surface 2: auto-update propagation.
  assert.match(
    threat,
    /auto[-\s]?update/i,
    'docs/THREAT_MODEL.md must cover the auto-update propagation surface',
  );
  // Surface 3: prompt injection.
  assert.match(
    threat,
    /prompt\s+injection/i,
    'docs/THREAT_MODEL.md must cover the prompt injection surface',
  );
});
