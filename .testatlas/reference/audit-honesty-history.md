# Audit-honesty history

> Long-form post-mortems documenting moments where TestAtlas's CHANGELOG / verification narratives were corrected against live test-count truth. Extracted from `CHANGELOG.md` to keep the canonical CHANGELOG within the 3000-word budget while preserving the full audit-trail for downstream reviewers and council brain-audits. Cross-referenced from `CHANGELOG.md`'s `[2.0.0]` block; cited by COUNCIL-2026-05-09-003 / DEC-001 + COUNCIL-2026-05-10-001 / DEC-001.

## Phase 23 / Plan 23-03 — DEC-001 audit-honesty correction to Phase-22 verification

**Phase-22 Verification narrative corrected.** The original Phase-22 closure narrative (CHANGELOG history + `.planning/phases/22-.../22-04-SUMMARY.md`) cited "1837 pass / 3 fail / 2 skip of 1842". Per COUNCIL-2026-05-09-003 DIS-001 audit, the live counts at Phase-22 closure were **1842 total / 1836 pass / 4 fail (TAP summary) / 6 distinct ✖ / 2 skip**.

The 6 distinct failures: What's Next 1-6 entries; check-command-budgets exit 0; CMD-03 1800-word budget; drift-record-additivity Test 4 (drift.json length=11); dist03-changelog [0.1.0] Schema migration; dist03-changelog package.json version match.

Phase 23 closes all 6 (DEC-004 closes #1-3; DEC-002 closes #4; DEC-008 closes #5+#6). The under-count cited only the TAP summary parent-test counter and missed 2 failures hidden in nested suites that surface only in the human-readable `failing tests:` block. The lesson — captured as OPEN-007 in COUNCIL-2026-05-10-001 — is that the obd-verifier checklist must re-run `pnpm test` against the live commit before signing off and must read both the TAP summary AND the per-failure `failing tests:` lines.

## COUNCIL-2026-05-10-001 / DEC-001 — Release readiness CONDITIONAL-GO + 4-condition fixpack

The Release Readiness council (2026-05-10) ratified CONDITIONAL-GO on cutting v2.0.0 with a 4-condition pre-tag fixpack (DEC-002 schema discipline, DEC-003 issue-status closure, DEC-004 CHANGELOG word budget, DEC-005 CHANGELOG release-cut Option A). Live test counts at council convening — `1877 / 1875 pass / 0 fail / 2 skip` — matched the Phase-23 CHANGELOG narrative byte-for-byte; audit-honesty held.

The council also surfaced 3 prompt-side errors that the orchestrator caught only because personas re-verified independently: (1) the prompt asserted `validate-workspace exits 0 confirmed` when in fact it exits 1 with 2 errors + 7 warnings (a `tail -15` pipe in the orchestrator's verification step had masked the real exit code); (2) the prompt asserted ISSUE-038..045 were `5×high / 3×medium` when on-disk severities were `3×high / 4×medium / 1×low`; (3) the prompt referenced "ISSUE-082 release.yml sigstore" — no on-disk issue exists; the real release.yml predecessor was ISSUE-011 closed Phase 12-01. All three were captured as DIS-005 + DEC-007 process-improvement; carried forward as OPEN-006 ("orchestrator MUST re-verify prompt evidence before sub-agent spawn").

## OPEN questions carried forward — closed by Quick 260510-rfp follow-up

- **OPEN-006 (CLOSED 2026-05-10):** Pre-spawn prompt-evidence verification — `.testatlas/reference/council-protocol.md` §7.5 now requires the orchestrator to stat-and-grep every issue ID, count, version reference, and script path cited in `prompt.md` BEFORE spawning rounds 2-3 personas. Pinned by `test/reference/council-protocol-prompt-evidence-verification.test.js` (7 tests, all GREEN).
- **OPEN-007 (CLOSED 2026-05-10):** Issue-status closure parity check — `~/.claude/agents/obd-verifier.md` Step 6d now adds a generic "Issue-Status Closure Parity" gap-detection rule that walks SUMMARY/CHANGELOG for `ISSUE-NNNN` citations and verifies the corresponding sidecar's status field transitioned to `closed` (or `wont_fix`). Pinned in TestAtlas by `test/brain/changelog-issue-status-parity.test.js` (2 tests, both GREEN; gracefully skip on fresh-checkout where `_testatlas/` is absent). This check would have caught the 8 ISSUE-038..045 lifecycle gap at Phase-23 closure instead of post-hoc at COUNCIL-2026-05-10-001.

---

*Source-of-truth links:*
- `_testatlas/agents/councils/sessions/COUNCIL-2026-05-09-003/consolidation.{md,json}` — Phase-22 audit
- `_testatlas/agents/councils/sessions/COUNCIL-2026-05-10-001/consolidation.{md,json}` — Release-readiness audit
- `.planning/phases/23-*/23-VERIFICATION.md` — Phase-23 30/30 verifier report
