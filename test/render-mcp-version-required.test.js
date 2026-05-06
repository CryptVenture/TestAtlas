// test/render-mcp-version-required.test.js
//
// Quick task quick-260506-nj2 (GAP 3). renderMcp / renderMcpToString now
// require a non-empty string `version` parameter; the previous hardcoded
// '1.0.0' is gone. Asserts both fail-fast (TypeError on missing/empty) and
// happy-path pass-through (manifest.version === injected value).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMcp, renderMcpToString } from '../scripts/lib/adapters/render-mcp.js';

const EMPTY_OPTS = { sources: [], adapterCaps: [] };

test('renderMcpToString throws TypeError when version is missing', () => {
  assert.throws(
    () => renderMcpToString({ ...EMPTY_OPTS }),
    (err) => err instanceof TypeError && /version \(string\) is required/.test(err.message),
  );
});

test('renderMcpToString throws TypeError when version is empty string', () => {
  assert.throws(
    () => renderMcpToString({ ...EMPTY_OPTS, version: '' }),
    (err) => err instanceof TypeError && /version \(string\) is required/.test(err.message),
  );
});

test('renderMcp throws TypeError when version is missing', () => {
  assert.throws(
    () => renderMcp({ ...EMPTY_OPTS }),
    (err) => err instanceof TypeError && /version \(string\) is required/.test(err.message),
  );
});

test('renderMcpToString injects version into manifest.version', () => {
  const text = renderMcpToString({ ...EMPTY_OPTS, version: '1.2.3' });
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, '1.2.3');
  assert.equal(parsed.name, 'testatlas');
  assert.deepEqual(parsed.prompts, []);
});

test('renderMcp returns manifest carrying the injected version', () => {
  const { manifest } = renderMcp({ ...EMPTY_OPTS, version: '9.9.9' });
  assert.equal(manifest.version, '9.9.9');
});
