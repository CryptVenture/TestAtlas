# Phase 13 — Vocabulary Strategy Decision

**Decided:** 2026-05-07
**Decided by:** Phase 13 planner + Plan 13-01 executor
**Affects:** vocabulary.json `$defs/evidenceType` enum + every Plan 13-02..13-09 evidence reference.

## Decision

**Strategy A — no schema change.** All walkthrough artifacts map cleanly to existing `evidenceType` enum values (`screenshot`, `log`, `trace`, `network`, `console`, `accessibility`, `performance`). The `description` field on each evidence record carries the discriminator (e.g., "lighthouse accessibility audit JSON", "ARIA inventory dump").

The current enum, verified at `.testatlas/vocabulary.json` lines 73–88:

```json
"evidenceType": {
  "type": "string",
  "enum": [
    "screenshot",
    "video",
    "log",
    "trace",
    "network",
    "console",
    "api",
    "db",
    "file",
    "accessibility",
    "performance"
  ]
}
```

Per-walkthrough-artifact mapping (verified row-by-row against 13-RESEARCH.md §"Evidence Schema Fit" lines 484–523):

| Walkthrough artifact | Existing enum value | Discriminator (in `description`) |
|----------------------|---------------------|----------------------------------|
| Per-state screenshot (empty/loading/error/success/permission) | `screenshot` | `"per-state screenshot: <state>"` |
| DOM accessibility tree (`take_snapshot`) | `accessibility` | `"DOM ARIA snapshot"` |
| Lighthouse JSON (a11y category) | `accessibility` | `"lighthouse accessibility audit JSON"` |
| Lighthouse JSON (perf category) | `performance` | `"lighthouse performance audit JSON"` |
| Performance trace (`performance_stop_trace`) | `trace` | `"chrome devtools performance trace"` |
| Performance insights JSON (`performance_analyze_insight`) | `performance` | `"performance insights JSON"` |
| Network log (`list_network_requests`) | `network` | `"per-route network capture"` |
| Console log (`list_console_messages`) | `console` | `"per-route console capture"` |
| ARIA inventory (custom `evaluate_script` dump) | `accessibility` | `"ARIA inventory dump"` |
| Focus-order trail | `accessibility` | `"focus-order traversal"` |
| Contrast samples | `accessibility` | `"contrast samples (computed styles)"` |
| Dialog handler log | `log` | `"handle_dialog event log"` |

Every artifact category produced by the five walkthrough patterns (Component-discovery, State-coverage, Interactive-surface, A11y, Perf) maps to one of `screenshot | log | trace | network | console | accessibility | performance` — all already in the enum.

## Rationale

1. **The existing 11-value enum already names every artifact category the walkthrough produces** (verified row-by-row above). The Strategy B widening RESEARCH §"Evidence Schema Fit" sketches (`dom-snapshot`, `lighthouse-report`, `performance-trace`, `performance-insights`, `aria-inventory`, `focus-trail`, `contrast-samples`, `dialog-log`) would be redundant — they are sub-categories of the existing values, not new categories.
2. **No schema migration risk** — Phase 2's `vocabulary.json` + `evidence.schema.json` contracts stay byte-stable. The `validate-workspace` schema-loader, the `vocabulary.schema.json` versioning contract, and every adapter manifest that references `evidence.schema.json` continue working unchanged.
3. **`validate-workspace` continues to pass without enum-extension regression risk.** No fixture-corpus migration needed; existing evidence records remain valid; new walkthrough records validate against the unchanged enum.
4. **Adapter parity stays clean.** Strategy B would have required an additive schema bump that would propagate through all 18 adapter trees via `assemble-adapter`; Strategy A leaves the schema layer untouched.
5. **Forward-compatibility preserved.** If future walkthroughs need finer-grained machine discrimination (e.g., separating `lighthouse-report` from generic `accessibility`), it can ship as an additive enum widening in a later phase without disrupting Phase 13. Strategy A does not foreclose Strategy B; it only defers it until a concrete machine-query need appears.
6. **Description-as-discriminator is already idiomatic.** Existing TestAtlas evidence records already use `description` to carry artifact context (per `evidence.schema.json`'s `description` field requirement). Adding a stable discriminator phrase per artifact category extends an established pattern rather than inventing a new one.

## Implications for downstream plans

- **Plan 13-02 (reference shard):** must document, per walkthrough pattern, which existing enum value applies to which artifact (mapping table embedded in the shard's "Evidence persistence" section). Use the per-artifact mapping table above verbatim.
- **Plan 13-03 (bootstrap+capabilities):** no `vocabulary.json` change; no `evidence.schema.json` change. Bootstrap §12 walkthrough paragraph references `description`-as-discriminator pattern in passing.
- **Plans 13-04..13-07 (command rewrites):** when prescribing evidence persistence in command bodies, **reuse existing enum values verbatim** — do NOT introduce new values. Use the mapping table above as canonical. `description` field carries the discriminator string.
- **Plan 13-08 (frontmatter description sweep):** unaffected — operates on command frontmatter `description:` field, not evidence-record `description` field.
- **Plan 13-09 (final sweep):** **no evidence-schema regression test additions.** Existing schema tests stay green. No `vocabulary.json` schema-version bump needed. `validate-workspace` runs against fixture corpus continue passing without migration.

## Source

- `.testatlas/vocabulary.json` lines 73–88 (current enum, verified 2026-05-07)
- 13-RESEARCH.md §"Evidence Schema Fit" lines 484–523 (Strategy A vs B framing + per-artifact analysis)
- 13-RESEARCH.md §"Walkthrough Patterns" lines 150–386 (all artifact-producing pattern bodies)
- `.testatlas/schemas/evidence.schema.json` (path-freeform, type via `$ref`)
