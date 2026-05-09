# TestAtlas V2 Workspace Structure

TestAtlas v2.0.0 introduces a structured **brain** — a set of JSON indexes under `_testatlas/brain/` that give the agent a machine-readable, queryable view of everything it has learned about the product. The brain is populated by commands, read by other commands, and validated by `validate-workspace`.

This document describes every file the V2 workspace creates, what schema governs it, and which commands read or write it.

---

## Overview

A fresh V2 workspace (`/atlas:core-init`) creates the V1 canonical files (overview, system map, execution status, etc.) **plus** the following V2-only trees:

| Tree | Purpose | Schema |
|------|---------|--------|
| `_testatlas/brain/` | 16 JSON indexes — the "brain" | See per-file below |
| `_testatlas/agents/` | Personas and council templates | `persona.schema.json`, `council_session.schema.json` |
| `_testatlas/maps/` | Surface-type map templates (runtime copies) | Per-map JSON schemas |
| `_testatlas/reports/` | Machine-readable report exports | `dashboard_data.schema.json`, `report.schema.json` |

The V1→V2 migration (`/atlas:maintain-migrate` or `node scripts/v2-migrate.js`) backfills the brain from an existing V1 workspace by scanning the markdown artifacts and populating the JSON indexes.

---

## The Brain Tree (`_testatlas/brain/`)

Every brain file declares `"schema_version": "2.0.0"` and a `last_updated` ISO-8601 timestamp. Files are created empty (seed arrays/objects) on init and populated by command execution.

### Core index files

| File | Schema | Written by | Read by |
|------|--------|-----------|---------|
| `manifest.json` | `manifest.schema.json` | `/atlas:core-init` | All commands |
| `state.json` | `state.schema.json` | `/atlas:core-init`, `/atlas:core-status` | `/atlas:core-status`, dashboard |
| `domains.json` | `domain.schema.json` | `/atlas:map-domains` | `/atlas:brain-query`, reports |
| `flows.json` | `flow.schema.json` | `/atlas:plan`, flow explorers | `/atlas:test-flow`, `/atlas:brain-drift` |
| `routes.json` | `route.schema.json` | `/atlas:explore-routes` | `/atlas:explore-routes`, coverage |
| `components.json` | `component.schema.json` | `/atlas:explore-components` | `/atlas:explore-components`, coverage |
| `commands.json` | `cli-command.schema.json` | `/atlas:explore-cli` | `/atlas:explore-cli`, coverage |
| `personas.json` | `persona.schema.json` | `/atlas:create-persona` | Council commands |
| `issues.json` | `issue.schema.json` | `/atlas:log-issue` | `/atlas:triage`, `/atlas:report` |
| `evidence.json` | `evidence.schema.json` | All test/execute commands | `/atlas:report`, validate |
| `risks.json` | `risk.schema.json` | `/atlas:plan`, `/atlas:explore-security` | `/atlas:report-release` |
| `assumptions.json` | `assumption.schema.json` | `/atlas:plan` | `/atlas:consolidate`, reports |
| `open_questions.json` | `assumption.schema.json` | `/atlas:explore` | `/atlas:plan` |
| `decisions.json` | `decision.schema.json` | Council commands | `/atlas:report-release` |
| `coverage.json` | `coverage.schema.json` | `scripts/update-coverage.js` (test-flow + test-domain lifecycles invoke it) | `/atlas:brain-score`, dashboard |
| `quality_scores.json` | `quality_score.schema.json` | `/atlas:brain-score` | `/atlas:report-release`, dashboard |
| `agent_sessions.json` | `event.schema.json` | `/atlas:core-init` | Audit, drift detection |

### Cross-references

Brain files are not isolated. A `flow` in `flows.json` references a `domain` by `domain_id`; an `issue` in `issues.json` references `evidence` by `evidence_id`. The graph of relationships is materialised in `_testatlas/brain/graph.json` (schema: `relationship.schema.json`) with 16 PRD-mandated relationship types (e.g. `flow_belongs_to_domain`, `issue_blocks_flow`, `evidence_supports_claim`).

---

## The Agents Tree (`_testatlas/agents/`)

Populated by `copyV2Artifacts` during init/migration from the suite source tree.

```
_testatlas/agents/
  personas/
    system/
      accessibility-reviewer.{md,json}
      adversarial-red-team-tester.{md,json}
      api-contract-analyst.{md,json}
      automation-engineer.{md,json}
      codebase-mapper.{md,json}
      data-steward.{md,json}
      documentation-curator.{md,json}
      performance-skeptic.{md,json}
      product-strategist.{md,json}
      qa-lead.{md,json}
      release-readiness-judge.{md,json}
      runtime-investigator.{md,json}
      security-privacy-reviewer.{md,json}
      user-advocate.{md,json}
  councils/
    council_templates/
      brain-audit.json
      bug-triage.json
      domain-review.json
      red-team.json
      release-readiness.json
  registry.md          # Human-readable index of all personas + councils
  registry.json        # Machine-readable index with IDs
```

- **Personas** are `{.md,.json}` pairs. The `.md` is human-readable instructions; the `.json` is the machine-readable schema-validated persona record.
- **Council templates** are `.json` files defining the topic, scope, required participants, and decision criteria for a council session.
- **Registry** files are auto-populated by scanning the `personas/` and `councils/` trees.

See [docs/PERSONAS_AND_COUNCILS.md](./PERSONAS_AND_COUNCILS.md) for the full persona/council usage guide.

---

## The Maps Tree (`_testatlas/maps/`)

Map templates are canonical V2 surface-type inventories. Each map has a `.json` source and a `.md` human-readable view. Templates ship in `.testatlas/templates/maps/` and are copied to `_testatlas/maps/` on init.

| Map | Surface type | Written by |
|-----|-------------|-----------|
| `routes.json` / `routes.md` | Routes/pages | `/atlas:explore-routes` |
| `pages.json` / `pages.md` | Page-level inventory | `/atlas:explore-ui` |
| `components.json` / `components.md` | UI components | `/atlas:explore-components` |
| `states.json` / `states.md` | UI states (empty/loading/error/success/permission) | `/atlas:explore-state` |
| `endpoints.json` / `endpoints.md` | API endpoints | `/atlas:explore-api` |
| `jobs.json` / `jobs.md` | Background jobs | `/atlas:explore-jobs` |
| `cli_commands.json` / `cli_commands.md` | CLI commands | `/atlas:explore-cli` |
| `integrations.json` / `integrations.md` | Third-party integrations | `/atlas:explore-integrations` |

The `.json` file is the source of truth; the `.md` file is regenerated from it by `sync-markdown-json`.

---

## The Reports Tree (`_testatlas/reports/`)

| File | Produced by | Purpose |
|------|-------------|---------|
| `REPORT-latest.md` | `/atlas:report` | Human-readable quality rollup |
| `dashboard-data.json` | `/atlas:report-dashboard-data` | Machine-readable dashboard export |
| `domain-<slug>.md` | `/atlas:report-domain` | Per-domain quality report |
| `release_readiness.md` | `/atlas:report-release` | Go/no-go assessment |

---

## Validation

Run `/atlas:validate-workspace` (or `node scripts/validate-workspace.js`) to schema-validate every brain file, every map, and every report against their governing JSON Schema. The validator:

1. Loads all 39 schemas into AJV.
2. Validates every `.json` file under `_testatlas/brain/`.
3. Checks cross-references (e.g. `issue.flow` must resolve to an entry in `flows.json`).
4. Reports orphaned evidence and dangling references.

---

## Migration from V1

If you have a V1 workspace (pre-v2.0.0), run:

```
/atlas:maintain-migrate
```

This:
1. Reads your existing `_testatlas/` markdown artifacts.
2. Creates the V2 brain skeleton.
3. Populates brain JSON from markdown (e.g. scans `to_fix/` → `issues.json`).
4. Copies personas, councils, and map templates from `.testatlas/`.
5. Writes a V2 manifest and updates the workspace version.

The migration is idempotent — re-running converges to the same state.

---

## See Also

- [docs/PERSONAS_AND_COUNCILS.md](./PERSONAS_AND_COUNCILS.md) — Persona and council usage guide
- [docs/GETTING_STARTED.md](./GETTING_STARTED.md) — V2 happy path walkthrough
- [docs/COMMANDS.md](./COMMANDS.md) — Full command reference
- [docs/SCHEMAS.md](./SCHEMAS.md) — Schema reference
