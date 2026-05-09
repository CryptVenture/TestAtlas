# TestAtlas Persona Registry

This is the human-readable index of all V2 system personas shipped with the
TestAtlas suite. The machine-readable index lives at
`_testatlas/agents/registry.json` (populated by `scripts/create-persona.js` and
maintained by the orchestrator). Each persona below is the canonical source of
truth for council participation; the matching JSON sidecar
(`<id>.json`) is AJV-validated against `.testatlas/schemas/persona.schema.json`.

## How to Use

- A council command (`.testatlas/commands/council/*.md`) selects participants
  from this registry by `id`.
- Each persona supplies a `read_first` list (what context it needs), a
  `may_update` allow-list, and a `must_not_update` deny-list.
- Persona file format follows PRD §7.7: 11 mandatory markdown sections + 13
  required JSON fields. See `.testatlas/templates/persona/system.md` for the
  template.

## System Personas (14)

| Persona | id | Mission | Domains |
|---------|----|---------|---------|
| Product Strategist | `product-strategist` | Challenge whether the product solves the right user problem | product-strategy, feature-priority, user-value, roadmap |
| User Advocate | `user-advocate` | Test whether a real user would understand what to do | ux, user-journeys, onboarding, trust, friction-points |
| QA Lead | `qa-lead` | Validate end-to-end test coverage, regression risk, severity | testing, quality, regression, coverage, reproducibility |
| Accessibility Reviewer | `accessibility-reviewer` | Identify WCAG violations, screen-reader incompatibilities | accessibility, wcag, keyboard, screen-reader, semantics, responsive |
| Performance Skeptic | `performance-skeptic` | Flag slow or unclear operations, heavy assets, rendering delays | performance, latency, rendering, assets, perceived-performance |
| Security and Privacy Reviewer | `security-privacy-reviewer` | Identify authentication, authorization, sensitive-data, destructive-action risks | security, privacy, authn, authz, owasp, prompt-injection, data-protection |
| API Contract Analyst | `api-contract-analyst` | Map endpoint behavior to UI flows, validate request/response | api, rest, graphql, rpc, schemas, contracts, backward-compat |
| Codebase Mapper | `codebase-mapper` | Build and maintain implementation maps; link product flows to code paths | architecture, code-health, dependencies, tech-debt, modularity |
| Runtime Investigator | `runtime-investigator` | Diagnose why a flow cannot run; document setup, env-var, container constraints | runtime, logs, traces, observability, env, containers, dev-setup |
| Data Steward | `data-steward` | Validate data integrity, migration safety, fixture realism | data, schema, migrations, fixtures, persistence, privacy, retention |
| Adversarial Red Team Tester | `adversarial-red-team-tester` | Try to disprove conclusions, search for places where the brain is overconfident | adversarial, edge-cases, abuse, contradiction, hidden-failures |
| Documentation Curator | `documentation-curator` | Keep _testatlas coherent: detect stale knowledge, contradictions across artifacts | documentation, consolidation, drift, templates, artifacts, indexes |
| Automation Engineer | `automation-engineer` | Convert manual scenarios into automated tests, propose Playwright/Cypress/API/CLI | automation, ci, playwright, cypress, fixtures, smoke-tests |
| Release Readiness Judge | `release-readiness-judge` | Summarize whether the product is shippable from a user-quality perspective | release-readiness, blockers, go-no-go, release-notes |

## Persona-Type Conventions

- `system` — built-in personas shipped with the suite (this file).
- `generated` — created dynamically by `/atlas:create-persona` from product context.
- `project` — hand-authored project-specific personas under `_testatlas/agents/personas/project/`.

## Council Participation Patterns

PRD §7.9 defines 9 conversation modes. Recommended persona slates per mode:

| Mode | Recommended Personas |
|------|----------------------|
| Roundtable Review | All available, weighted to domain |
| Debate | Product Strategist, QA Lead, User Advocate, Adversarial Red Team Tester |
| Red Team Challenge | Adversarial Red Team Tester, Security and Privacy Reviewer, QA Lead |
| Design Critique | Product Strategist, User Advocate, Accessibility Reviewer |
| Bug Triage Council | QA Lead, Security and Privacy Reviewer, Performance Skeptic, Release Readiness Judge |
| Test Plan Council | QA Lead, Automation Engineer, Codebase Mapper, Data Steward, Runtime Investigator |
| Retest Council | QA Lead, Automation Engineer, Adversarial Red Team Tester |
| Brain Audit Council | Documentation Curator, Codebase Mapper, Adversarial Red Team Tester |
| Release Readiness | Release Readiness Judge, QA Lead, Security and Privacy Reviewer, Documentation Curator |

## Files to Read for Every Persona (baseline)

- `_testatlas/bootstrap/BOOTSTRAP.md` — operating principles and safety rules.
- `_testatlas/brain/state.json` — current workspace state.
- The session's `prompt.md` and `context_bundle.md`.

## Output Schema

Every persona output must validate against
`_testatlas/brain/schema/persona_output.schema.json` (referenced via the
`output_schema` field in each persona JSON). The output format section in
each persona's `.md` provides a template.
