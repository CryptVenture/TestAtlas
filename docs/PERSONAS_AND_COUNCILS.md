# Personas and Councils

TestAtlas v2.0.0 ships **14 built-in system personas** and **5 council templates** that let you run multi-persona review sessions. A persona is a specialised testing role with a defined mission, domains of expertise, and a set of tools it may use. A council is a structured debate protocol where multiple personas review a topic and produce a consensus decision.

This document covers what personas are, how to use them, the built-in roster, and how councils work.

---

## What is a Persona?

A persona is a testing role definition. It tells the agent:

- **Mission** — what this persona's job is (e.g. "find security gaps")
- **Domains** — which product areas it specialises in
- **Tools** — what capabilities it needs (browser, shell, MCP, etc.)
- **Read-first** — which workspace files it must read before acting
- **May update** — which files it is allowed to modify
- **Must not update** — which files it must treat as read-only
- **Blind spots** — what this persona is explicitly NOT responsible for
- **Questions** — default questions it asks of every domain/flow

Personas live as `{.md,.json}` pairs under `_testatlas/agents/personas/system/`. The `.md` is human-readable; the `.json` is machine-readable and schema-validated against `persona.schema.json`.

---

## Built-in System Personas (14)

| ID | Name | Mission | Key Domains |
|----|------|---------|-------------|
| `accessibility-reviewer` | Accessibility Reviewer | Evaluate WCAG compliance, keyboard navigation, screen-reader semantics, focus order | UI, components, routes |
| `adversarial-red-team-tester` | Adversarial Red Team Tester | Attempt to invalidate confident claims and find hidden risks | Security, auth, inputs |
| `api-contract-analyst` | API Contract Analyst | Verify REST/GraphQL/gRPC contracts, pagination, idempotency, error shapes | APIs, integrations |
| `automation-engineer` | Automation Engineer | Identify automation candidates, generate test skeletons, evaluate flaky-test risk | Tests, CI, flows |
| `codebase-mapper` | Codebase Mapper | Map languages, frameworks, routes, components, and data flows across the repo | Architecture, dependencies |
| `data-steward` | Data Steward | Validate data models, migrations, seed fixtures, and lifecycle states | Data, storage, migrations |
| `documentation-curator` | Documentation Curator | Inventory docs, flag stale or conflicting requirements, normalise stories | Docs, PRDs, ADRs |
| `performance-skeptic` | Performance Skeptic | Detect slowness, blocking interactions, payload bloat, retry storms | Performance, runtime |
| `product-strategist` | Product Strategist | Evaluate feature coherence, prioritisation, and user-value alignment | Product, UX, roadmap |
| `qa-lead` | QA Lead | Orchestrate test strategy, coverage analysis, and regression planning | Testing, coverage, releases |
| `release-readiness-judge` | Release Readiness Judge | Weigh blockers, coverage gaps, drift, and council consensus for go/no-go | Releases, blockers |
| `runtime-investigator` | Runtime Investigator | Map services, env vars, ports, logs, and observability | Runtime, infrastructure |
| `security-privacy-reviewer` | Security & Privacy Reviewer | Audit auth surfaces, secrets handling, redaction, injection risks | Security, privacy, compliance |
| `user-advocate` | User Advocate | Critique UX, copy, navigation, and accessibility from a user's perspective | UX, UI, flows |

Every persona declares `capabilities` (browser, shell, web-fetch, MCP, file-write, etc.) so the agent knows what it can and cannot do. If a required capability is unavailable, the persona marks findings `confidence: needs-validation`.

---

## What is a Council?

A council is a **structured multi-persona review protocol**. It follows a 9-round debate:

1. **Setup** — select topic, scope, and required personas from the template.
2. **Round 1–3: Positioning** — each persona reads the relevant artifacts and states its initial position.
3. **Round 4–6: Challenge** — personas challenge each other's claims with evidence.
4. **Round 7–8: Synthesis** — identify agreements, disagreements, and open questions.
5. **Round 9: Decision** — vote, produce a consensus level (unanimous / majority / split), and write a decision record.

Councils write their output to `_testatlas/brain/decisions.json` and produce a human-readable transcript.

---

## Built-in Council Templates (5)

| Template ID | Topic | Required Personas | Output |
|-------------|-------|-------------------|--------|
| `brain-audit` | Workspace staleness, contradictions, missing updates | Codebase Mapper, QA Lead, Documentation Curator | `decisions.json` + audit report |
| `bug-triage` | Classify and prioritise open issues | QA Lead, Product Strategist, User Advocate | Updated issue priorities |
| `domain-review` | Deep-dive review of one domain | All 14 personas (or a subset) | Per-domain findings + claims |
| `red-team` | Adversarial challenge of confident claims | Red Team Tester, Security Reviewer, Performance Skeptic | Risk register updates |
| `release-readiness` | Go/no-go assessment | Release Judge, QA Lead, Product Strategist | `release_readiness.md` |

---

## Using Personas

### In a council session

```
/atlas:council-bug-triage
```

The agent reads the `bug-triage.json` template, loads the required personas, and runs the 9-round protocol. Output: updated issue priorities + a decision record.

### As a standalone role

Any command that supports persona-scoped execution can load a persona:

```
/atlas:explore-security          # loads security-privacy-reviewer persona
/atlas:test-accessibility        # loads accessibility-reviewer persona
```

The persona's mission and questions shape what the agent looks for and how it reports findings.

### Creating a custom persona

```
/atlas:create-persona
```

Prompts for:
- ID (kebab-case slug)
- Type: `system` (shipped with suite), `generated` (auto-created by agent), or `project` (custom to this repo)
- Mission, domains, tools, read-first list, may-update list, blind spots

Emits `_testatlas/agents/personas/<type>/<id>.{md,json}` and updates `brain/personas.json`.

---

## Using Councils

### Running a council

```
/atlas:council-domain-review --domain auth
```

1. Agent reads the `domain-review.json` template.
2. Loads the required personas.
3. Each persona reads `domains/auth/domain.json`, relevant flows, evidence, and issues.
4. Runs the 9-round protocol.
5. Writes findings to `brain/decisions.json` and updates `brain/claims.json`.

### Custom council sessions

Advanced: create a custom `.json` template in `_testatlas/agents/councils/` and run:

```
/atlas:council --template my-custom-review
```

The template must validate against `council_session.schema.json`.

---

## Adapter Support

Not all adapters can run full council sessions. See [docs/ADAPTERS.md](./ADAPTERS.md) for the per-adapter capability matrix. Adapters with `council-orchestration` capability spawn subagents per persona; adapters without it fall back to simulated mode (single agent role-plays each persona sequentially).

---

## See Also

- [docs/V2_WORKSPACE.md](./V2_WORKSPACE.md) — Brain tree, agents tree, and map templates
- [docs/COMMANDS.md](./COMMANDS.md) — Full `/atlas:council-*` and `/atlas:brain-*` command reference
- [docs/GETTING_STARTED.md](./GETTING_STARTED.md) — V2 happy path walkthrough
- [docs/ADAPTERS.md](./ADAPTERS.md) — Adapter capability matrix
