// test/update/pinning.test.js
//
// Plan 07-04 Task 2 — pure-function tests for evaluatePin (UPDATE-04).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePin, shouldWarn } from '../../scripts/lib/pinning.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isoDaysAgo = (n) => new Date(Date.now() - n * MS_PER_DAY).toISOString();

describe('evaluatePin', () => {
  it('returns null when pinnedVersion is null', () => {
    const result = evaluatePin({
      latestVersion: '2.0.0',
      pinnedVersion: null,
      pinnedSince: isoDaysAgo(120),
      thresholdDays: 90,
    });
    assert.equal(result, null);
  });

  it('returns null when pinnedVersion is undefined', () => {
    const result = evaluatePin({
      latestVersion: '2.0.0',
      pinnedVersion: undefined,
      pinnedSince: isoDaysAgo(120),
      thresholdDays: 90,
    });
    assert.equal(result, null);
  });

  it('returns satisfied:true when range matches latest (1.x covers 1.5.0)', () => {
    const result = evaluatePin({
      latestVersion: '1.5.0',
      pinnedVersion: '1.x',
      pinnedSince: isoDaysAgo(7),
      thresholdDays: 90,
    });
    assert.equal(result.satisfied, true);
  });

  it('returns satisfied:false suppressed:true when out of range BUT within threshold', () => {
    const result = evaluatePin({
      latestVersion: '2.0.0',
      pinnedVersion: '1.x',
      pinnedSince: isoDaysAgo(30),
      thresholdDays: 90,
    });
    assert.equal(result.satisfied, false);
    assert.equal(result.suppressed, true);
    assert.notEqual(result.stale, true);
  });

  it('returns stale:true with message when out of range AND past threshold', () => {
    const result = evaluatePin({
      latestVersion: '2.0.0',
      pinnedVersion: '1.x',
      pinnedSince: isoDaysAgo(120),
      thresholdDays: 90,
    });
    assert.equal(result.stale, true);
    assert.match(result.message, /Pinned to 1\.x for \d+ days/);
    assert.match(result.message, /2\.0\.0/);
    assert.match(result.message, /outside the pin range/i);
  });

  it('exact pin satisfies when latest matches exactly', () => {
    const result = evaluatePin({
      latestVersion: '1.2.3',
      pinnedVersion: '1.2.3',
      pinnedSince: isoDaysAgo(120),
      thresholdDays: 90,
    });
    assert.equal(result.satisfied, true);
  });

  it('exact pin out-of-range past threshold → stale', () => {
    const result = evaluatePin({
      latestVersion: '1.2.4',
      pinnedVersion: '1.2.3',
      pinnedSince: isoDaysAgo(150),
      thresholdDays: 90,
    });
    assert.equal(result.stale, true);
    assert.match(result.message, /1\.2\.3/);
  });

  it('exact pin out-of-range within threshold → suppressed', () => {
    const result = evaluatePin({
      latestVersion: '1.2.4',
      pinnedVersion: '1.2.3',
      pinnedSince: isoDaysAgo(10),
      thresholdDays: 90,
    });
    assert.equal(result.satisfied, false);
    assert.equal(result.suppressed, true);
  });

  it('handles missing pinnedSince (null) by treating age as 0 (suppressed)', () => {
    const result = evaluatePin({
      latestVersion: '2.0.0',
      pinnedVersion: '1.x',
      pinnedSince: null,
      thresholdDays: 90,
    });
    // No pinnedSince → no stale-pin metric → suppressed (we know the user
    // pinned but we can't compute drift). Don't escalate to stale.
    assert.equal(result.satisfied, false);
    assert.equal(result.suppressed, true);
    assert.notEqual(result.stale, true);
  });

  it('uses default thresholdDays=90 when not provided', () => {
    const result = evaluatePin({
      latestVersion: '2.0.0',
      pinnedVersion: '1.x',
      pinnedSince: isoDaysAgo(120),
    });
    assert.equal(result.stale, true);
  });

  it('invalid latestVersion within threshold → suppressed (not stale)', () => {
    const result = evaluatePin({
      latestVersion: 'not-a-version',
      pinnedVersion: '1.x',
      pinnedSince: isoDaysAgo(7),
      thresholdDays: 90,
    });
    // Invalid latestVersion fails semver.satisfies → out of range branch.
    // Within threshold → suppressed.
    assert.equal(result.satisfied, false);
    assert.equal(result.suppressed, true);
  });
});

describe('shouldWarn', () => {
  it('returns true only for stale results', () => {
    assert.equal(shouldWarn({ stale: true, message: 'x' }), true);
    assert.equal(shouldWarn({ satisfied: true }), false);
    assert.equal(shouldWarn({ satisfied: false, suppressed: true }), false);
    assert.equal(shouldWarn(null), false);
    assert.equal(shouldWarn(undefined), false);
  });
});
