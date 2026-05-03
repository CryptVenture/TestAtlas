# Severity Vocabulary

> **When to read this:** You are writing or triaging an issue and need to choose a severity, or you are reviewing an issue and want to confirm the rating fits the rule.

TestAtlas issues are rated on a five-value severity scale per PRD §11. Severity reflects user-visible impact on the application's intended behavior, not implementation difficulty. Implementation cost belongs in remediation notes, never in the severity rating.

### critical

Blocks the core flow for all users: data loss, security breach, payment broken, total unavailability, authentication bypass, exposed secrets. A critical issue MUST stop the release. There is no acceptable workaround that lets the release ship.

### high

Major functionality broken for many users, or one critical workflow degraded: a primary feature unusable on a major platform, broken auth on a non-primary path, severe accessibility violation that locks out a class of users, or a security weakness that requires non-trivial effort to exploit. SHOULD block the release unless a documented mitigation ships alongside.

### medium

Functionality impaired but a workaround exists: confusing copy, sub-optimal layout on smaller breakpoints, error message non-actionable, secondary feature broken, slow-but-not-broken performance. Fix in the current cycle. Does not block release on its own; an accumulation of mediums is itself a high.

### low

Minor or cosmetic: spacing, polish, unclear copy on a marginal path, edge-case empty-state mis-handling, off-by-one in a non-critical counter. Fix when convenient. Never blocks release.

### enhancement

Not a bug; a proposal. Captured for the backlog so that the agent does not silently drop a useful observation. Distinct from defect severities; never blocks release. Use sparingly — most enhancement-class observations belong in `_testatlas/notes/`, not in the issue tracker.

## Disambiguation

When a finding spans two levels (e.g., critical-on-mobile / medium-on-desktop), record the higher value and note the platform breakdown in the issue body. When two reviewers disagree, escalate one level — false-positive cost is lower than false-negative cost for severity-class decisions.

## Schema reference

The five values are enumerated in every issue schema (Phase 2 `issue.schema.json`) and surfaced through `vocabulary.json` (Phase 2). Do not introduce new severity values without a PRD revision; the vocabulary is part of the public contract between the suite and downstream consumers.
