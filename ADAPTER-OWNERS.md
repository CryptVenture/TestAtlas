# Adapter Owners

Each adapter family in TestAtlas has at least one named owner. Owners are responsible
for keeping their adapter in parity with the canonical Claude Code adapter, reviewing
PRs that touch their adapter's generated output, and triaging adapter-specific bug
reports.

This file enforces GOV-03 and the bus-factor mitigation surfaced by
research/PITFALLS.md Pitfall 14 (single-maintainer burnout).

## Bus-Factor Policy

- Every adapter family MUST have **≥1 named owner** at all times.
- The project targets **≥2 maintainers per adapter family** before v1.0.0 GA.
- If an owner becomes inactive (no response within 30 days on adapter-tagged issues),
  the project may temporarily mark the adapter `unmaintained` in
  `adapter-capabilities.json` (Phase 6) until a new owner steps up.
- Owners are added/removed via PR to this file with consensus from existing
  maintainers.

## Owners

| Adapter Family | Status | Primary Owner | Backup Owner | Notes |
|----------------|--------|---------------|--------------|-------|
| Claude Code (canonical) | active | TBD-volunteer-needed | TBD-volunteer-needed | Canonical adapter; ships first in Phase 6. |
| Generic Prompt | active | TBD-volunteer-needed | TBD-volunteer-needed | Paste-able prompts for any agent. |
| OpenCode | active | TBD-volunteer-needed | TBD-volunteer-needed | OpenCode command configuration model. |
| KiloCode | active | TBD-volunteer-needed | TBD-volunteer-needed | KiloCode custom command/mode model. |
| Cursor | active | TBD-volunteer-needed | TBD-volunteer-needed | `.cursor/rules` integration. |
| Aider | active | TBD-volunteer-needed | TBD-volunteer-needed | Convention-file integration; v1 includes Aider-only example for capability-degradation proof. |
| MCP | active | TBD-volunteer-needed | TBD-volunteer-needed | Any MCP-enabled environment; contract designed in Phase 6 research. |

## How to Volunteer

Open a PR adding your GitHub handle to one of the `TBD-volunteer-needed` cells. By
volunteering you agree to:
- Triage issues tagged with the adapter's label within 7 days
- Review PRs that modify the adapter's generated output
- Run the adapter parity CI test before approving cross-adapter changes
- Notify the project at least 30 days before stepping down

## Cross-Adapter Changes

Changes that touch the canonical command spec (which generates all adapters) require
approval from owners of **at least 3 different adapter families** to ensure no single
adapter regresses.
