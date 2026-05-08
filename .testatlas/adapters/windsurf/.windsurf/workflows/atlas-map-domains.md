---
description: Distill the app-map into per-domain functional models under _testatlas/domains/<slug>/, where each domain owns a coherent set of routes, APIs, components, jobs, and integrations per PRD §15.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/map-domains.md" hash="9775d8b7dfb70db02698c59b22b7a31bc9c82d56261ed424f999f32cb4f2bf0e" -->
First read `.testatlas/bootstrap.md`. Then read `.windsurf/workflows/atlas-map-domains.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Distill `_testatlas/12_app_map.json` (from `explore-codebase`) into per-domain functional models under `_testatlas/domains/<slug>/`, where each domain owns a coherent set of routes, APIs, components, jobs, and integrations per PRD §15. Domains are the unit of test planning, coverage, and reporting; their boundaries must be evidence-derived from the app-map, never invented.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §8 (no-evidence-no-finding) and §4 (capability degradation).
- `_testatlas/12_app_map.json` — REQUIRED. If missing, halt with `Run /atlas:explore-codebase first.`
- `.testatlas/schemas/domain.schema.json` — required JSON shape this command must satisfy for each domain sidecar.
- `.testatlas/schemas/vocabulary.schema.json` — `domainId` pattern (kebab-case slug rules per PRD §32).
- `_testatlas/01_system_map.md` — domain-inventory stub written by `explore-codebase`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Read `_testatlas/12_app_map.json`. Cluster entries (routes, APIs, components, jobs, integrations) into coherent domains based on URL path prefixes, file-system locality, naming conventions, and observed cross-references between handlers and modules. Prefer over-clustering (more, smaller domains) to under-clustering (one mega-domain) — fragmenting later is cheaper than splitting.
3. For each cluster, propose a kebab-case `domainId` per PRD §32 and the `domainId` pattern in `vocabulary.schema.json`. Names should describe a user-visible capability (`billing`, `account-settings`, `search`) rather than an internal module (`util-helpers`).
4. For each domain, write the per-domain artifact set `_testatlas/domains/<slug>/{domain.json, index.md, issues/index.md}` per PRD §15. The `domain.json` validates against `domain.schema.json` (closed under `additionalProperties:false`) and carries the schema-required fields: `id`, `name`, `displayName`, `status`, `confidence`, `purpose`, `primaryUserGoals`, `personas`, `entryPoints`, `routes` (PAGE-IDs), `apis` (API-IDs), `components` (COMPONENT-IDs), `entities` (strings), `flows` (FLOW-IDs, initially empty — populated later by `map-flows`), `dependencies`, `issues` (ISSUE-IDs), `evidence` (EVIDENCE-IDs), `openQuestions`, `lastUpdatedAt`. Job and integration ownership is NOT a top-level field on `domain.json` — those mappings live in the entries themselves on `12_app_map.json` (or in the system-map narrative). `index.md` is the human entry-point narrative; `issues/index.md` is the per-domain issue rollup populated as `/atlas:log-issue` runs.
   - **Preferred path (if `shell` is available):** for each clustered domain, run `node .testatlas/scripts/create-domain.js --name "<human-readable name>" --purpose "<one-line purpose>" [--workspace <p>]`. The script slugifies the name per PRD §32, AJV-validates against `domain.schema.json`, emits the three required files (`domain.json`, `index.md`, `issues/index.md`), and increments `counts.domains` in the manifest. Populate ownership claims (routes/apis/components/entities/flows) by appending to the emitted `domain.json` arrays — only those five keys are schema-allowed for ownership. **Manual path (no `shell`):** hand-author the three files following `domain.schema.json` for the JSON sidecar and the suite's `index.md` / `issues/index.md` shapes.
5. For every ownership claim (this domain owns this route / API / component / job / integration), cite the originating `12_app_map.json` entry by stable identifier. The app-map entry itself already references an evidence path under `_testatlas/evidence/explore-codebase/<timestamp>/`; preserve that chain so `validate-workspace` can verify it.
6. Update `_testatlas/01_system_map.md` per-domain index: list each domain with its slug, one-line description, and counts (routes / APIs / components / jobs / integrations).
   - **Preferred path (if `shell` is available):** run `node .testatlas/scripts/sync-system-map.js [--workspace <p>]` to regenerate `01_system_map.md`'s `source-references` + `domain-index` sections from on-disk evidence + `domains/*/domain.json`. The script also refreshes `manifest.generatedSections['01_system_map.md']` hashes in lockstep.
7. If `12_app_map.json` is sparse — fewer than ~10 entries total, or if `explore-codebase` ran with `confidence: needs-validation` — MUST mark every produced domain `confidence: needs-validation` and surface the gap in `_testatlas/12_gaps.md` so the operator knows to re-run `explore-codebase` with shell available.
8. Validate every domain JSON against `domain.schema.json` before closing. If any sidecar fails validation, halt — do not partially commit a domain set.
9. Close the lifecycle (next section).

## Outputs

- Per-domain artifact set `_testatlas/domains/<slug>/{domain.json, index.md, issues/index.md}` per PRD §15 — `domain.json` validates against `domain.schema.json`; `index.md` is the human entry-point narrative; `issues/index.md` is the per-domain issue rollup.
- Updated `_testatlas/01_system_map.md` — per-domain index with slug, description, counts.
- Updated `_testatlas/12_gaps.md` if any domains were forced to `confidence: needs-validation` (sparse map or unresolved cluster ambiguity).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record domain count and any gaps surfaced.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (every new `domains/<slug>/` pair must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; set `counts.domains` to the new total.
- `_testatlas/history/run_log.md` — narrative entry: "Distilled `<n>` domains from `12_app_map.json`."

## Stop Conditions

- `_testatlas/12_app_map.json` missing → halt; "Run /atlas:explore-codebase first." Do not invent a domain set.
- A single app-map entry could fit three or more domains with equal weight → leave that entry unassigned and log it under `12_gaps.md` rather than guessing.
- `domain.schema.json` validation fails on any produced sidecar → halt; do not commit a partial / malformed domain set.

## Completion Criteria

- At least one `_testatlas/domains/<slug>/domain.{md,json}` pair exists, or there is an unambiguous justification for zero domains recorded in `12_gaps.md`.
- Every domain claim cites the originating app-map entry, preserving the evidence chain back to `_testatlas/evidence/explore-codebase/`.
- Every domain JSON validates against `domain.schema.json`.
- Manifest `counts.domains` matches the on-disk domain count.
- The five lifecycle files listed above are updated.

## What's Next

Now that the domains are distilled:

- **`/atlas:plan`** — turn the domain set into a test plan with risk-prioritised charters
- **`/atlas:explore`** — return to discovery if any domain is missing app-map coverage
- **`/atlas:council-domain-review`** — quality gate after domain mapping; flags contested boundary calls.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
