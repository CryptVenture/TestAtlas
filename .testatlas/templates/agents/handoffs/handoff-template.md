---
handoff_id: HANDOFF-NNNN
from_agent: <!-- agent-id -->
to_agent: <!-- agent-id -->
session_id: <!-- COUNCIL-... or run-... -->
created_at: <!-- ISO-8601 -->
status: open
---

# Handoff <!-- HANDOFF-NNNN -->

> Standard handoff note for agent-to-agent context transfer. Lives at
> `_testatlas/agents/handoffs/HANDOFF-NNNN.md`. Per PRD §7.6 and the
> command-lifecycle protocol.

## Context

<!-- One paragraph: what was the originating agent doing, and where did it stop? -->

## Inputs Already Read

- `<file path>` — <!-- short rationale -->
- `<file path>` — <!-- short rationale -->

## State of Work

- **Completed:**
  - <!-- what's done -->
- **In progress:**
  - <!-- what's mid-flight -->
- **Blocked:**
  - <!-- what's blocked and why -->

## Blockers

<!-- Specific blockers with severity. Cite evidence if available. -->

## Next Actions for Receiving Agent

1. <!-- step 1 -->
2. <!-- step 2 -->
3. <!-- step 3 -->

## Files the Receiving Agent Must Read

- `_testatlas/bootstrap/BOOTSTRAP.md`
- `_testatlas/brain/state.json`
- <!-- additional must-reads -->

## Open Questions

<!-- Any questions the originating agent could not resolve. -->

## Safety Notes

<!-- Any boundary conditions: do-not-touch files, capabilities required, etc. -->

## Provenance

- **Originating session:** <!-- session id or run id -->
- **Originating command:** <!-- /atlas:... -->
- **Originating commit:** <!-- git short sha -->
