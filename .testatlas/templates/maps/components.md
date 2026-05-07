# TestAtlas Components Map

Human-readable view of `_testatlas/maps/components.json`. Per PRD §7.13.

> **Updated by:** `/atlas:explore-components`. **Source:** `components.json`.

## Field reference

| Field | Description |
| --- | --- |
| `name` | Component name (PascalCase as exported from source). |
| `type` | `presentational` / `container` / `layout` / `provider` / `hook`. |
| `owning_domain` | The `domain-*` ID this component belongs to. |
| `routes_using` | URL paths where the component renders. |
| `props` | Prop signature: `{ name, type, required }` per prop. |
| `states` | Observed PRD §13.1 lifecycle states this component handles. |
| `accessibility` | Role, accessible-name pattern, focus-order evidence. |
| `responsive` | Per-breakpoint screenshots (`375` / `768` / `1280`). |
| `observed_behavior` | What the component does at runtime (verified). |
| `test_coverage` | Test IDs + percent. |
| `evidence` | On-disk evidence paths. |
| `issues` | `ISSUE-*` IDs filed against this component. |
| `confidence` | `low` / `needs-validation` / `medium` / `high`. |

<!-- TESTATLAS:GENERATED:START section="components" -->
_Generated from `components.json`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="components" -->
