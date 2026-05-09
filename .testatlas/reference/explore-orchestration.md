# Explore — Sub-Agent Orchestration Reference

> Long-form rationale extracted from `.testatlas/commands/explore.md` to satisfy CMD-03 (≤1800 words/command). The umbrella `/atlas:explore` command links here for the per-child brief contract detail.

## Per-child brief contract

When the umbrella `/atlas:explore` spawns a child explorer (e.g., `/atlas:explore-codebase`, `/atlas:explore-state`, `/atlas:explore-routes`), the child receives a 6-field brief that bounds its scope and outputs:

- **objective:** "Map the [domain] surface area of the target product."
- **scope:** "Files and runtime artifacts in scope of the [child] command."
- **files-to-read:** ".testatlas/commands/explore-[child].md plus the product files relevant to [domain]."
- **output-format:** "Structured markdown matching the explore-[domain] finding schema fragment, or JSON if the host prefers; one finding per discovered surface."
- **may-write:** "The child writes only to its own evidence directory `_testatlas/evidence/[child]/[timestamp]/`; the umbrella never grants additional write paths."
- **exit-criteria:** "All scoped surface area enumerated; coverage gaps explicitly listed."

The umbrella does NOT grant write access outside the child's evidence directory. The umbrella aggregates child findings into `_testatlas/02_product_overview.md` and routing decisions into `_testatlas/explore-plan.md` after all children complete.

## See also

- `.testatlas/commands/explore.md` — umbrella command surface
- `.testatlas/reference/council-protocol.md` — sibling pattern for long-form rationale extraction
