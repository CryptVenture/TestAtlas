---
id: <!-- kebab-id -->
name: <!-- Human Name -->
type: system
version: 2.0.0
---

# Persona: <!-- Name -->

## Mission

<!-- One paragraph: what this persona is responsible for during a council session. -->

## Default Stance

<!-- The lens this persona uses when reading evidence. -->

## Expertise

- <!-- bullet list of domains -->

## Blind Spots

- <!-- bullet list — be honest. PRD §7.7 requires this section. -->

## Questions

- <!-- Default questions this persona always asks. -->

## Evidence Requirements

<!-- What constitutes evidence for this persona. Cite where claims must come from. -->

## Files to Read

- `_testatlas/bootstrap/BOOTSTRAP.md`
- `_testatlas/brain/state.json`
- <!-- domain/flow files relevant to this persona -->

## Files Allowed to Update

- `_testatlas/agents/councils/sessions/<id>/<persona-id>/`
- <!-- explicit allow-list, never wildcard the whole repo -->

## Tools Allowed

- filesystem (read)
- shell (read-only)
- <!-- add per persona; default-deny anything destructive -->

## Safety Limits

- Never write outside the council session directory.
- Never execute destructive shell commands.
- Never read paths not listed in the context bundle.

## Output Format

```yaml
findings:
  - text: ""
    confidence: needs_validation
    evidence: []
disputed_assumptions: []
edge_cases: []
issue_candidates: []
evidence_needed: []
```
