---
output_id: OUTPUT-NNNN
persona_id: <!-- persona-id -->
session_id: <!-- COUNCIL-... or run-... -->
created_at: <!-- ISO-8601 -->
schema: persona_output.schema.json
---

# Output: <!-- persona-id --> in <!-- session-id -->

> Per-persona output template. Lives at
> `_testatlas/agents/councils/sessions/<id>/outputs/<persona-id>-output.md`
> alongside `<persona-id>-output.json`. Per PRD §7.8.

## Findings

<!-- Bullet list of findings, each with: text, confidence, evidence reference. -->

- **Finding 1**
  - confidence: needs_validation
  - evidence: `<path-or-EVIDENCE-id>`
  - text: <!-- one or two sentences -->

## Disputed Assumptions

<!-- Anything the persona believes the brain currently asserts but that this persona does not accept. -->

## Edge Cases / Hidden Failure Modes

<!-- Cases the persona suspects but could not confirm with current evidence. -->

## Issue Candidates

<!-- Findings that warrant being logged as TestAtlas issues. -->

| candidate | severity | rationale | proposed evidence |
|-----------|----------|-----------|-------------------|
| | | | |

## Test Candidates

<!-- Scenarios this persona recommends adding to the test suite. -->

## Evidence Needed

<!-- What additional evidence would let this persona resolve a needs_validation finding? -->

## Open Questions

<!-- Questions to feed back into `generated_questions.md` if not resolved. -->

## Cross-References

- **Domain:** <!-- domain id(s) -->
- **Flow:** <!-- flow id(s) -->
- **Issue:** <!-- issue id(s) -->
- **Related claims:** <!-- CLAIM-NNNN ids -->
