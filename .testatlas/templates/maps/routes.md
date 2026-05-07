# TestAtlas Routes Map

This file is the human-readable view of `_testatlas/maps/routes.json`. The JSON is the source of truth — `routes.md` is regenerated from it by `node scripts/sync-markdown-json.js` (PRD §7.13).

> **Updated by:** `/atlas:explore-routes`. **Validated by:** `node scripts/update-coverage.js --category routes`.

## Field reference (V2 PRD §7.13)

Every entry in `routes[]` carries:

| Field | Description |
| --- | --- |
| `path` | URL path the framework router matches (parameters as `:slug` or `[slug]`). |
| `name` | Human-readable route name (matches the page title or component name). |
| `owning_domain` | The `domain-*` ID this route belongs to. |
| `components` | `COMPONENT-*` IDs rendered when this route is active. |
| `user_purpose` | One-sentence answer to "why does this route exist for the user?". |
| `props` | Props/inputs derived from URL params, query string, post-body, or context. |
| `states` | Observed PRD §13.1 lifecycle states (`empty` / `loading` / `error` / `success` / `permission`). |
| `accessibility` | Role, accessible name, focus-order evidence path. |
| `responsive` | Per-breakpoint screenshots (`375` / `768` / `1280` is the baseline). |
| `observed_behavior` | What actually happens at runtime (verified by the walkthrough). |
| `test_coverage` | Test IDs covering this route + percent line/branch coverage. |
| `evidence` | One or more on-disk evidence paths. |
| `issues` | `ISSUE-*` IDs filed against this route. |
| `confidence` | `low` / `needs-validation` / `medium` / `high` per PRD §13. |

## Generated entries

<!-- TESTATLAS:GENERATED:START section="routes" -->
_The route list is generated from `routes.json` by `sync-markdown-json.js`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="routes" -->
