# TestAtlas JSON Schemas

_Auto-generated from `.testatlas/schemas/*.schema.json` by `scripts/generate-schemas-doc.js`. Do not edit by hand._

Every machine-readable artifact in TestAtlas is governed by a JSON Schema (Draft 2020-12). `validate-workspace` enforces these schemas across the `_testatlas/` workspace tree. This index covers all 19 schemas shipped with v1.

See [docs/COMMANDS.md](./COMMANDS.md) for the commands that consume and produce these schemas.

---

## TestAtlas Adapter Capabilities

Per-adapter capability declarations. Each TestAtlas command declares required capabilities in its frontmatter; an adapter is allowed to render the command only if it declares all of those capabilities (or provides a capability-degradation render for the missing ones).

**`$id`:** `https://testatlas.dev/schemas/adapter-capabilities.schema.json`

**Top-level properties:** `version`, `adapters`

[Source](../.testatlas/schemas/adapter-capabilities.schema.json)

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

**Top-level properties:** `domains`, `routes`, `components`, `apis`, `cliCommands`, `jobs`, `integrations`, `entities`, `flows`, `tests`, `relationships`

[Source](../.testatlas/schemas/app-map.schema.json)

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

Schema for history/command_history.jsonl entries and 10_command_log.md table rows (PRD §30). Required: command, invokedAt, completedAt, status, outputs, errors, artifactsCreated, artifactsUpdated, manifestUpdated — exactly 9 fields, matching Plan 02-02's command-log template.

**`$id`:** `https://testatlas.dev/schemas/v1/command-result.schema.json`

**Top-level properties:** `command`, `invokedAt`, `completedAt`, `status`, `outputs`, `errors`, `artifactsCreated`, `artifactsUpdated`, `manifestUpdated`

[Source](../.testatlas/schemas/command-result.schema.json)

---

## TestAtlas Component

Schema for components/<domain>/COMPONENT-<name>.{md,json} (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/component.schema.json`

**Top-level properties:** `id`, `name`, `domain`, `usedOnPages`, `states`, `accessibilityNotes`, `evidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/component.schema.json)

---

## TestAtlas Domain

Schema for domains/<slug>/domain.json (PRD §15).

**`$id`:** `https://testatlas.dev/schemas/v1/domain.schema.json`

**Top-level properties:** `id`, `name`, `displayName`, `status`, `confidence`, `purpose`, `primaryUserGoals`, `personas`, `entryPoints`, `routes`, `apis`, `components`, `entities`, `flows`, `dependencies`, `issues`, `evidence`, `openQuestions`, `lastUpdatedAt`

[Source](../.testatlas/schemas/domain.schema.json)

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

**Top-level properties:** `id`, `name`, `domain`, `persona`, `priority`, `status`, `confidence`, `goal`, `preconditions`, `entryPoints`, `expectedBehavior`, `alternatePaths`, `edgeCases`, `failurePaths`, `dataRequirements`, `dependencies`, `testScenarios`, `evidence`, `issues`, `retestNotes`, `lastUpdatedAt`

[Source](../.testatlas/schemas/flow.schema.json)

---

## TestAtlas Install Manifest

**`$id`:** `https://testatlas.dev/schemas/v1/install-manifest.schema.json`

**Top-level properties:** `manifestVersion`, `suiteVersion`, `schemaVersion`, `installedAt`, `target`, `adapters`, `files`

[Source](../.testatlas/schemas/install-manifest.schema.json)

---

## TestAtlas Issue

Schema for to_fix/ISSUE-<id>-<slug>.{md,json} (PRD §17).

**`$id`:** `https://testatlas.dev/schemas/v1/issue.schema.json`

**Top-level properties:** `id`, `slug`, `title`, `status`, `severity`, `confidence`, `type`, `domain`, `flow`, `environment`, `persona`, `foundOn`, `foundBy`, `summary`, `expectedBehavior`, `actualBehavior`, `userImpact`, `reproductionSteps`, `frequency`, `evidence`, `relatedFiles`, `relatedCode`, `suspectedRootCause`, `scope`, `suggestedFixDirection`, `acceptanceCriteria`, `retestNotes`, `history`, `lastUpdatedAt`

[Source](../.testatlas/schemas/issue.schema.json)

---

## TestAtlas Report

Schema for reports/REPORT-*.{md,json} (PRD §20).

**`$id`:** `https://testatlas.dev/schemas/v1/report.schema.json`

**Top-level properties:** `id`, `generatedAt`, `runSummary`, `environmentsCovered`, `domainsCovered`, `flowsCovered`, `testsExecuted`, `evidenceCount`, `keyFindings`, `highestSeverityIssues`, `blockers`, `gaps`, `assumptions`, `recommendedNextActions`, `retestRecommendations`, `readinessAssessment`

[Source](../.testatlas/schemas/report.schema.json)

---

## TestAtlas Route / Page

Schema for pages/PAGE-<slug>.md frontmatter or accompanying JSON (PRD §11).

**`$id`:** `https://testatlas.dev/schemas/v1/route.schema.json`

**Top-level properties:** `id`, `path`, `domain`, `methods`, `personas`, `purpose`, `entryPoints`, `actions`, `states`, `evidence`, `issues`, `confidence`, `lastUpdatedAt`

[Source](../.testatlas/schemas/route.schema.json)

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

**Top-level properties:** `id`, `startedAt`, `endedAt`, `environment`, `commandsExecuted`, `scenariosRun`, `passed`, `failed`, `blocked`, `evidence`, `issuesCreated`, `flowConfidenceUpdates`

[Source](../.testatlas/schemas/test-run.schema.json)

---

## TestAtlas Test Scenario

Schema for tests/scenarios/TEST-<domain>-<slug>.{md,json} (PRD §19).

**`$id`:** `https://testatlas.dev/schemas/v1/test-scenario.schema.json`

**Top-level properties:** `id`, `name`, `domain`, `flow`, `priority`, `type`, `status`, `userGoal`, `preconditions`, `testData`, `steps`, `expectedResults`, `evidence`, `issues`, `lastUpdatedAt`

[Source](../.testatlas/schemas/test-scenario.schema.json)

---

## TestAtlas Workspace Manifest

Schema for _testatlas/11_workspace_manifest.json (PRD §14.11).

**`$id`:** `https://testatlas.dev/schemas/v1/workspace-manifest.schema.json`

**Top-level properties:** `suite`, `workspaceVersion`, `workspaceDir`, `initializedAt`, `lastUpdatedAt`, `project`, `counts`, `latestReport`, `status`, `generatedSections`

[Source](../.testatlas/schemas/workspace-manifest.schema.json)

---
