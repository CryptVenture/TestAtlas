// Tests for Phase 2 — WORK-06 (two-tree invariant guard).
//
// Asserts the explicit-arg pattern (no stack inspection): valid contexts pass
// silently, 'update' throws TESTATLAS_TWO_TREE_VIOLATION, anything else throws
// TESTATLAS_INVALID_CALLER_CONTEXT.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertNotUpdate, VALID_CONTEXTS } from '../scripts/lib/workspace-guard.js';

test('WORK-06: rejects update context with TESTATLAS_TWO_TREE_VIOLATION', () => {
  assert.throws(
    () => assertNotUpdate('update'),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_TWO_TREE_VIOLATION');
      assert.match(err.message, /two-tree invariant/i);
      assert.match(err.message, /update/);
      return true;
    },
  );
});

test('WORK-06: allows init context', () => {
  assert.doesNotThrow(() => assertNotUpdate('init'));
});

test('WORK-06: allows command context', () => {
  assert.doesNotThrow(() => assertNotUpdate('command'));
});

test('WORK-06: allows migration context', () => {
  assert.doesNotThrow(() => assertNotUpdate('migration'));
});

test('WORK-06: allows test context', () => {
  assert.doesNotThrow(() => assertNotUpdate('test'));
});

test('WORK-06: rejects unknown context with TESTATLAS_INVALID_CALLER_CONTEXT', () => {
  assert.throws(
    () => assertNotUpdate('garbage'),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_INVALID_CALLER_CONTEXT');
      assert.match(err.message, /garbage/);
      return true;
    },
  );
});

test('WORK-06: rejects undefined context', () => {
  assert.throws(
    () => assertNotUpdate(undefined),
    (err) => err.code === 'TESTATLAS_INVALID_CALLER_CONTEXT',
  );
});

test('WORK-06: rejects null context', () => {
  assert.throws(
    () => assertNotUpdate(null),
    (err) => err.code === 'TESTATLAS_INVALID_CALLER_CONTEXT',
  );
});

test('WORK-06: rejects empty string context', () => {
  assert.throws(
    () => assertNotUpdate(''),
    (err) => err.code === 'TESTATLAS_INVALID_CALLER_CONTEXT',
  );
});

test('WORK-06: VALID_CONTEXTS export is a Set with the expected entries', () => {
  assert.ok(VALID_CONTEXTS instanceof Set, 'VALID_CONTEXTS must be a Set');
  assert.equal(VALID_CONTEXTS.size, 4);
  for (const ctx of ['init', 'command', 'migration', 'test']) {
    assert.ok(VALID_CONTEXTS.has(ctx), `VALID_CONTEXTS missing "${ctx}"`);
  }
  assert.ok(!VALID_CONTEXTS.has('update'), '"update" must NOT be a valid context');
});
