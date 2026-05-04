<!-- TestAtlas command: atlas-map-domains. Invoke as /atlas-map-domains.md. Description: Distill the app-map into per-domain functional models under _testatlas/domains/<slug>/, where each domain owns a coherent set of routes, APIs, components, jobs, and integrations per PRD §15. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/map-domains.md" hash="516b35e0aaeeb4ae" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Distill `_testatlas/12_app_map.json` (from `explore-codebase`) into per-domain functional models under `_testatlas/domains/<slug>/`, where each domain owns a coherent set of routes, APIs, components, jobs, and integrations per PRD §15. Domains are the unit of test planning, coverage, and reporting; their boundaries must be evidence-derived from the app-map, never invented.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §8 (no-evidence-no-finding) and §4 (capability degradation).
- `_testatlas/12_app_map.json` — REQUIRED. If missing, halt with `Run /atlas:explore-codebase first.`
- `.testatlas/schemas/domain.schema.json` — required JSON shape this command must satisfy for each domain sidecar.
- `.testatlas/vocabulary.json` — `domainId` pattern (kebab-case slug rules per PRD §32).
- `_testatlas/01_app_inventory.md` — domain-inventory stub written by `explore-codebase`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Read `_testatlas/12_app_map.json`. Cluster entries (routes, APIs, components, jobs, integrations) into coherent domains based on URL path prefixes, file-system locality, naming conventions, and observed cross-references between handlers and modules. Prefer over-clustering (more, smaller domains) to under-clustering (one mega-domain) — fragmenting later is cheaper than splitting.
3. For each cluster, propose a kebab-case `domainId` per PRD §32 and the `domainId` pattern in `vocabulary.json`. Names should describe a user-visible capability (`billing`, `account-settings`, `search`) rather than an internal module (`util-helpers`).
4. For each domain, write the pair `_testatlas/domains/<slug>/domain.md` (markdown narrative) and `_testatlas/domains/<slug>/domain.json` (validates against `domain.schema.json`) per PRD §15. Required content: name, description, owned routes, owned APIs, owned components, owned jobs, owned integrations, related flows (initially empty — populated later by `map-flows`), and per-claim evidence references.
5. For every ownership claim (this domain owns this route / API / component / job / integration), cite the originating `12_app_map.json` entry by stable identifier. The app-map entry itself already references an evidence path under `_testatlas/evidence/explore-codebase/<timestamp>/`; preserve that chain so `validate-workspace` can verify it.
6. Update `_testatlas/01_app_inventory.md` per-domain index: list each domain with its slug, one-line description, and counts (routes / APIs / components / jobs / integrations).
7. If `12_app_map.json` is sparse — fewer than ~10 entries total, or if `explore-codebase` ran with `confidence: needs-validation` — MUST mark every produced domain `confidence: needs-validation` and surface the gap in `_testatlas/12_gaps.md` so the operator knows to re-run `explore-codebase` with shell available.
8. Validate every domain JSON against `domain.schema.json` before closing. If any sidecar fails validation, halt — do not partially commit a domain set.
9. Close the lifecycle (next section).

## Outputs

- One `_testatlas/domains/<slug>/domain.md` + `_testatlas/domains/<slug>/domain.json` pair per domain — schema-valid sidecars per PRD §15.
- Updated `_testatlas/01_app_inventory.md` — per-domain index with slug, description, counts.
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
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
