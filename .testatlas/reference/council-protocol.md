# TestAtlas Council Protocol Reference

> **Purpose:** Single canonical reference for V2 council orchestration. Every
> `.testatlas/commands/council/*.md` command links here for full protocol
> detail so command files can stay short (≤1800 words).
>
> **PRD anchors:** §7.6 (council system), §7.7 (persona format), §7.8 (session
> artifacts), §7.9 (conversation modes), §7.10 (transcript + claims), §7.11
> (consolidation), §12.1–12.7 (orchestrator role + voting + outputs).

## 1. The 9-Round Protocol (PRD §12.4)

Every council session follows these rounds in order. The orchestrator may
collapse rounds when there is nothing to record (e.g. no disagreement → skip
rebuttal), but must never skip a round that produced content.

1. **Context read.** Each persona reads `prompt.md` + `context_bundle.md`
   plus its own `read_first` allow-list. No outputs yet.
2. **Independent review.** Each persona inspects the in-scope artifacts
   (domain, flow, brain JSON slice, evidence) without seeing other personas'
   findings.
3. **Initial findings.** Each persona writes its findings to
   `outputs/<persona-id>-output.{md,json}` and emits transcript messages of
   `message_type: "finding"`.
4. **Cross-questioning.** Personas pose questions to each other via transcript
   `message_type: "question"`. The orchestrator may surface gaps.
5. **Disagreement capture.** Conflicts that resist cross-questioning are
   recorded in `disagreements.md` with the PRD §12.5 type taxonomy below.
6. **Rebuttal or evidence request.** Each persona may post a rebuttal
   (`message_type: "rebuttal"`) or request additional evidence
   (`message_type: "evidence_request"`).
7. **Vote / confidence rating.** For each motion the orchestrator surfaces,
   each persona casts a vote on the +2 / -2 scale (§3 below).
8. **Consolidation.** The Documentation Curator (or the persona designated as
   moderator) drafts `consolidation.{md,json}` with accepted, rejected, and
   disputed claims.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js
   --session-id <id>` to apply accepted findings to canonical docs and brain
   indexes; record `followups.md`.

## 2. Disagreement Classification (PRD §12.5)

Every disagreement recorded in `disagreements.md` MUST carry one of these
eight types:

| Type | Use when |
|------|----------|
| `factual` | Personas dispute what the evidence shows. |
| `expected_behavior` | Personas dispute what the system *should* do. |
| `severity` | Personas dispute how bad an issue is. |
| `priority` | Personas dispute the order of remediation. |
| `evidence_sufficiency` | Personas dispute whether the evidence is enough to assert. |
| `product_strategy` | Personas dispute the product direction implied by a claim. |
| `safety` | Personas dispute whether an action is safe to take. |
| `implementation_interpretation` | Personas dispute what code-as-written actually does. |

Each disagreement record carries: `participants`, `positions`, `evidence`,
`resolution_status` (`open|resolved|deferred`), `decision_owner`, `next_action`.

## 3. Voting Scale (PRD §12.6)

```text
+2 strongly agree
+1 agree
 0 abstain / insufficient evidence
-1 disagree
-2 strongly disagree
```

**Decision rule:** Final consolidation MUST NOT simply follow majority vote
if evidence contradicts the majority. Document evidence-driven dissent in
`consolidation.md`.

## 4. Council Outputs (PRD §12.7)

Every council session must emit:

1. Final summary (in `consolidation.md`).
2. Accepted findings (in `consolidation.json.accepted_claims`).
3. Rejected findings (in `consolidation.json.rejected_claims`).
4. Disputed findings (in `consolidation.json.disputed_claims`).
5. Issue candidates (in `generated_issues.md`).
6. Test candidates (in `consolidation.json.test_candidates`).
7. Open questions (in `generated_questions.md`).
8. Required evidence (in `followups.md`).
9. Updates made (in `consolidation.json.canonical_updates`).
10. Next recommended command (in `consolidation.md` final section).

## 5. Conversation Modes (PRD §7.9)

| Mode | Command | Recommended slate |
|------|---------|-------------------|
| Roundtable Review | `council-domain-review`, `council-flow-review` | All available, weighted to domain |
| Debate | `council-product-review` | Product Strategist, QA Lead, User Advocate, Adversarial Red Team Tester |
| Red Team Challenge | `council-red-team` | Adversarial Red Team Tester, Security and Privacy Reviewer, QA Lead |
| Design Critique | `council-design-critique` | Product Strategist, User Advocate, Accessibility Reviewer |
| Bug Triage Council | `council-bug-triage` | QA Lead, Security and Privacy Reviewer, Performance Skeptic, Release Readiness Judge |
| Test Plan Council | `council-test-plan` | QA Lead, Automation Engineer, Codebase Mapper, Data Steward, Runtime Investigator |
| Retest Council | `council-retest` | QA Lead, Automation Engineer, Adversarial Red Team Tester |
| Brain Audit Council | `council-brain-audit` | Documentation Curator, Codebase Mapper, Adversarial Red Team Tester |
| Release Readiness | `council-release-readiness` | Release Readiness Judge, QA Lead, Security and Privacy Reviewer, Documentation Curator |

## 6. Session Lifecycle Files (PRD §7.8)

```text
_testatlas/agents/councils/sessions/COUNCIL-<id>/
  session.md            # human-readable session metadata
  session.json          # machine-readable; validates against council_session.schema.json
  prompt.md             # canonical prompt sent to all participants
  context_bundle.md     # bootstrap + domain/flow/evidence context
  participants.json     # persona ids + roles + joined_at
  transcript.jsonl      # structured messages; each line validates transcript.schema.json
  transcript.md         # human-readable rendering of the transcript
  claims.jsonl          # extracted claims; each line validates claim.schema.json
  disagreements.md      # PRD §12.5 disagreement records
  votes.json            # motion → vote records
  consolidation.md      # final consolidation narrative
  consolidation.json    # structured consolidation outputs
  followups.md          # action items / required evidence
  generated_issues.md   # issue candidates surfaced by the council
  generated_flows.md    # flow proposals surfaced by the council
  generated_questions.md  # open questions deferred to followups
  outputs/<persona-id>-output.{md,json}  # per-persona outputs
```

## 7. Sub-Agent Orchestration & Orchestrator Responsibilities (PRD §12.1)

The 9-round protocol above uses sub-agent spawning ONLY for rounds 2 and 3 (Independent
review + Initial findings). Rounds 1, 4, 5, 6, 7, 8, and 9 run inline because they
require shared transcript visibility (cross-questioning, disagreement capture, voting,
consolidation, and canonical-doc updates are single-author syntheses by design).

### §7.1 — Capability detection (pre-round-2 named step)

Before round 2 begins, each council-* command consults the 18-adapter capability matrix
in `commands/bootstrap.md` lines 70-89. If the host adapter declares `subagent-spawn`
(the 9 spawn-capable adapters: claude-code, opencode, kilocode, codex, gemini-cli,
github-copilot, cline, kiro, sourcegraph-amp), rounds 2 and 3 spawn ONE child per
`participants[]` entry. If the host LACKS `subagent-spawn` (the 9 no-spawn adapters:
cursor, zed, windsurf, aider, continue-dev, roo-code, amazon-q, mcp:default,
generic:default), the council runs `inline-simulation` mode — one process role-plays
each persona in turn — preserving full backward compatibility with pre-Phase-21
sessions. This capability-detection step is named `Pre-2: Detect subagent-spawn
capability` and runs immediately after round 1 completes.

### §7.2 — executionMode enum

Each session.json records exactly one `executionMode` from this 6-value enum:

| Value | When |
|-------|------|
| `parallel-subagents`   | Host has `subagent-spawn` AND participants ≥ 2 AND all spawns succeeded |
| `single-spawn-inline`  | Host has `subagent-spawn` AND participants === 1 (degenerate; ran inline) |
| `sequential-fallback`  | Host has `subagent-spawn` BUT one or more spawns failed; ran serially |
| `classify-only`        | Topic classified; participants === 0; no rounds executed |
| `inline-simulation`    | Host LACKS `subagent-spawn`; one process role-played N personas (Phase-21 default) |
| `no-op`                | Host has `subagent-spawn` but threshold guard tripped (participants < 2) |

### §7.3 — Per-round mode table

| Round | Name              | Mode    | Why |
|-------|-------------------|---------|-----|
| 1     | Context read      | INLINE  | Bootstrap shared context — no per-persona artifact |
| 2     | Independent review| SPAWN   | Independence is the cognitive contract; one child per persona |
| 3     | Initial findings  | SPAWN   | Same child as round 2; emits outputs/<persona-id>-output.{md,json} |
| 4     | Cross-questioning | INLINE  | Questions reference others' findings — shared context required |
| 5     | Disagreement capture | INLINE | Multi-persona synthesis — orchestrator-only |
| 6     | Rebuttal / evidence | INLINE | Same as round 4 — shared context required |
| 7     | Vote / confidence | INLINE  | Tabulation step — no new reasoning needed |
| 8     | Consolidation     | INLINE  | Single-author doc draft via consolidate-council.js |
| 9     | Canonical updates | INLINE  | brain-sync hook fires here via consolidate-council.js |

### §7.4 — Threshold guard

If `participants.length < 2`, run all 9 rounds inline regardless of host capability
(degenerate single-spawn = wasted overhead). Record `single-spawn-inline` (1 participant)
or `no-op` (0 participants).

### §7.5 — Orchestrator Responsibilities (PRD §12.1)

- Select personas from the `.testatlas/agents/registry.md` slate.
- Build a scoped `context_bundle.md` (see `bundle-context.js`).
- Define explicit scope; prevent uncontrolled writes outside session dir.
- Launch persona turns (true subagents where supported per §7.1, simulated otherwise).
- Append transcript messages with structured metadata.
- Run `extract-claims.js` after each round 3+ to materialize claims.jsonl.
- Resolve contradictions or escalate to disagreements.md.
- Run `consolidate-council.js` at round 8 to produce `followups.md` +
  brain index updates.

## 8. Quoting Modes in Command Frontmatter

Every council command MUST declare its primary mode in frontmatter as
`mode: <mode-id>` where `<mode-id>` is one of:

```text
roundtable-review | debate | red-team | design-critique | bug-triage |
test-plan | retest | brain-audit | release-readiness
```

The umbrella `council` command's frontmatter uses `mode: dispatch` and routes
to the appropriate sub-command based on user intent.

## 9. Safety Constraints (PRD §7.17)

- Personas may write only inside their `may_update` allow-list and the session
  folder. The orchestrator enforces this; consolidation may write to canonical
  docs.
- Destructive actions (delete, drop-database, prod calls) require explicit
  human approval AND `allowDestructiveActions: true` in workspace config.
- Any evidence containing secrets MUST be processed by `redact-evidence.js`
  before inclusion in transcripts or outputs.
