# TestAtlas JSON Schemas

_Auto-generated from `.testatlas/schemas/*.schema.json` by `scripts/generate-schemas-doc.js`. Do not edit by hand._

Every machine-readable artifact in TestAtlas is governed by a JSON Schema (Draft 2020-12). `validate-workspace` enforces these schemas across the `_testatlas/` workspace tree. This index covers all 39 schemas shipped with v1.

See [docs/COMMANDS.md](./COMMANDS.md) for the commands that consume and produce these schemas.

---

## TestAtlas Adapter Capabilities

Per-adapter capability declarations. Each TestAtlas command declares required capabilities in its frontmatter; an adapter is allowed to render the command only if it declares all of those capabilities (or provides a capability-degradation render for the missing ones).

**`$id`:** `https://testatlas.dev/schemas/v1/adapter-capabilities.schema.json`

**Top-level properties:** `version`, `adapters`

[Source](../.testatlas/schemas/adapter-capabilities.schema.json)

---

## adapter

**`$id`:** `https://testatlas.dev/schemas/v2/adapter.schema.json`

**Top-level properties:** `name`, `version`, `supported_commands`, `capabilities`, `persona_strategy`, `install_path`

[Source](../.testatlas/schemas/adapter.schema.json)

---

## TestAtlas API Endpoint

Schema for api/endpoints/API-<method>-<path>.md frontmatter (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/api-endpoint.schema.json`

**Top-level properties:** `id`, `method`, `path`, `domain`, `auth`, `inputContract`, `responseContract`, `errors`, `pagination`, `rateLimit`, `evidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/api-endpoint.schema.json)

---

## TestAtlas Application Map

Schema for _testatlas/12_app_map.json — graph of every artifact in the workspace + cross-artifact relationships (PRD §14.12, §21).

**`$id`:** `https://testatlas.dev/schemas/v1/app-map.schema.json`

**Top-level properties:** `domains`, `routes`, `components`, `apis`, `cliCommands`, `jobs`, `integrations`, `entities`, `flows`, `tests`, `relationships`, `errorHandling`, `integrationEnvironments`, `runtimeMetadata`, `observability`, `securityFindings`, `states`

[Source](../.testatlas/schemas/app-map.schema.json)

---

## assumption

**`$id`:** `https://testatlas.dev/schemas/v2/assumption.schema.json`

**Top-level properties:** `id`, `assumption`, `basis`, `invalidated_by`, `status`

[Source](../.testatlas/schemas/assumption.schema.json)

---

## TestAtlas V2 Claim

A single claim extracted from a council transcript or persona output. PRD §7.10 / §11.1. Each claim is attributable to a speaker, links to evidence, and carries explicit epistemic status (type, confidence, status).

**`$id`:** `https://testatlas.dev/schemas/v2/claim.schema.json`

**Top-level properties:** `id`, `session_id`, `speaker`, `type`, `claim`, `confidence`, `evidence`, `related_domains`, `related_flows`, `status`, `created_at`

[Source](../.testatlas/schemas/claim.schema.json)

---

## TestAtlas CLI Command

Schema for cli/commands/CLI-<slug>.md frontmatter (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/cli-command.schema.json`

**Top-level properties:** `id`, `command`, `description`, `safety`, `args`, `flags`, `exitCodes`, `helpOutput`, `evidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/cli-command.schema.json)

---

## TestAtlas Command Instruction

Schema for the YAML frontmatter of every .testatlas/commands/*.md file (PRD §11, §38; CMD-02, CMD-04, CMD-05).

**`$id`:** `https://testatlas.dev/schemas/v1/command-instruction.schema.json`

**Top-level properties:** `command`, `version`, `description`, `capabilities`, `produces`, `consumes`, `lifecycle`, `boundary`

[Source](../.testatlas/schemas/command-instruction.schema.json)

---

## TestAtlas Command Result

Schema for history/command_history.jsonl entries and 10_command_log.md table rows (PRD §30). 9 required fields (command, invokedAt, completedAt, status, outputs, errors, artifactsCreated, artifactsUpdated, manifestUpdated) plus 1 optional `executionMode` enum populated by orchestrator commands (Quick 260505-hld / F-11 Option A). Existing rows without `executionMode` continue to validate.

**`$id`:** `https://testatlas.dev/schemas/v1/command-result.schema.json`

**Top-level properties:** `command`, `invokedAt`, `completedAt`, `status`, `outputs`, `errors`, `artifactsCreated`, `artifactsUpdated`, `manifestUpdated`, `executionMode`

[Source](../.testatlas/schemas/command-result.schema.json)

---

## TestAtlas Component

Schema for components/<domain>/COMPONENT-<name>.{md,json} (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/component.schema.json`

**Top-level properties:** `id`, `name`, `domain`, `usedOnPages`, `states`, `accessibilityNotes`, `evidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/component.schema.json)

---

## council_session

**`$id`:** `https://testatlas.dev/schemas/v2/council_session.schema.json`

**Top-level properties:** `id`, `topic`, `scope`, `participants`, `status`, `created_at`, `completed_at`, `orchestrator`, `executionMode`, `executionMode_justification`, `outputs_audit`

[Source](../.testatlas/schemas/council_session.schema.json)

---

## TestAtlas V2 Coverage Index

Brain coverage map. PRD §7.13 / §11.1. Tracks which routes, components, endpoints, CLI commands, jobs, and integrations have been tested, when, and by what. Plan 14-03 extended the v2 contract to include jobs + integrations as optional categories alongside the four required (routes, components, endpoints, commands).

**`$id`:** `https://testatlas.dev/schemas/v2/coverage.schema.json`

**Top-level properties:** `schema_version`, `last_updated`, `coverage`

[Source](../.testatlas/schemas/coverage.schema.json)

---

## TestAtlas V2 Dashboard Data Export

Pre-aggregated JSON shape consumed by external dashboards. PRD §16. Generated by `generate-dashboard-data.js` from brain state. Mirrors PRD §23 example brain summary plus issue and council aggregates.

**`$id`:** `https://testatlas.dev/schemas/v2/dashboard_data.schema.json`

**Top-level properties:** `schema_version`, `generated_at`, `project`, `quality_summary`, `domains`, `issues_by_severity`, `council_activity`, `drift`

[Source](../.testatlas/schemas/dashboard_data.schema.json)

---

## decision

**`$id`:** `https://testatlas.dev/schemas/v2/decision.schema.json`

**Top-level properties:** `id`, `session_id`, `topic`, `vote_summary`, `rationale`, `accepted`, `rejected`, `disputed`, `created_at`, `resolved_at`

[Source](../.testatlas/schemas/decision.schema.json)

---

## TestAtlas Domain

Schema for domains/<slug>/domain.json (PRD §15).

**`$id`:** `https://testatlas.dev/schemas/v1/domain.schema.json`

**Top-level properties:** `id`, `name`, `displayName`, `status`, `confidence`, `purpose`, `primaryUserGoals`, `personas`, `entryPoints`, `routes`, `apis`, `components`, `entities`, `flows`, `dependencies`, `issues`, `evidence`, `openQuestions`, `lastUpdatedAt`

[Source](../.testatlas/schemas/domain.schema.json)

---

## drift_record

**`$id`:** `https://testatlas.dev/schemas/v2/drift_record.schema.json`

**Top-level properties:** `id`, `git_ref`, `changed_files`, `affected_domains`, `affected_flows`, `drift_status`, `detected_at`

[Source](../.testatlas/schemas/drift_record.schema.json)

---

## event

**`$id`:** `https://testatlas.dev/schemas/v2/event.schema.json`

**Top-level properties:** `id`, `timestamp`, `actor`, `command`, `type`, `summary`, `artifacts_read`, `artifacts_written`, `evidence`, `status`

[Source](../.testatlas/schemas/event.schema.json)

---

## TestAtlas Evidence Record

Schema for evidence/evidence_index entries (PRD §18). Phase 2 validates JSON shape only; file-existence checks belong to Phase 5.

**`$id`:** `https://testatlas.dev/schemas/v1/evidence.schema.json`

**Top-level properties:** `id`, `type`, `path`, `domain`, `flow`, `issue`, `capturedOn`, `environment`, `description`, `redacted`, `hash`

[Source](../.testatlas/schemas/evidence.schema.json)

---

## TestAtlas Example Script

The 19th JSON Schema (Plan 08-01). Describes the deterministic replay recipe for `examples/<name>/_testatlas-fixture/example-script.json`. The replay engine in scripts/lib/regenerate-core.js validates a script against this schema BEFORE invoking any Phase 5 emitter — bad scripts never mutate disk.

**`$id`:** `https://testatlas.dev/schemas/v1/example-script.schema.json`

**Top-level properties:** `exampleName`, `suiteVersionRange`, `fixedTimestamp`, `steps`

[Source](../.testatlas/schemas/example-script.schema.json)

---

## TestAtlas Flow

Schema for flows/FLOW-<domain>-<slug>.{md,json} (PRD §16).

**`$id`:** `https://testatlas.dev/schemas/v1/flow.schema.json`

**Top-level properties:** `id`, `name`, `domain`, `persona`, `priority`, `status`, `confidence`, `goal`, `preconditions`, `entryPoints`, `expectedBehavior`, `alternatePaths`, `edgeCases`, `failurePaths`, `dataRequirements`, `dependencies`, `testScenarios`, `evidence`, `issues`, `retestNotes`, `lastUpdatedAt`, `routeCoverage`, `dataLifecycle`, `apiEndpointsTouched`, `backgroundJobsTouched`, `personasConsulted`, `relatedCouncilSessions`, `qualityScore`, `automationCandidate`, `driftStatus`

[Source](../.testatlas/schemas/flow.schema.json)

---

## TestAtlas Install Manifest

**`$id`:** `https://testatlas.dev/schemas/v1/install-manifest.schema.json`

**Top-level properties:** `manifestVersion`, `suiteVersion`, `schemaVersion`, `installedAt`, `target`, `mode`, `adapters`, `files`

[Source](../.testatlas/schemas/install-manifest.schema.json)

---

## TestAtlas Issue

Schema for to_fix/ISSUE-<id>-<slug>.{md,json} (PRD §17).

**`$id`:** `https://testatlas.dev/schemas/v1/issue.schema.json`

**Top-level properties:** `id`, `slug`, `title`, `status`, `severity`, `confidence`, `type`, `domain`, `flow`, `environment`, `persona`, `foundOn`, `foundBy`, `summary`, `expectedBehavior`, `actualBehavior`, `userImpact`, `reproductionSteps`, `frequency`, `evidence`, `relatedFiles`, `relatedCode`, `suspectedRootCause`, `scope`, `suggestedFixDirection`, `acceptanceCriteria`, `retestNotes`, `history`, `lastUpdatedAt`, `discoveredByPersona`, `brainClaimIds`, `driftSensitivity`, `automationCandidate`, `councilConsensusLevel`, `evidenceStrength`, `retestPackPath`, `triagedAs`, `closedAs`, `closedOn`, `closedAt`, `closedBy`, `closedNote`, `closingPhase`, `closingPlan`, `closingCommit`, `closingNote`, `closingNotes`, `closingReq`, `closedByCommits`, `closedInPhase`, `consolidatedInto`, `statusHistory`, `by_phase`, `fix_commit`

[Source](../.testatlas/schemas/issue.schema.json)

---

## manifest

**`$id`:** `https://testatlas.dev/schemas/v2/manifest.schema.json`

**Top-level properties:** `schema_version`, `suite_version`, `initialized_at`, `last_updated`, `project_name`, `adapters`, `schema_uri`

[Source](../.testatlas/schemas/manifest.schema.json)

---

## TestAtlas Scenario Matrix

Schema for tests/matrix.json — the bundled scenario index produced by /atlas:plan (PRD §12.14). Each entry is a lightweight scenario reference; full scenario detail lives in tests/scenarios/TEST-*.{md,json}.

**`$id`:** `https://testatlas.dev/schemas/v1/matrix.schema.json`

**Top-level properties:** `generatedAt`, `scenarios`

[Source](../.testatlas/schemas/matrix.schema.json)

---

## persona

**`$id`:** `https://testatlas.dev/schemas/v2/persona.schema.json`

**Top-level properties:** `id`, `name`, `type`, `version`, `mission`, `domains`, `default_tools`, `read_first`, `may_update`, `must_not_update`, `output_schema`, `blind_spots`, `questions`

[Source](../.testatlas/schemas/persona.schema.json)

---

## quality_score

**`$id`:** `https://testatlas.dev/schemas/v2/quality_score.schema.json`

**Top-level properties:** `metric`, `score`, `evidence_refs`, `freshness`, `confidence`, `computed_at`

[Source](../.testatlas/schemas/quality_score.schema.json)

---

## TestAtlas V2 Brain Graph

Schema for _testatlas/brain/graph.json. PRD §11.1 (entities) + §11.2 (relationships). Defines the 16 PRD-mandated relationship types and the node/edge shape used by graph queries (drift impact, evidence reachability, blocked-release detection).

**`$id`:** `https://testatlas.dev/schemas/v2/relationship.schema.json`

**Top-level properties:** `schema_version`, `last_updated`, `nodes`, `edges`

[Source](../.testatlas/schemas/relationship.schema.json)

---

## TestAtlas Report

Schema for reports/REPORT-*.{md,json} (PRD §20). Accepts both V1 (legacy — string-array sections) and V2 (current — object-array sections + 15 named composite sections per generate-report.js).

**`$id`:** `https://testatlas.dev/schemas/v1/report.schema.json`

**Top-level properties:** `id`, `generatedAt`, `runSummary`, `kind`, `priorReport`, `generationMode`, `environmentsCovered`, `domainsCovered`, `flowsCovered`, `testsExecuted`, `evidenceCount`, `coverage`, `severityBreakdown`, `confidenceBreakdown`, `regressions`, `qualityRisks`, `testPyramidHealth`, `evidenceCatalogSummary`, `capabilityDegradation`, `scorecardSnapshot`, `trendVsPrior`, `runLogTail`, `readinessRationale`, `keyFindings`, `highestSeverityIssues`, `blockers`, `gaps`, `assumptions`, `recommendedNextActions`, `retestRecommendations`, `readinessAssessment`

[Source](../.testatlas/schemas/report.schema.json)

---

## TestAtlas V2 Retest Pack

Self-contained reproduction package for an issue. PRD §10.4 / §17 Phase 6. Captures exact steps, expected vs actual behavior, and evidence so any agent or human can re-verify the fix.

**`$id`:** `https://testatlas.dev/schemas/v2/retest_pack.schema.json`

**Top-level properties:** `id`, `issue_id`, `title`, `preconditions`, `steps`, `expected`, `actual`, `evidence`, `automation_candidate`, `automated_test_path`, `created_at`, `last_run_at`, `status`

[Source](../.testatlas/schemas/retest_pack.schema.json)

---

## risk

**`$id`:** `https://testatlas.dev/schemas/v2/risk.schema.json`

**Top-level properties:** `id`, `severity`, `description`, `affected_domains`, `affected_flows`, `mitigation`, `status`

[Source](../.testatlas/schemas/risk.schema.json)

---

## TestAtlas Route / Page

Schema for pages/PAGE-<slug>.md frontmatter or accompanying JSON (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/route.schema.json`

**Top-level properties:** `id`, `path`, `domain`, `methods`, `personas`, `purpose`, `entryPoints`, `actions`, `states`, `evidence`, `issues`, `confidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/route.schema.json)

---

## state

**`$id`:** `https://testatlas.dev/schemas/v2/state.schema.json`

**Top-level properties:** `schema_version`, `project`, `status`, `counts`, `confidence`, `next_recommended_commands`

[Source](../.testatlas/schemas/state.schema.json)

---

## TestAtlas V2 Story

A user story / requirement that defines expected behavior for one or more flows. PRD §11.1. Stories are the source-of-truth for 'what the product is supposed to do' and feed scenario generation (§7.14).

**`$id`:** `https://testatlas.dev/schemas/v2/story.schema.json`

**Top-level properties:** `id`, `title`, `actor`, `goal`, `expected_behavior`, `acceptance_criteria`, `related_flows`, `related_domains`, `evidence`, `status`, `priority`, `created_at`, `last_updated`

[Source](../.testatlas/schemas/story.schema.json)

---

## TestAtlas Sub-Agent Handoff

Schema for sub_agents/handoffs/HANDOFF-<slug>.md frontmatter (PRD §25).

**`$id`:** `https://testatlas.dev/schemas/v1/sub-agent-handoff.schema.json`

**Top-level properties:** `id`, `assignedRole`, `createdOn`, `createdBy`, `status`, `objective`, `scope`, `nonScope`, `filesToRead`, `filesMayUpdate`, `requiredEvidence`, `questions`, `constraints`, `outputLocation`, `outputStructure`, `completionCriteria`

[Source](../.testatlas/schemas/sub-agent-handoff.schema.json)

---

## TestAtlas Test Run

Schema for tests/runs/RUN-<timestamp>.{md,json} (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/test-run.schema.json`

**Top-level properties:** `id`, `startedAt`, `endedAt`, `environment`, `commandsExecuted`, `scenariosRun`, `passed`, `failed`, `blocked`, `evidence`, `issuesCreated`, `flowConfidenceUpdates`, `executionMode`, `children`, `skipped`, `summary`, `notes`

[Source](../.testatlas/schemas/test-run.schema.json)

---

## TestAtlas Test Scenario

Schema for tests/scenarios/TEST-<domain>-<slug>.{md,json} (PRD §19).

**`$id`:** `https://testatlas.dev/schemas/v1/test-scenario.schema.json`

**Top-level properties:** `id`, `name`, `domain`, `flow`, `priority`, `type`, `status`, `userGoal`, `preconditions`, `testData`, `steps`, `expectedResults`, `evidence`, `issues`, `confidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/test-scenario.schema.json)

---

## transcript

**`$id`:** `https://testatlas.dev/schemas/v2/transcript.schema.json`

**Top-level properties:** `id`, `session_id`, `round`, `speaker`, `speaker_type`, `timestamp`, `message_type`, `content`, `claims`, `evidence`, `confidence`

[Source](../.testatlas/schemas/transcript.schema.json)

---

## TestAtlas Shared Vocabularies

Single source of truth for severity, confidence, status enums, and ID patterns referenced by every TestAtlas schema. PRD §28 + §32.

**`$id`:** `https://testatlas.dev/schemas/v1/vocabulary.schema.json`

**Top-level properties:** _(none)_

[Source](../.testatlas/schemas/vocabulary.schema.json)

---

## TestAtlas Workspace Manifest

Schema for _testatlas/11_workspace_manifest.json (PRD §14.11).

**`$id`:** `https://testatlas.dev/schemas/v1/workspace-manifest.schema.json`

**Top-level properties:** `suite`, `workspaceVersion`, `schema_version`, `workspaceDir`, `initializedAt`, `lastUpdatedAt`, `project`, `counts`, `latestReport`, `status`, `generatedSections`

[Source](../.testatlas/schemas/workspace-manifest.schema.json)

---
