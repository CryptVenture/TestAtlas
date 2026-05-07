---
id: RETEST-<!-- NNNN -->
issue_id: ISSUE-<!-- linked id -->
status: pending
created_at: <!-- ISO-8601 -->
automation_candidate: false
generated_by: scripts/generate-retest-pack.js
---

# Retest: <!-- linked issue title -->

> Linked issue: `ISSUE-<!-- id -->` (severity: <!-- low|medium|high|critical -->).
> Run after a candidate fix lands; mark `status: passed` only after evidence is captured.

## Preconditions

- <!-- environment / state required before re-running the reproduction -->

## Steps

1.
2.
3.

## Pass criteria (expected)

<!-- The acceptance criteria from the linked issue, joined into a single
     pass condition. The retest passes only when ALL acceptance criteria
     hold simultaneously. -->

## Fail-state baseline (actual at issue capture)

<!-- The `actualBehavior` field from the linked issue, captured at the
     moment the issue was filed. The retest fails (regression) if this
     baseline reappears. -->

## Evidence

- <!-- evidence id from issue -->

## Fixtures

- <!-- declare any fixture files this retest needs; otherwise `(none)` -->

<!-- Status enum (per retest_pack.schema.json): pending | passed | failed |
     blocked | skipped | obsolete. Promote only after evidence is captured
     under _testatlas/evidence/runs/<run-id>/. -->
