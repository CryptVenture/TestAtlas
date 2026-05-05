// Phase 10 Plan 01: pins drop-line-on-missing semantics for the shared emit() template renderer. Fixes ISSUE-001/002/003 (template-rendering trio).
//
// Background: the four Phase-5 emitters (create-issue / create-flow /
// create-evidence-record / create-domain) all render their markdown through the
// shared `applyTemplate()` helper in `scripts/lib/emitter.js`. The original
// implementation (Plan 05-01) left every unmatched `{{key}}` placeholder as
// literal text — which leaks visible `flow: {{flow}}` lines into 100% of
// generated artifacts whenever the optional record field is null/missing
// (verified across 15 in-tree `_testatlas/to_fix/ISSUE-*.md` and 15 evidence
// records during the Phase-9 dogfood explore runs).
//
// New contract pinned by these tests:
//   - A line whose non-placeholder, non-whitespace content is empty AND whose
//     placeholders are ALL missing/null/empty is dropped entirely from the
//     rendered output.
//   - A line that contains real prose around a placeholder is retained even
//     when the placeholder is missing — the literal `{{key}}` token survives
//     so the broken signal stays visible to humans.
//   - A line with multiple placeholders, of which only some are missing, is
//     retained: resolved keys substitute, missing ones remain literal.
//   - `flattenSubstitutions()` treats empty strings as "not present" so the
//     drop-line logic also fires for explicit-empty values.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { applyTemplate, flattenSubstitutions } from '../../scripts/lib/emitter.js';

// ────────────────────────────── applyTemplate tests ──────────────────────────

test('render-template: drop-line for frontmatter line whose only placeholder is missing', () => {
  const template = 'id: {{id}}\nflow: {{flow}}\ndomain: {{domain}}\n';
  const subs = { id: '042', domain: 'auth' }; // no `flow` key
  const out = applyTemplate(template, subs);
  assert.match(out, /id: 042/);
  assert.match(out, /domain: auth/);
  assert.doesNotMatch(out, /flow:/, 'flow: line must be dropped when {{flow}} is missing');
  assert.doesNotMatch(out, /\{\{flow\}\}/, '{{flow}} placeholder must not leak through');
});

test('render-template: drop-line when value is null in flattened subs', () => {
  // Run flattenSubstitutions over a record with explicit null — it must skip
  // the key, which then triggers drop-line in applyTemplate.
  const template = 'id: {{id}}\nflow: {{flow}}\ndomain: {{domain}}\n';
  const subs = flattenSubstitutions({ id: '042', flow: null, domain: 'auth' });
  const out = applyTemplate(template, subs);
  assert.doesNotMatch(out, /flow:/, 'flow: line must be dropped when flow: null');
  assert.doesNotMatch(out, /\{\{flow\}\}/, '{{flow}} must not leak when flow: null');
  assert.match(out, /id: 042/);
  assert.match(out, /domain: auth/);
});

test('render-template: drop-line when value is empty string', () => {
  const template = 'id: {{id}}\nflow: {{flow}}\ndomain: {{domain}}\n';
  const subs = flattenSubstitutions({ id: '042', flow: '', domain: 'auth' });
  const out = applyTemplate(template, subs);
  assert.doesNotMatch(out, /flow:/, 'flow: line must be dropped when flow is empty string');
  assert.doesNotMatch(out, /\{\{flow\}\}/);
});

test('render-template: scalar present → placeholder substitutes verbatim', () => {
  const template = 'flow: {{flow}}\n';
  const subs = flattenSubstitutions({ flow: 'login' });
  const out = applyTemplate(template, subs);
  assert.match(out, /^flow: login\n?$/);
});

test('render-template: mid-line placeholder resolves when key present', () => {
  const template = '# Issue: {{title}}';
  const subs = { title: 'Bug' };
  const out = applyTemplate(template, subs);
  assert.equal(out, '# Issue: Bug');
});

test('render-template: mid-line missing placeholder leaves line intact (prose-mode signal)', () => {
  // The line contains prose ("# Issue:") around the placeholder — it must NOT
  // be dropped. The literal {{title}} stays visible so the broken signal
  // remains evident to a reviewer.
  const template = '# Issue: {{title}}';
  const subs = {};
  const out = applyTemplate(template, subs);
  assert.equal(out, '# Issue: {{title}}');
});

test('render-template: multi-placeholder line with one missing → line kept, missing stays literal', () => {
  // When SOME placeholders are missing but at least one resolved or any prose
  // remains, the line is preserved; missing tokens remain as literal {{key}}.
  const template = 'flow: {{flow}} ({{persona}})';
  const subs = { flow: 'login' };
  const out = applyTemplate(template, subs);
  assert.match(out, /flow: login/);
  assert.match(out, /\{\{persona\}\}/);
});

// ───────────────────────── flattenSubstitutions tests ────────────────────────

test('render-template: flattenSubstitutions skips null/undefined/empty-string and non-scalars', () => {
  const subs = flattenSubstitutions({
    id: '042',
    flow: null,
    persona: undefined,
    domain: '',
    severity: 'high',
    tags: ['a', 'b'], // array — must be skipped
    meta: { x: 1 }, // object — must be skipped
    count: 7,
    enabled: true,
  });
  assert.equal(subs.id, '042');
  assert.equal(subs.severity, 'high');
  assert.equal(subs.count, '7');
  assert.equal(subs.enabled, 'true');
  assert.ok(!Object.hasOwn(subs, 'flow'), 'null fields must be skipped');
  assert.ok(!Object.hasOwn(subs, 'persona'), 'undefined fields must be skipped');
  assert.ok(!Object.hasOwn(subs, 'domain'), 'empty-string fields must be skipped');
  assert.ok(!Object.hasOwn(subs, 'tags'), 'arrays must be skipped');
  assert.ok(!Object.hasOwn(subs, 'meta'), 'objects must be skipped');
});
