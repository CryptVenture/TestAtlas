---
scorecard_id: SCORECARD-NNNN
persona_id: <!-- persona-id -->
period_start: <!-- ISO-8601 date -->
period_end: <!-- ISO-8601 date -->
created_at: <!-- ISO-8601 -->
---

# Scorecard: <!-- persona-id -->

> Per-persona performance scorecard. Tracks how often this persona's claims
> survive consolidation, how confident its claims are, and where its blind
> spots show up empirically. Lives at
> `_testatlas/agents/scorecards/<persona-id>-<period>.md`.

## Period

- **Start:** <!-- ISO-8601 date -->
- **End:** <!-- ISO-8601 date -->
- **Sessions evaluated:** <!-- count -->

## Claim Statistics

| Metric | Value |
|--------|-------|
| Total claims | <!-- n --> |
| Accepted (post-consolidation) | <!-- n --> |
| Rejected | <!-- n --> |
| Disputed | <!-- n --> |
| Invalidated by red-team | <!-- n --> |
| Acceptance rate | <!-- n% --> |

## Confidence Calibration

| Confidence asserted | Times correct | Times incorrect | Calibration ratio |
|---------------------|---------------|-----------------|-------------------|
| confirmed | | | |
| strong_suspect | | | |
| needs_validation | | | |

## Disagreement Profile

<!-- Which other personas does this persona most often disagree with, and which disagreement types dominate? -->

| Counter-persona | factual | severity | priority | other | total |
|-----------------|---------|----------|----------|-------|-------|

## Observed Blind Spots

<!-- Empirical observations of where this persona's claims got invalidated.
Use these to refine the persona's `blind_spots` field over time. -->

## Top Contributions

<!-- 3-5 high-impact accepted claims, with citation. -->

## Top Misses

<!-- 3-5 claims that were rejected or invalidated, with rationale. -->

## Recommended Adjustments

<!-- Changes to consider for the persona definition (read_first, default_tools,
blind_spots, questions, output_format) based on this period's data. -->
