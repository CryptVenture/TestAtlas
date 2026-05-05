# Adapter Owners

TestAtlas v1 ships 18 adapter families that surface the canonical `/atlas:*`
commands inside the major coding-agent hosts. The full roster is enumerated in
[`.testatlas/adapters/`](.testatlas/adapters/) and the capability matrix lives
in [`.testatlas/adapters/adapter-capabilities.json`](.testatlas/adapters/adapter-capabilities.json);
treat those as the source-of-truth — this file describes the maintenance posture
in prose.

This file enforces GOV-03 and the bus-factor mitigation surfaced by
research/PITFALLS.md Pitfall 14 (single-maintainer burnout).

## Bus-Factor Policy (post-v1)

- As of v1, the 18 adapter families are maintained by the core TestAtlas team
  without per-family owners assigned. The `TBD-volunteer-needed` placeholder
  pattern that lived in earlier drafts of this file was retired post-GA — it
  promised what the project could not yet deliver.
- The project SHOULD nominate per-family owners as the community grows; the
  long-term target remains **≥2 maintainers per adapter family** as a bus-factor
  hedge. This is a SHOULD, not a MUST: shipping a high-quality adapter without a
  named external owner is preferable to blocking the surface on volunteer arrival.
- If a named owner becomes inactive (no response within 30 days on adapter-tagged
  issues), the project may temporarily mark the adapter `unmaintained` in
  `adapter-capabilities.json` until a new owner steps up.
- Owners are added/removed via PR to this file with consensus from existing
  maintainers.

## How to Volunteer

If you maintain or use one of the 18 adapter families and want to be listed as
the named owner for it, open a PR adding your GitHub handle and the adapter
family name to a new "Named Owners" section below. By volunteering you agree to:

- Triage issues tagged with the adapter's label within 7 days
- Review PRs that modify the adapter's generated output (visible under
  `.testatlas/adapters/<family>/`)
- Run the adapter parity CI test before approving cross-adapter changes
- Notify the project at least 30 days before stepping down

## Adapter Families (v1 roster)

The 18 adapter families shipped in v1, in `.testatlas/adapters/` directory order:

| Adapter Family   | Status | Named Owner | Notes |
|------------------|--------|-------------|-------|
| Claude Code      | active | _unassigned_ | Canonical adapter; reference output for parity. |
| Cursor           | active | _unassigned_ | `.cursor/rules` integration. |
| Aider            | active | _unassigned_ | Convention-file integration; concatenated render. |
| KiloCode         | active | _unassigned_ | `.kilocode/workflows/` integration. |
| OpenCode         | active | _unassigned_ | OpenCode command configuration model. |
| MCP              | active | _unassigned_ | Any MCP-enabled environment. |
| Generic Prompt   | active | _unassigned_ | Paste-able prompts for any agent. |
| Codex (OpenAI)   | active | _unassigned_ | `.codex/prompts/` integration. |
| Gemini CLI       | active | _unassigned_ | `.gemini/commands/` (TOML) integration. |
| Cline            | active | _unassigned_ | `.clinerules/workflows/` integration. |
| Windsurf         | active | _unassigned_ | Windsurf workflows integration. |
| Kiro             | active | _unassigned_ | Kiro adapter integration. |
| Continue.dev     | active | _unassigned_ | `.continue/prompts/` integration. |
| GitHub Copilot   | active | _unassigned_ | Copilot prompt integration. |
| Sourcegraph Amp  | active | _unassigned_ | Amp adapter integration. |
| Roo Code         | active | _unassigned_ | `.roo/rules/` (concatenated) integration. |
| Zed              | active | _unassigned_ | `.rules` (concatenated) integration. |
| Amazon Q         | active | _unassigned_ | `.amazonq/rules/` (concatenated) integration. |

_All 18 rows are `_unassigned_` as of v1 GA — see Bus-Factor Policy above. Open
a PR replacing `_unassigned_` with your GitHub handle to volunteer for any
adapter family._

## Cross-Adapter Changes

Changes that touch the canonical command spec (which regenerates all 18 adapter
families via `scripts/assemble-adapter.js`) require approval from at least 3
different reviewers (per repo CODEOWNERS or PR review settings) to ensure no
single adapter regresses.
