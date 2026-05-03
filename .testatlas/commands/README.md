# TestAtlas Command Surface

This directory holds the canonical command instruction files agents read before executing any TestAtlas command. Every command file has YAML frontmatter validated against `../schemas/command-instruction.schema.json`, embeds the PRD §38 bootstrap-first preamble, and stays under the 1500-word budget enforced by `scripts/check-command-budgets.js`.

## Phase 3 dogfood-loop commands (9 of 26)

| Command | Purpose |
|---------|---------|
| `init.md` | Bootstrap the `_testatlas/` workspace and seed lifecycle artifacts. |
| `bootstrap.md` | Refresh the agent's constitution and config understanding. |
| `validate-workspace.md` | Schema-validate workspace state (PRD §33; runtime in Phase 5). |
| `explore-codebase.md` | Map languages, frameworks, routes, and integrations into the app-map. |
| `map-domains.md` | Distill the app-map into per-domain artifacts under `domains/`. |
| `plan.md` | Generate a risk-based test strategy and matrix from domain artifacts. |
| `test-flow.md` | Execute scenarios; capture evidence; emit `RUN-*` artifacts. |
| `log-issue.md` | Capture findings under `to_fix/` per PRD §17. |
| `report.md` | Aggregate runs and issues into `REPORT-latest.md` (PRD §20). |

## PRD §35 reconciliation (partial-acceptance posture)

PRD §35 (MVP) lists 11 commands. This phase ships **9 of those 11**: the dogfood-loop subset that closes "map → plan → test → log → report → validate" without explorer breadth. The remaining commands — `explore` (umbrella), `explore-ui`, `explore-cli`, and `retest` — ship in Phase 4 alongside the rest of the 26-file CMD-01 surface (per `.planning/REQUIREMENTS.md`).

CMD-01 therefore remains PENDING until Phase 4 closes; CMD-02..05 are SATISFIED for the 9-file subset shipped here. See `../../.planning/phases/03-core-command-surface-minimum-dogfood-loop/03-RESEARCH.md` §"PRD §35 Reconciliation" for the authoritative discrepancy table.

Adapter-specific shims (`.claude/commands/atlas-*.md`, equivalents for OpenCode / KiloCode / Cursor / Aider) ship in Phase 6 and are NOT located here.

This README is intentionally excluded from `listCommandFiles()` enumeration (see `scripts/lib/list-command-files.js`), so it does not count toward the 9-file roster nor the per-command word budget.
