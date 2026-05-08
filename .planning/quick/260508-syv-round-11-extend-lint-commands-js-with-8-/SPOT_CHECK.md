# Audit-manifest spot check (Round-11 closure)

Generated: 2026-05-08T (post-Round-11 fixes)
Source: `tmp/syv-audit.json`

## Summary

- commands_scanned: 73
- claims_extracted: 891
- claims_resolved: 534
- claims_unresolved: 357
- resolution_rate: **59.9%** (below the 80% target; see breakdown below)

## Resolution by claim type

| Claim type            | Resolved | Unresolved | Notes                                                      |
| --------------------- | -------: | ---------: | ---------------------------------------------------------- |
| schema-file           |      321 |          0 | Inv-8 active resolver — 100% closure post-Round-11 fixes   |
| script-invocation     |      161 |          0 | Active resolver — script files all exist                   |
| map-path              |       51 |          0 | Syntactic-form check passes uniformly                      |
| config-key            |        1 |          0 | Active resolver — only `idempotencyTtlMs` cited explicitly |
| script-flag           |        0 |        303 | **Deferred resolver** — see Future work (force-flag-coverage) |
| slash-command         |        0 |         21 | **Deferred resolver** — `.testatlas/commands/**` walk      |
| step-cross-reference  |        0 |         18 | **Deferred** — Inv-15 catches in lint mode; manifest records raw |
| mcp-tool              |        0 |         15 | **Deferred resolver** — MCP introspection                  |

## Effective resolution rate

If we exclude the four deferred-resolver claim types (script-flag, slash-command,
step-cross-reference, mcp-tool — all explicitly recorded as "unresolved" in v1
per CONTEXT.md `<specifics>` so future rounds can plug in resolvers
retrospectively), the **active-resolver resolution rate is 534 / 534 = 100%**.

The headline 59.9% reflects honest accounting of what isn't yet plumbed; it
is NOT a fix-rate against the post-fix corpus. Future rounds add resolvers,
the manifest catches all instances retrospectively (the architectural
commitment per CHANGELOG `Architectural diagnosis`).

## Top unresolved claim types — narrative

1. **script-flag (303 unresolved)** — every `--<flag>` token following a
   script invocation. Resolver future work: extend
   `scripts/lib/script-flag-metadata.js` with a `SUPPORTED_FLAGS`
   per-script catalog (currently only REQUIRED_FLAGS + ENUM_FLAGS exist
   for `update-brain-after-command.js`). Then the manifest can resolve
   each flag-token against its script's catalog.

2. **slash-command (21 unresolved)** — every `/atlas:<x>` reference.
   Resolver future work: walk `.testatlas/commands/**/*.md` and build a
   slash-command index; resolve each reference against it.

3. **step-cross-reference (18 unresolved)** — manifest records raw step-N
   references; the active **Inv-15** invariant already catches dangling
   refs at lint time. The manifest's "unresolved" status here is by
   design — we record the claim so future cross-doc analysis can act on
   it.

4. **mcp-tool (15 unresolved)** — `<server>:<tool>` references (chrome-
   devtools, context7, serena, playwright, brain). Resolver future work:
   introspect MCP tool schemas and verify referenced tool params match
   (CONTEXT.md `Future work` calls this out as 122-style).

## Notes

- The schema-file resolver is the strongest signal so far: 321 valid /
  0 missing means the Round-11 ISSUE-119b/123a class of "doc cites a
  schema that doesn't exist" is fully closed against the post-fix corpus.
- The single resolved `config-key` claim is `idempotencyTtlMs` (newly added
  to `default.config.json` in this round per Task 3); pre-Task-3, that
  claim would have resolved as `missing`.
- mcp-tool, slash-command, and script-flag are explicit "future-resolver"
  candidates per CONTEXT.md `<specifics>`. Adding any one of those is a
  1-2-hour follow-up that retroactively closes ALL instances in a single
  manifest run.
