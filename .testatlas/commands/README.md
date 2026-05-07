# TestAtlas Command Surface

This directory holds the canonical command instruction files agents read before executing any TestAtlas command. Every command file has YAML frontmatter validated against `../schemas/command-instruction.schema.json`, embeds the PRD §38 bootstrap-first preamble, and stays under the 1800-word budget enforced by `scripts/check-command-budgets.js`.

## Atlas command surface (post-GA, full roster)

The full 32-file `/atlas:*` command surface ships in v1 GA. The dogfood-loop core (the 9 commands that close "map → plan → test → log → report → validate") is supplemented by the 11-file explore family (umbrella + sub-explorers), the 5-file specialized-test family (umbrella + 4 modes), and the lifecycle/utility commands (triage, retest, consolidate, handoff, cleanup, update, uninstall). The authoritative roster is the on-disk listing of `.testatlas/commands/*.md` (excluding this README); for a one-line-per-command index see `../../docs/COMMANDS.md`, which is regenerated from source by `scripts/generate-commands-doc.js`.

| Group | Commands |
|-------|----------|
| Dogfood loop (9) | `core/init.md`, `bootstrap.md`, `validate-workspace.md`, `explore-codebase.md`, `map-domains.md`, `plan.md`, `test-flow.md`, `log-issue.md`, `report.md` |
| Explore family (11) | `explore.md` (umbrella) + `explore-ui.md`, `explore-cli.md`, `explore-api.md`, `explore-data.md`, `explore-runtime.md`, `explore-integrations.md`, `explore-security.md`, `explore-performance.md`, `explore-accessibility.md`, `explore-docs.md` |
| Specialized testing (5) | `test-all.md` (umbrella) + `test-domain.md`, `test-regression.md`, `test-performance.md`, `test-accessibility.md` |
| Lifecycle / utilities (7) | `triage.md`, `retest.md`, `consolidate.md`, `handoff.md`, `cleanup.md`, `update.md`, `uninstall.md` |

Adapter-specific shims (`.claude/commands/atlas-*.md` and equivalents for the 18 supported adapter families) live under `../adapters/` and are regenerated from these canonical files by `scripts/assemble-adapter.js`. CMD-01..CMD-05 are SATISFIED across the full surface.

This README is intentionally excluded from `listCommandFiles()` enumeration (see `scripts/lib/list-command-files.js`), so it does not count toward the 32-file roster nor the per-command word budget.
