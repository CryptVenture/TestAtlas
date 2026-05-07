# TestAtlas States Map

Human-readable view of `_testatlas/maps/states.json`. Catalogs every observed PRD §13.1 lifecycle state per component / surface.

> **Updated by:** `/atlas:explore-state` and `/atlas:explore-errors`. **Source:** `states.json`.

## Field reference

| Field | Description |
| --- | --- |
| `state_name` | One of `empty` / `loading` / `error` / `success` / `permission`. |
| `component` | The `COMPONENT-*` ID owning this state. |
| `trigger` | What induces the state (event, route change, network condition). |
| `visual_indicator` | Visible cue announcing the state to the user. |
| `accessibility` | Role + aria-live + evidence path. |
| `evidence` | On-disk evidence paths. |

<!-- TESTATLAS:GENERATED:START section="states" -->
_Generated from `states.json`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="states" -->
