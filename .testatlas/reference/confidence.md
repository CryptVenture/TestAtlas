# Confidence Vocabulary

> **When to read this:** You are recording a finding and need to choose a confidence value, or you are reviewing whether a finding's evidence justifies its claimed confidence.

TestAtlas findings carry one of three confidence values. Confidence reflects how strongly the recorded evidence supports the finding's claim — not how strongly the agent feels about it. Internal certainty is not a confidence input; only artifacts on disk are.

### confirmed

Direct evidence reproduces the behavior. A screenshot, network capture, log snippet, or test run shows the failure exactly as described. Another agent or human can replay the steps recorded in the evidence and observe the same result. The evidence file path appears in the finding body and is non-empty.

### strong-suspect

Indirect evidence strongly supports the claim, but the failure has not been directly reproduced. Examples: a code path that demonstrably fails an invariant under static reading; a config value that almost certainly produces the wrong behavior; a pattern that historically causes the bug. The agent records what evidence it does have and explicitly notes what evidence is missing — typically a runtime reproduction.

### needs-validation

The finding is plausible but unverified, OR a required capability was unavailable when validation was attempted. This is the explicit escape hatch for the capability-aware degradation rule (`bootstrap.md` §4 / `reference/capabilities.md`): when an agent cannot test, it MUST emit the finding with `confidence: needs-validation` rather than fabricate evidence. Triage decides whether to dispatch validation, accept the finding as-is, or downgrade.

## Pairing with severity

Severity and confidence are independent dimensions. A `critical / needs-validation` finding (e.g., "this might cause data loss but I could not reproduce it without a database") belongs in the report and triggers triage, not silence. The triage command (Phase 4) is the authority that decides whether to dispatch validation, accept, or downgrade — not the explorer that filed the finding.

## Anti-hallucination contract

The confidence vocabulary exists precisely to make hallucination unprofitable. An agent that lacks evidence for a claim has only two honest moves: omit the claim, or file it with `confidence: needs-validation`. Inflating to `confirmed` without a corresponding evidence file is a contract violation surfaced by `validate-workspace` (Phase 5).

## Schema reference

The three values are enumerated in every issue, evidence, and finding schema. Do not introduce new confidence values without a PRD revision.
