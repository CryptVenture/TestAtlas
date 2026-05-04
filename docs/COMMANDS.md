# TestAtlas Commands

_Auto-generated from `.testatlas/commands/*.md` by `scripts/generate-commands-doc.js`. Do not edit by hand._

This index covers every `/atlas:*` command shipped with TestAtlas (30 commands). Click the source link under each entry for the full instruction file (rules, lifecycle, stop conditions).

See [docs/SCHEMAS.md](./SCHEMAS.md) for the JSON Schemas these commands consume and produce.

---

## /atlas:bootstrap

Refresh the agent's understanding of the TestAtlas constitution and reaffirm the rules in effect for this session per PRD §12.2.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/bootstrap.md)

---

## /atlas:cleanup

Workspace housekeeping confined to _testatlas/ — orphan removal, broken-link triage, stale-marker resolution, index re-derivation.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/cleanup.md)

---

## /atlas:consolidate

Squash issue duplicates per triage groupings; inherit highest severity + lowest-bound confidence; refresh _testatlas/13_quality_scorecard.md longitudinal series.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/consolidate.md)

---

## /atlas:explore-accessibility

Evaluate keyboard nav, focus, labels, semantics, contrast, and dynamic feedback per PRD §13.9 using Chrome DevTools MCP lighthouse_audit + ARIA introspection; degrade to code-reading without MCP.

**Capabilities:** `browser`, `MCP`, `file-write`

[Source](../.testatlas/commands/explore-accessibility.md)

---

## /atlas:explore-api

Map REST/GraphQL/RPC/server-action/webhook/event-consumer surfaces; capture contracts, auth, errors, pagination; safely probe sandbox endpoints.

**Capabilities:** `web-fetch`, `shell`, `file-write`

[Source](../.testatlas/commands/explore-api.md)

---

## /atlas:explore-cli

Map package scripts, binaries, and task runners for the target product; classify destructive vs safe commands; capture help text and exit codes for safe ones.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/explore-cli.md)

---

## /atlas:explore-codebase

Map the target product across languages, frameworks, monorepo layout, apps/services/workers, routes, handlers, jobs, integrations, and data flows; produce 12_app_map.json plus a domain inventory.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/explore-codebase.md)

---

## /atlas:explore-data

Map schemas, entities, lifecycle states, seed fixtures, queues, caches, and storage objects from local schema introspection; never read or persist production rows.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/explore-data.md)

---

## /atlas:explore-docs

Inventory README, PRDs, stories, ADRs, specs, and supporting docs in the target repo; normalize substantial requirements into _testatlas/stories/; flag stale or conflicting docs.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/explore-docs.md)

---

## /atlas:explore-integrations

Map auth, payments, email, analytics, storage, webhooks, and feature-flag integrations; distinguish sandbox/test/prod endpoints; probe sandbox only when safe.

**Capabilities:** `web-fetch`, `file-write`

[Source](../.testatlas/commands/explore-integrations.md)

---

## /atlas:explore-performance

Detect user-visible slowness, blocking interactions, retries, and reliability per PRD §13.10 using Chrome DevTools MCP performance traces + emulate for throttling; degrade to source-code reading without MCP.

**Capabilities:** `browser`, `MCP`, `shell`, `file-write`

[Source](../.testatlas/commands/explore-performance.md)

---

## /atlas:explore-runtime

Map how to run the target product safely — package scripts, Docker, env vars, ports, migrations, seeds, mock servers; start local services only when safe.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/explore-runtime.md)

---

## /atlas:explore-security

Catalog auth surfaces, secrets-handling locations, and redaction risks per PRD §6.5 — read-only defensive audit; never attempts exploitation; never persists secret values.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/explore-security.md)

---

## /atlas:explore-ui

Map routes, components, forms, modals, all PRD §13.1 UI states (empty/loading/error/success/permission), responsive breakpoints, and accessibility basics using Chrome DevTools MCP — degrade to code reading when MCP unavailable.

**Capabilities:** `browser`, `MCP`, `file-write`

[Source](../.testatlas/commands/explore-ui.md)

---

## /atlas:explore

Umbrella explorer router — classify which sub-explorers (ui/cli/api/docs/runtime/data/integrations/accessibility/performance/security) apply to the target product and emit a recommendation document.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/explore.md)

---

## /atlas:handoff

Write a sub-agent handoff record at _testatlas/handoffs/HANDOFF-<timestamp>.{md,json} validating against sub-agent-handoff.schema.json with explicit context boundaries.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/handoff.md)

---

## /atlas:init

Bootstrap the _testatlas/ workspace tree in a target repository — 23 subdirs, 14 canonical files, and a project manifest — idempotently.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/init.md)

---

## /atlas:log-issue

Capture a quality finding as an issue under to_fix/ with severity, confidence, evidence references, and back-links to flows/domains per PRD §17.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/log-issue.md)

---

## /atlas:map-domains

Distill the app-map into per-domain functional models under _testatlas/domains/<slug>/, where each domain owns a coherent set of routes, APIs, components, jobs, and integrations per PRD §15.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/map-domains.md)

---

## /atlas:plan

Produce a risk-based, domain-based, flow-based, state-aware test strategy and master plan covering 02_test_strategy.md, plans/PLAN-master.md, the test matrix, and exploratory charters per PRD §12.14.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/plan.md)

---

## /atlas:report

Aggregate runs, issues, evidence, and coverage into reports/REPORT-latest.md (and a timestamped copy) with all 17 PRD §20 sections; refresh per-area views and the quality scorecard.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/report.md)

---

## /atlas:retest

Re-execute the original repro for issues with status=fixed_pending_retest; transition to closed (recovered) or reopened (still failing); append append-only retest history; capture new evidence.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/retest.md)

---

## /atlas:test-accessibility

Execute accessibility-typed scenarios using Chrome DevTools MCP lighthouse_audit + ARIA introspection; assert against PRD §13.9 thresholds; emit RUN-<timestamp>.{md,json} with per-scenario a11y findings.

**Capabilities:** `browser`, `MCP`, `file-write`

[Source](../.testatlas/commands/test-accessibility.md)

---

## /atlas:test-domain

Execute domain-scoped test scenarios across PRD §26 modes (negative / state / integration / setup-testability); the scenario's `type` field selects the mode.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/test-domain.md)

---

## /atlas:test-flow

Execute scenarios from tests/matrix.json against the running target product, capture per-state evidence, and emit RUN-<timestamp>.{md,json} per PRD §12.15 and §13.

**Capabilities:** `shell`, `browser`, `file-write`

[Source](../.testatlas/commands/test-flow.md)

---

## /atlas:test-performance

Execute performance-typed scenarios using Chrome DevTools MCP performance traces + emulate for throttling; assert against PRD §13.10 thresholds; emit RUN-<timestamp>.{md,json} with per-scenario perf findings.

**Capabilities:** `browser`, `MCP`, `shell`, `file-write`

[Source](../.testatlas/commands/test-performance.md)

---

## /atlas:test-regression

Re-run previously-failed scenarios from prior RUN-<timestamp>.json files; diff against the prior failed run; report regressed / recovered / unchanged / unverified per scenario.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/test-regression.md)

---

## /atlas:triage

Deduplicate, normalize, group, and flag-as-blocker the issues under _testatlas/to_fix/; identify missing evidence; emit triage-report-<timestamp>.md.

**Capabilities:** `file-write`

[Source](../.testatlas/commands/triage.md)

---

## /atlas:update

Invoke the suite self-update flow — checks GitHub Releases per UPDATE-01, delegates to Phase 7 update.js for atomic apply with backup, never auto-applies without operator confirmation.

**Capabilities:** `shell`, `web-fetch`, `file-write`

[Source](../.testatlas/commands/update.md)

---

## /atlas:validate-workspace

Schema-validate the _testatlas/ workspace; surface drift, broken links, orphaned evidence, and other PRD §33 violations as findings.

**Capabilities:** `shell`, `file-write`

[Source](../.testatlas/commands/validate-workspace.md)

---
