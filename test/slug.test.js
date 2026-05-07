// test/slug.test.js
//
// WORK-05: slug helpers + schema-helper sync with vocabulary.schema.json.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ID_PATTERNS,
  isKebabSlug,
  KEBAB_RE,
  padIssueNumber,
  slugify,
} from '../scripts/lib/slug.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

test('WORK-05: KEBAB_RE accepts valid kebab slugs', () => {
  for (const valid of ['x', 'user-login', 'x1-y2-z3', 'foo', 'foo-bar-baz']) {
    assert.ok(KEBAB_RE.test(valid), `should accept "${valid}"`);
    assert.equal(isKebabSlug(valid), true);
  }
});

test('WORK-05: KEBAB_RE rejects invalid slugs', () => {
  for (const invalid of ['User', 'user_login', 'user--login', '-user', 'user-', '', 'a b']) {
    assert.equal(KEBAB_RE.test(invalid), false, `should reject "${invalid}"`);
    assert.equal(isKebabSlug(invalid), false);
  }
  assert.equal(isKebabSlug(undefined), false);
  assert.equal(isKebabSlug(null), false);
  assert.equal(isKebabSlug(42), false);
});

test('WORK-05: slugify normalizes diacritics + spaces + underscores', () => {
  assert.equal(slugify('Café Latté!'), 'cafe-latte');
  assert.equal(slugify('  Multiple   Spaces  '), 'multiple-spaces');
  assert.equal(slugify('foo_bar baz'), 'foo-bar-baz');
  assert.equal(slugify('foo_bar'), 'foo-bar');
  assert.equal(slugify('A B C'), 'a-b-c');
});

test('WORK-05: padIssueNumber zero-pads', () => {
  assert.equal(padIssueNumber(7), '007');
  assert.equal(padIssueNumber(123), '123');
  assert.equal(padIssueNumber(1234), '1234');
  assert.equal(padIssueNumber(0), '000');
});

test('WORK-05: ID_PATTERNS match PRD §32 examples', () => {
  const positives = {
    domain: ['domain-billing', 'domain-user-auth', 'domain-x1'],
    flow: ['FLOW-billing-checkout', 'FLOW-auth-login-flow'],
    test: ['TEST-billing-smoke-1', 'TEST-auth-happy-path'],
    issue: ['ISSUE-001-broken-link', 'ISSUE-12345-very-long', 'ISSUE-001-x'],
    evidence: ['EVIDENCE-001', 'EVIDENCE-002-redaction', 'EVIDENCE-100-foo-bar'],
    page: ['PAGE-home', 'PAGE-user-profile'],
    api: ['API-GET-users-id', 'API-POST-billing-charge', 'API-DELETE-x'],
    cli: ['CLI-init-workspace', 'CLI-validate'],
    component: ['COMPONENT-billing-pay-button', 'COMPONENT-auth-form'],
    job: ['JOB-nightly-roll', 'JOB-cleanup'],
    integration: ['INTEGRATION-stripe', 'INTEGRATION-sendgrid-api'],
    persona: ['PERSONA-admin', 'PERSONA-end-user'],
  };

  for (const [key, samples] of Object.entries(positives)) {
    for (const sample of samples) {
      assert.ok(ID_PATTERNS[key].test(sample), `ID_PATTERNS.${key} should accept "${sample}"`);
    }
  }

  const negatives = {
    domain: ['DOM-billing', 'domain-Billing', 'Domain-x', 'domain-'],
    issue: ['ISSUE-1-x', 'ISSUE-12-y', 'issue-001-x'],
    api: ['API-GET-', 'API-FOO-x', 'api-get-x'],
    flow: ['FLOW-onlyone', 'flow-billing-checkout'],
    test: ['TEST-onlyone', 'test-billing-smoke'],
    component: ['COMPONENT-onlyone', 'component-x-y'],
  };

  for (const [key, samples] of Object.entries(negatives)) {
    for (const sample of samples) {
      assert.equal(
        ID_PATTERNS[key].test(sample),
        false,
        `ID_PATTERNS.${key} should reject "${sample}"`,
      );
    }
  }
});

test('WORK-05: schema-helper sync — every ID_PATTERNS source equals vocabulary $defs pattern', async () => {
  const vocab = await readJson(path.join(repoRoot, '.testatlas/schemas/vocabulary.schema.json'));
  const map = [
    ['domain', 'domainId'],
    ['flow', 'flowId'],
    ['test', 'testId'],
    ['issue', 'issueId'],
    ['evidence', 'evidenceId'],
    ['page', 'pageId'],
    ['api', 'apiId'],
    ['cli', 'cliId'],
    ['component', 'componentId'],
    ['job', 'jobId'],
    ['integration', 'integrationId'],
    ['persona', 'personaId'],
  ];

  for (const [helperKey, vocabKey] of map) {
    const helperSource = ID_PATTERNS[helperKey].source;
    const vocabPattern = vocab.$defs[vocabKey].pattern;
    assert.equal(
      helperSource,
      vocabPattern,
      `ID_PATTERNS.${helperKey}.source ("${helperSource}") must equal vocabulary.$defs.${vocabKey}.pattern ("${vocabPattern}")`,
    );
  }
});
