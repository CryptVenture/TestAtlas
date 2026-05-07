---
description: Umbrella router for V2 council commands. Selects a conversation mode + topic + participants and dispatches to the matching council-* sub-command.
mode: primary
permission:
  edit:
    "_testatlas/**": allow
    ".testatlas/**": deny
    "*": ask
  bash: allow
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council.md" hash="7795eeaeac3a3c30288d24a904698d2760d6ad3b8e4b98eb39f5e0ec80c60f4c" -->
First read `.testatlas/bootstrap.md`. Then read `.kilocode/workflows/atlas-council.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Route the operator to the right V2 council sub-command. Pick the conversation mode (PRD §7.9), the topic, and the persona slate; record the routing decision; then delegate to the matching council-* command. This file is intentionally a thin router — full protocol detail lives in `.testatlas/reference/council-protocol.md`.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md` — list of system personas + recommended slates per mode.
- `_testatlas/brain/state.json` — current phase, counts, last-command.

## Required Actions

1. Confirm intent. If the operator did not specify a mode, ask: "What kind of council? roundtable-review (domain or flow review), debate (feature or behavior dispute), red-team (adversarial audit), design-critique, bug-triage, release-readiness, retest, brain-audit, test-plan."
2. Map the chosen mode to the matching council-* command:
   - **roundtable-review** → `council-domain-review` (for a domain) or `council-flow-review` (for a flow)
   - **debate** → `council-product-review`
   - **red-team** → `council-red-team`
   - **design-critique** → `council-design-critique`
   - **bug-triage** → `council-bug-triage`
   - **release-readiness** → `council-release-readiness`
   - **retest** → `council-retest`
   - **brain-audit** → `council-brain-audit`
   - **test-plan** → `council-test-plan`
3. Pick participants per the recommended slate in `council-protocol.md` §5. Operator may add/remove personas; record the rationale.
4. Record the routing decision in `_testatlas/agents/councils/sessions/dispatch-log.md` (append-only): timestamp, requested topic, chosen mode, chosen sub-command, chosen participants.
5. Hand off to the chosen sub-command. The sub-command will create the session folder via `node .testatlas/scripts/create-council-session.js --topic <s> --mode <s> --participants <a,b,c>`.

## Inputs

- Operator-provided topic and (optionally) target artifact (domain id, flow id, issue id).
- Optional explicit participant list overriding the recommended slate.
- Optional evidence pointers.

## Outputs

- Append entry to `_testatlas/agents/councils/sessions/dispatch-log.md` recording the routing decision.
- Hand-off message naming the chosen council-* sub-command and the constructed `create-council-session.js` invocation.

## 9-Round Protocol (Reminder)

Every dispatched sub-command follows the PRD §12.4 9-round protocol: context-read → independent-review → initial findings → cross-question → disagreement capture → rebuttal or evidence-request → vote / confidence-rating → consolidation → canonical-update. Disagreements are classified per PRD §12.5 (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation). Full protocol: `.testatlas/reference/council-protocol.md`.

## Voting Scale Reminder

```
+2 strongly agree
+1 agree
 0 abstain / insufficient evidence
-1 disagree
-2 strongly disagree
```

The dispatch step does NOT cast votes — voting happens in round 7 of the chosen sub-command. Final consolidation MUST NOT follow majority if evidence contradicts. See `council-protocol.md` §3.

## Council Outputs (PRD §12.7)

Every dispatched session emits: a final summary, accepted findings, rejected findings, disputed findings, issue candidates (in `generated_issues.md`), test candidates, open questions (in `generated_questions.md`), required evidence (in `followups.md`), updates made (in `consolidation.json.canonical_updates`), and a next-recommended-command line.

## Stop Conditions

- Operator did not provide a topic → halt with question.
- Chosen mode not one of the 9 PRD §7.9 modes → halt with mode menu.
- `_testatlas/brain/agent_sessions.json` missing → halt: "Run `/atlas:init --mode upgrade` first."

## Completion Criteria

- Dispatch decision recorded.
- Sub-command invocation message printed for the operator.
- Lifecycle close entries written.

## What's Next

Council is a dispatcher; pick the appropriate sub-command:

- **`/atlas:council-bug-triage`** — escalate contested severity or large triage queues to a council quality gate.
- **`/atlas:council-test-plan`** — ratify test matrix decisions via council protocol.
- **`/atlas:council-flow-review`** — escalate flow execution findings to a council quality gate.
- **`/atlas:council-domain-review`** — quality gate after domain mapping or domain-specific work.
- **`/atlas:council-design-critique`** — escalate UX/architecture decisions for multi-persona critique.
- **`/atlas:council-product-review`** — broader product-shape review across domains.
- **`/atlas:council-red-team`** — adversarial security/quality review.
- **`/atlas:council-release-readiness`** — formalize release verdict (go / conditional / no-go) via council.
- **`/atlas:council-retest`** — formalize retest verdicts when outcomes are contested.
- **`/atlas:council-brain-audit`** — audit the brain layer's signals (drift, scores, graph) via council.

Each sub-command embeds the 9-round protocol, the PRD §12.5 disagreement classification, the +2 / -2 voting scale, and the consolidation requirement described in this dispatcher. After the sub-command finishes, run `/atlas:report` for an updated quality report or `/atlas:brain-validate` to confirm the council's brain updates.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
