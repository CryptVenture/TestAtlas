// scripts/lib/pinning.js
//
// Plan 07-04 Task 2 — version-pinning evaluation + stale-pin threshold logic
// (UPDATE-04).
//
// Per RESEARCH §Pattern 9. Three states:
//   - pinnedVersion null/undefined → returns null (no-op; caller skips warn).
//   - latest satisfies pinnedRange → {satisfied: true}
//   - latest out of range AND age > threshold → {stale: true, message}
//   - latest out of range AND age <= threshold → {satisfied: false, suppressed: true}
//
// Edge cases:
//   - pinnedSince null/missing → treat age as 0 (suppressed; can't compute drift).
//   - latestVersion invalid semver → suppressed (don't escalate to stale on garbage).
//   - thresholdDays missing → default 90 (matches config schema default).

import semver from 'semver';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD_DAYS = 90;

/**
 * @typedef {Object} EvaluatePinInput
 * @property {string|null|undefined} latestVersion   Latest available version.
 * @property {string|null|undefined} pinnedVersion   Range or exact version string.
 * @property {string|null|undefined} [pinnedSince]   ISO-8601 timestamp.
 * @property {number}                [thresholdDays] Days; default 90.
 */

/**
 * @typedef {Object} PinResult
 * @property {true}     [satisfied]    Latest is in pin range.
 * @property {false}    [satisfied]
 * @property {true}     [suppressed]   Out of range but within threshold.
 * @property {true}     [stale]        Out of range AND past threshold.
 * @property {string}   [message]      Human-readable warning (when stale).
 */

/**
 * Evaluate whether the user's pinnedVersion config satisfies the latest
 * release; if not, decide whether to escalate to a stale-pin warning.
 *
 * @param {EvaluatePinInput} opts
 * @returns {PinResult|null}
 */
export function evaluatePin(opts) {
  const { latestVersion, pinnedVersion, pinnedSince } = opts;
  const thresholdDays =
    typeof opts.thresholdDays === 'number' && opts.thresholdDays > 0
      ? opts.thresholdDays
      : DEFAULT_THRESHOLD_DAYS;

  if (!pinnedVersion) return null;

  // semver.satisfies is forgiving but accepts both exact ("1.2.3") and range
  // ("1.x", "^1.0.0"). Garbage in latestVersion → false (no satisfaction).
  let satisfied = false;
  try {
    satisfied = semver.satisfies(latestVersion, pinnedVersion, { includePrerelease: false });
  } catch {
    satisfied = false;
  }
  if (satisfied) {
    return { satisfied: true };
  }

  // Out of range. Decide stale vs suppressed.
  let ageDays = 0;
  if (pinnedSince) {
    const t = Date.parse(pinnedSince);
    if (Number.isFinite(t)) {
      ageDays = Math.max(0, (Date.now() - t) / MS_PER_DAY);
    }
  }

  if (ageDays > thresholdDays) {
    const intDays = Math.floor(ageDays);
    return {
      stale: true,
      message:
        `Pinned to ${pinnedVersion} for ${intDays} days; latest ${latestVersion} ` +
        `is outside the pin range.`,
    };
  }

  return { satisfied: false, suppressed: true };
}

/**
 * @param {PinResult|null|undefined} result
 * @returns {boolean}
 */
export function shouldWarn(result) {
  return result?.stale === true;
}
