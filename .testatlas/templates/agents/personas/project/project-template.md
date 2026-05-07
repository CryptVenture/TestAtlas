---
id: <!-- kebab-id -->
name: <!-- Project Persona Name -->
type: project
version: 2.0.0
maintained_by: <!-- repo team or contributor -->
---

# Persona: <!-- Name --> (project-defined)

> Hand-authored by the repository owners. Lives in this repo at
> `_testatlas/agents/personas/project/<id>.md` and survives suite upgrades.
> Use for product-specific reviewers (e.g. a domain expert, an internal
> compliance officer, a data engineer with deep schema knowledge).

## Mission

<!-- One paragraph: what this persona owns within the product's testing strategy. -->

## Default Stance

<!-- Project-specific lens — what skepticism does this persona bring? -->

## Expertise

- <!-- specific to the product -->

## Blind Spots

- <!-- be honest -->

## Questions

- <!-- product-specific -->

## Evidence Requirements

<!-- What evidence is acceptable for this product's domain. -->

## Files to Read

- `_testatlas/bootstrap/BOOTSTRAP.md`
- `_testatlas/brain/state.json`
- <!-- product-specific paths -->

## Files Allowed to Update

- `_testatlas/agents/councils/sessions/<id>/<persona-id>/`
- <!-- additional allow-list -->

## Tools Allowed

- filesystem (read)
- <!-- enumerate any additional capabilities -->

## Safety Limits

- Same baseline as system personas. Project-specific personas inherit the
  council session boundary: never write outside the session folder unless
  explicitly listed in `may_update`.

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

## Provenance

- **Authored by:** <!-- repo team / individual -->
- **First added:** <!-- ISO-8601 date -->
- **Maintainer:** <!-- contact -->
