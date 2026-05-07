<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/_aggregate" hash="c4457cacb704fb9955cd160f27fe9df749a6422959cdc4f89d6f08b86d617e12" -->
First read `.testatlas/bootstrap.md`. Then read `.roo/rules/atlas.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

TestAtlas conventions for Roo Code. Bootstrap rules in `.testatlas/bootstrap.md` win on conflict. To run a command, read its source file at `.testatlas/commands/<command>.md` and follow it exactly.

## /atlas-bootstrap

Refresh the agent's understanding of the TestAtlas constitution and reaffirm the rules in effect for this session per PRD §12.2. Read `.testatlas/commands/bootstrap.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-brain-drift

Detect drift between the last exploration and the current repository state and write _testatlas/brain/drift.json with per-domain/flow drift status. Read `.testatlas/commands/brain/brain-drift.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-brain-score

Compute the 11 PRD §7.15 quality scores from documented brain evidence and write _testatlas/brain/quality_scores.json with freshness + confidence + disclaimer. Read `.testatlas/commands/brain/brain-score.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-cleanup

Workspace housekeeping confined to _testatlas/ — orphan removal, broken-link triage, stale-marker resolution, index re-derivation. Never deletes user content. Read `.testatlas/commands/cleanup.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-consolidate

Squash issue duplicates per triage groupings; inherit highest severity + lowest-bound confidence; refresh _testatlas/13_quality_scorecard.md longitudinal series. Read `.testatlas/commands/consolidate.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-bootstrap-refresh

Re-read the constitution, validate token budget, and refresh bootstrap shards so a long-running agent doesn't drift from the rules. Read `.testatlas/commands/core/bootstrap-refresh.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-brain-compact

Summarize long transcripts and run logs into durable summaries; keeps the brain compact without losing decisions or evidence. Read `.testatlas/commands/core/brain-compact.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-brain-export

Export the V2 brain as a JSON dump, a graph snapshot, or a full archive — for handoff, dashboards, or backup. Read `.testatlas/commands/core/brain-export.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-brain-query

Answer a question about the workspace by reading brain JSON; cite file paths for every claim. Read `.testatlas/commands/core/brain-query.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-brain-sync

Detect and reconcile drift between markdown artifacts and brain JSON indexes; orchestrates sync-markdown-json + validate-brain. Read `.testatlas/commands/core/brain-sync.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-brain-validate

Run AJV validation across the entire `_testatlas/brain/` tree (22 files) and report any findings. Read `.testatlas/commands/core/brain-validate.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-init

Bootstrap or upgrade a TestAtlas V2 workspace — creates `_testatlas/brain/` skeleton, registers adapters, and writes a v2 manifest. Read `.testatlas/commands/core/init.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-core-status

Summarize the current TestAtlas workspace — phase, counts, blockers, stale areas — by reading the V2 brain state. Read `.testatlas/commands/core/status.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-brain-audit

Brain Audit Council — personas inspect the _testatlas workspace for staleness, contradictions, missing updates, and bad structure through the 9-round protocol. Read `.testatlas/commands/council/council-brain-audit.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-bug-triage

Bug triage council — multiple personas classify and prioritize open issues by severity, priority, and remediation sequencing through the 9-round protocol. Read `.testatlas/commands/council/council-bug-triage.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-design-critique

Design Critique — Product Strategist, User Advocate, and Accessibility Reviewer critique a UI flow's user experience, copy, navigation, and a11y through the 9-round protocol. Read `.testatlas/commands/council/council-design-critique.md` for full instructions.
- Required capabilities: shell, browser, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-domain-review

Roundtable review of a domain — every persona reads the domain's docs, evidence, and brain slice and contributes findings, claims, and disagreements through the 9-round protocol. Read `.testatlas/commands/council/council-domain-review.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-flow-review

Roundtable review of a single user flow — personas read the flow doc, route map, evidence, and run logs and contribute findings, claims, and disagreements through the 9-round protocol. Read `.testatlas/commands/council/council-flow-review.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-product-review

Debate-mode council on product priority, feature coherence, and tradeoffs — personas argue for/against a conclusion through the 9-round protocol. Read `.testatlas/commands/council/council-product-review.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-red-team

Red Team Challenge — adversarial personas attempt to find hidden risks and invalidate confident claims through the 9-round protocol. Read `.testatlas/commands/council/council-red-team.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-release-readiness

Release readiness council — personas weigh blockers, coverage, drift, and council consensus into a documented go / conditional / no-go decision through the 9-round protocol. Read `.testatlas/commands/council/council-release-readiness.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-retest

Retest council — personas evaluate whether a claimed fix satisfies the issue's acceptance criteria through the 9-round protocol. Read `.testatlas/commands/council/council-retest.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council-test-plan

Test Plan Council — QA, automation, codebase, data, and runtime personas propose a complete testing plan through the 9-round protocol. Read `.testatlas/commands/council/council-test-plan.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-council

Umbrella router for V2 council commands. Selects a conversation mode + topic + participants and dispatches to the matching council-* sub-command. Read `.testatlas/commands/council/council.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-accessibility

Evaluate keyboard nav, focus, labels, semantics, contrast, dynamic feedback per PRD §13.9 via mandatory Chrome DevTools MCP a11y walkthrough (lighthouse_audit + ARIA introspection); degrade to code-reading without MCP. Read `.testatlas/commands/explore-accessibility.md` for full instructions.
- Required capabilities: browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-api

Map REST/GraphQL/RPC/server-action/webhook/event-consumer surfaces; capture contracts, auth, errors, pagination; safely probe sandbox endpoints. Read `.testatlas/commands/explore-api.md` for full instructions.
- Required capabilities: web-fetch, shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-cli

Map package scripts, binaries, and task runners for the target product; classify destructive vs safe commands; capture help text and exit codes for safe ones. Read `.testatlas/commands/explore-cli.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-codebase

Map the target product across languages, frameworks, monorepo layout, apps/services/workers, routes, handlers, jobs, integrations, and data flows; produce 12_app_map.json plus a domain inventory. Read `.testatlas/commands/explore-codebase.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-data

Map schemas, entities, lifecycle states, seed fixtures, queues, caches, and storage objects from local schema introspection; never read or persist production rows. Read `.testatlas/commands/explore-data.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-docs

Inventory README, PRDs, stories, ADRs, specs, and supporting docs in the target repo; normalize substantial requirements into _testatlas/stories/; flag stale or conflicting docs. Read `.testatlas/commands/explore-docs.md` for full instructions.
- Required capabilities: file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-integrations

Map auth, payments, email, analytics, storage, webhooks, and feature-flag integrations; distinguish sandbox/test/prod endpoints; probe sandbox only when safe. Read `.testatlas/commands/explore-integrations.md` for full instructions.
- Required capabilities: web-fetch, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-performance

Detect user-visible slowness, blocking interactions, retries, reliability per PRD §13.10 via mandatory Chrome DevTools MCP perf walkthrough (baseline + throttled traces, performance_analyze_insight); degrade to code-reading without MCP. Read `.testatlas/commands/explore-performance.md` for full instructions.
- Required capabilities: browser, MCP, shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-runtime

Map how to run the target product safely — package scripts, Docker, env vars, ports, migrations, seeds, mock servers; start local services only when safe. Read `.testatlas/commands/explore-runtime.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-security

Catalog auth surfaces, secrets-handling locations, and redaction risks per PRD §6.5 — read-only defensive audit; never attempts exploitation; never persists secret values. Read `.testatlas/commands/explore-security.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-ui

Map routes, components, forms, modals, PRD §13.1 UI states (empty/loading/error/success/permission), responsive breakpoints, a11y basics via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. Read `.testatlas/commands/explore-ui.md` for full instructions.
- Required capabilities: browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore

Umbrella explorer orchestrator — classifies sub-explorers, spawns the recommended ones in parallel via subagent-spawn, and aggregates findings into _testatlas/02_product_overview.md alongside _testatlas/explore-plan.md. Read `.testatlas/commands/explore.md` for full instructions.
- Required capabilities: file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-all

V2 umbrella explorer that classifies and routes all 20 V1+V2 explorers, applies idempotency filtering, selects an execution mode (parallel-subagents / sequential-fallback / classify-only), and aggregates findings. Read `.testatlas/commands/explore/explore-all.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-brain

Audit the V2 brain workspace consistency — stale docs, invalid JSON, missing indexes, dangling cross-references, drift between markdown and JSON, orphaned evidence. Read `.testatlas/commands/explore/explore-brain.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-components

Inventory every UI component with props, state dependencies, responsive behavior, accessibility basics, and observed routes via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. Read `.testatlas/commands/explore/explore-components.md` for full instructions.
- Required capabilities: shell, browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-errors

Map error boundaries, fallback UI, error logging, retry patterns, and exception flows via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. Read `.testatlas/commands/explore/explore-errors.md` for full instructions.
- Required capabilities: shell, browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-jobs

Map background jobs, schedules, queues, retry policies, timeouts, and failure scenarios; observable via shell + log inspection; degrade to code-reading when shell unavailable. Read `.testatlas/commands/explore/explore-jobs.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-observability

Map logging setup, metrics, alerts, and tracing — verify log generation, metric collection, alert triggers, and distributed-trace propagation. Static audit + live probe when shell available. Read `.testatlas/commands/explore/explore-observability.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-release-readiness

Map release artifacts, blockers, readiness state, version tags, and gates. Synthesizes signal from prior explorers into a release/no-go decision report. Read `.testatlas/commands/explore/explore-release-readiness.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-routes

Map every route, navigation paths, guards, redirects, deep-link behavior, history (back/forward), and per-route ownership via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. Read `.testatlas/commands/explore/explore-routes.md` for full instructions.
- Required capabilities: shell, browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-security-privacy

Map auth flows, permission boundaries, sensitive-data handling, injection risks, and privacy controls. V2 expansion of V1 explore-security with mandatory walkthrough when browser+MCP available. Read `.testatlas/commands/explore/explore-security-privacy.md` for full instructions.
- Required capabilities: browser, MCP, shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-state

Map UI states (empty, loading, error, success, permission) plus state transitions, default/initial states, and error recovery via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. Read `.testatlas/commands/explore/explore-state.md` for full instructions.
- Required capabilities: shell, browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-explore-tests

Inventory existing tests, measure coverage, identify gaps, surface flaky tests. Static audit + live test-runner probe when shell available. Read `.testatlas/commands/explore/explore-tests.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-handoff

Write a sub-agent handoff record at _testatlas/handoffs/HANDOFF-<timestamp>.{md,json} validating against sub-agent-handoff.schema.json with explicit context boundaries. Read `.testatlas/commands/handoff.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-init

Bootstrap the _testatlas/ workspace tree in a target repository — 23 subdirs, 14 canonical files, and a project manifest — idempotently. Read `.testatlas/commands/init.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-log-issue

Capture a quality finding as an issue under to_fix/ with severity, confidence, evidence references, and back-links to flows/domains per PRD §17. Read `.testatlas/commands/log-issue.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-maintain-migrate

Migrate a V1 TestAtlas workspace to V2 via `scripts/v2-migrate.js`. Backs up the existing workspace, creates V2 brain + agent + maps + stories + tests directories, populates baseline brain JSON, and bumps the manifest. Idempotent and rollback-safe. Read `.testatlas/commands/maintain/maintain-migrate.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-maintain-validate-artifacts

Run comprehensive artifact validation beyond `validate-workspace` — brain JSON consistency, schema compliance for every artifact, orphaned evidence detection, dangling references, and markdown/JSON sync status. Read `.testatlas/commands/maintain/maintain-validate-artifacts.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-map-domains

Distill the app-map into per-domain functional models under _testatlas/domains/<slug>/, where each domain owns a coherent set of routes, APIs, components, jobs, and integrations per PRD §15. Read `.testatlas/commands/map-domains.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-plan

Produce a risk-based, domain-based, flow-based, state-aware test strategy and master plan covering 02_test_strategy.md, plans/PLAN-master.md, the test matrix, and exploratory charters per PRD §12.14. Read `.testatlas/commands/plan.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-report

Aggregate runs, issues, evidence, and coverage into reports/REPORT-latest.md (and a timestamped copy) with all 17 PRD §20 sections; refresh per-area views and the quality scorecard. Read `.testatlas/commands/report.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-report-dashboard-data

Render a machine-readable dashboard data export (PRD §16) at _testatlas/reports/dashboard-data.json suitable for downstream UIs and CI status pages. Read `.testatlas/commands/report/report-dashboard-data.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-report-domain

Render a domain-scoped report combining quality scores, issues, coverage, drift, and recommendations into _testatlas/reports/domain-<slug>.md. Read `.testatlas/commands/report/report-domain.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-report-release

Render a release readiness report with go/no-go assessment combining quality_scores.json, drift.json, open issues, and council consolidations into _testatlas/reports/release_readiness.md. Read `.testatlas/commands/report/report-release.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-retest

Re-execute the original repro for issues with status=fixed_pending_retest; transition to closed (recovered) or reopened (still failing); append append-only retest history; capture new evidence. Read `.testatlas/commands/retest.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-accessibility

Execute accessibility-typed scenarios via mandatory Chrome DevTools MCP a11y walkthrough (lighthouse_audit + ARIA introspection); assert against PRD §13.9 thresholds; emit RUN-<timestamp>.{md,json} with per-scenario a11y findings. Read `.testatlas/commands/test-accessibility.md` for full instructions.
- Required capabilities: browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-all

Umbrella test orchestrator — runs `/atlas:test-flow --all` AND `/atlas:test-domain --all` and aggregates per-child run records into a single merged RUN-<timestamp>.{md,json}. Read `.testatlas/commands/test-all.md` for full instructions.
- Required capabilities: shell, browser, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-domain

Execute domain-scoped scenarios across PRD §26 modes (negative/state/integration/setup-testability); state-typed UI scenarios drive the mandatory Chrome DevTools MCP state-coverage walkthrough (5 states); scenario.type selects mode. Read `.testatlas/commands/test-domain.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-flow

Execute scenarios from tests/matrix.json against running target via mandatory Chrome DevTools MCP interactive-surface walkthrough (forms, modals, navigation, keyboard); capture per-state evidence; emit RUN-<timestamp>.{md,json} per PRD §13. Read `.testatlas/commands/test-flow.md` for full instructions.
- Required capabilities: shell, browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-performance

Execute performance-typed scenarios via mandatory Chrome DevTools MCP perf walkthrough (baseline + throttled traces, performance_analyze_insight, emulate); assert PRD §13.10 thresholds; emit RUN-<timestamp>.{md,json} with perf findings. Read `.testatlas/commands/test-performance.md` for full instructions.
- Required capabilities: browser, MCP, shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-regression

Re-run previously-failed scenarios from prior RUN-<timestamp>.json files; diff against the prior failed run; report regressed / recovered / unchanged / unverified per scenario. Read `.testatlas/commands/test-regression.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-generate-automation

Generate framework-specific automation skeletons (Playwright, Cypress, API, CLI, contract, smoke) from documented flows. Output marked `generated-but-not-validated` until executed. Read `.testatlas/commands/test/generate-automation.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-generate-retest-pack

Generate self-contained retest packs from open issue records under `_testatlas/to_fix/`. Each pack carries reproduction steps, pass/fail criteria, evidence refs, and fixtures so any agent can re-verify a fix. Read `.testatlas/commands/test/generate-retest-pack.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-generate-scenarios

Generate exploratory charters and manual test scenarios from documented flows under `_testatlas/flows/`. Output marked `generated-not-yet-validated` until executed. Read `.testatlas/commands/test/generate-scenarios.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-test-critical-flows

Identify and execute the highest-value flows based on documented product risk (test strategy priority, scenario coverage, domain priority, issue severity), capturing per-state evidence and producing a RUN-<timestamp> report. Read `.testatlas/commands/test/test-critical-flows.md` for full instructions.
- Required capabilities: shell, browser, MCP, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-triage

Deduplicate, normalize, group, and flag-as-blocker the issues under _testatlas/to_fix/; identify missing evidence; emit triage-report-<timestamp>.md. Read `.testatlas/commands/triage.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-uninstall

Remove the TestAtlas suite tree (`.testatlas/`) per the install manifest; with `--purge`, also remove the `_testatlas/` workspace. Operator-confirmed; never runs without explicit invocation. Read `.testatlas/commands/uninstall.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-update

Invoke the suite self-update flow — checks GitHub Releases per UPDATE-01, delegates to Phase 7 update.js for atomic apply with backup, never auto-applies without operator confirmation. Read `.testatlas/commands/update.md` for full instructions.
- Required capabilities: shell, web-fetch, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.

## /atlas-validate-workspace

Schema-validate the _testatlas/ workspace; surface drift, broken links, orphaned evidence, and other PRD §33 violations as findings. Read `.testatlas/commands/validate-workspace.md` for full instructions.
- Required capabilities: shell, file-write.
- Lifecycle: 03_execution_status.md, 09_artifact_index.md, 10_command_log.md, 11_workspace_manifest.json, history/run_log.md.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
