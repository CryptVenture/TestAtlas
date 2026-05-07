<!-- TestAtlas command: atlas-bootstrap. Invoke as /prompts:atlas-bootstrap. Description: Refresh the agent's understanding of the TestAtlas constitution and reaffirm the rules in effect for this session per PRD §12.2. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/bootstrap.md" hash="cf013da35e9682172d8c29411d0605fc9afb242e983c26839936bb4ee83d160e" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-bootstrap.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Refresh the agent's understanding of the TestAtlas constitution and reaffirm the rules in effect for this session per PRD §12.2. This is a no-op in terms of product behavior — its only effect is the standard lifecycle close, so the session record reflects that the agent re-read and reaffirmed the rules.

## Required First Reads

- `.testatlas/bootstrap.md` — the only required read; load it start to finish.

## Required Actions

1. Re-read `.testatlas/bootstrap.md` from start to finish (all 24 PRD §9 sections).
2. Confirm the first-500-token rules are still in effect: identity, workspace ownership (`_testatlas/` is the only writable surface), instruction precedence, safety, and persistence (including `No evidence, no finding.` per `bootstrap.md` §8).
3. Note any conflicts between the constitution and prior decisions taken earlier in this session. Surface each conflict explicitly. Do not silently override.
4. Close the lifecycle (next section).

## Capability Degradation

The capability `subagent-spawn` indicates the host supports parallel sub-agent
invocation driven from a markdown command file. When an umbrella command's
instruction body includes a Sub-Agent Orchestration block, the agent MUST
detect this capability before spawning.

**If `subagent-spawn` is available:** spawn one sub-agent per applicable child
task in parallel; merge structured results into the umbrella's output. Mark
the run record `executionMode: 'parallel-subagents'`.

**If `subagent-spawn` is unavailable (sequential fallback):** execute child
tasks sequentially in the current context. Mark any output records with
`executionMode: 'sequential-fallback'`.

**Threshold guard:** if the applicable child-task count is < 2 after
filtering, run inline regardless of capability (degenerate single-spawn case
is always wasted overhead).

### Per-host invocation table

| Adapter            | subagent-spawn | Canonical 2026 invocation pattern                                          |
|--------------------|----------------|-----------------------------------------------------------------------------|
| claude-code        | yes            | Task tool / Agent tool (up to 7 parallel sub-agents per turn)              |
| opencode           | yes            | Subagent file in .opencode/agent/NAME.md; agents.max_depth=1 default       |
| kilocode           | yes            | Task tool subagent; respects agents.max_depth                              |
| codex              | yes            | @subagent-name syntax + Codex orchestrator (.codex/agents/NAME.md)         |
| gemini-cli         | yes            | @agent-name sub-agent syntax in prompt (.gemini/agents/NAME.md)             |
| github-copilot     | yes            | /fleet CLI sub-agent command (Copilot CLI only — IDE has no parallel sub-agents) |
| cline              | yes            | Native subagents via .clinerules/workflows/ Task primitive                  |
| kiro               | yes            | Custom subagent skills at .kiro/skills/; parallel by default               |
| sourcegraph-amp    | yes            | Subagent declaration in Amp config; isolated context per subagent          |
| cursor             | no             | UI-only /multitask — not driveable from .cursor/rules/*.mdc                |
| aider              | sequential     | Single-context terminal pair-programmer; sequential fallback               |
| continue-dev       | sequential     | No first-class subagent primitive in 2026; sequential                      |
| windsurf           | no             | Cascade uses parallel tools internally; no user-driven subagents           |
| zed                | no             | AI-assist only; no subagent spawn                                          |
| roo-code           | sequential     | Architect/Coder/Debugger role-modes only; sequential                       |
| amazon-q           | sequential     | Sunset (signups closed 2026-05-15); sequential                             |
| mcp                | runtime-probe  | Transport, not runtime; default false until host probes confirm yes        |
| generic            | runtime-probe  | Paste-target — default false; user may override per host                   |

The marker vocabulary (`yes`, `no`, `runtime-probe`, `sequential`, `false`) is
the single source of truth consumed by umbrella-orchestration commands. Hosts
marked `sequential` or `no` always take the sequential-fallback path; hosts
marked `runtime-probe` default to false until the host's runtime confirms
subagent capability is present.

Note: sub-agents are a host-runtime concept (Claude sub-agents, KiloCode
workflow steps, OpenCode subagent files, Codex `@subagent-name` invocations,
etc.); the suite no longer ships a `templates/sub_agents/` directory because
there is no workspace artifact for them. The sub-agent handoff template
(`templates/handoffs/HANDOFF.md`) writes to `_testatlas/handoffs/` per
`/atlas:handoff` — the workspace owns the contract record, not the runtime
spawn primitive.

## Acceleration Scripts

When `shell` is available, the suite ships idempotent, schema-validating accelerators under `.testatlas/scripts/`. Each named command below MAY invoke its accelerator instead of hand-rolling the artifact emission; manual fallback steps in every command remain intact for shell-less hosts (PRD §22).

| Command | Accelerator | Effect |
|---------|-------------|--------|
| `/atlas:init` | `init-workspace.js` | Bootstrap `_testatlas/` tree + manifest |
| `/atlas:log-issue` | `create-issue.js` | Emit `to_fix/ISSUE-*.{md,json}` (refuses empty evidence) |
| `/atlas:plan` | `create-flow.js` | Emit `flows/FLOW-*.{md,json}` |
| `/atlas:test-flow` | `create-evidence-record.js` | Emit `evidence/EVIDENCE-*/evidence.{md,json}` |
| `/atlas:map-domains` | `create-domain.js` | Emit `domains/<slug>/{domain.json,index.md,issues/index.md}` |
| `/atlas:report` | `generate-report.js` | Emit `reports/REPORT-latest.{md,json}` (17 PRD §20 sections) |
| `/atlas:consolidate` | `summarize-run.js` + `update-indexes.js` | Distill RUN-*.md; regenerate 09_artifact_index sections |
| `/atlas:cleanup` | `update-indexes.js` + `normalize-slugs.js` + `check-stale-docs.js` | Reconcile indexes; rename mis-slugged files; flag stale docs |
| `/atlas:handoff` | `summarize-run.js` + `normalize-slugs.js` | Session summary + slug hygiene before package-up |
| `/atlas:validate-workspace` | `validate-workspace.js` (+ `check-org-placeholder.js`, `check-stale-docs.js` aux) | Schema validation + auxiliary drift checks |
| `/atlas:update` | `update.js` | Atomic suite update with backup |
| `/atlas:uninstall` | `uninstall.js` | Manifest-driven removal (`--purge` for workspace too) |

**Canonical reconciler (cross-cutting):** after any command emits or mutates workspace artifacts, the canonical lifecycle reconciler is `node .testatlas/scripts/sync-status.js` (idempotent; reconciles `11_workspace_manifest.json` counts and the `03_execution_status.md` "## Counts" generated section against on-disk reality). Commands MUST invoke it as the final lifecycle step when `shell` is available; commands MAY skip it when `shell` is unavailable and instead hand-edit the manifest per the per-command Lifecycle section.

## Outputs

None beyond lifecycle records. This command intentionally produces no domain/flow/issue artifacts.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — note the bootstrap refresh.
- `_testatlas/09_artifact_index.md` — re-derive (no on-disk artifact change is expected).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt` only.
- `_testatlas/history/run_log.md` — narrative confirmation that the agent re-read the constitution and surfaced any conflicts.

## Stop Conditions

- `.testatlas/bootstrap.md` missing → halt with `Run testatlas install first.`
- Constitution unreadable, truncated, or schema-version mismatched → halt; refuse to fabricate the rules.
- Any prior session decision contradicts a `bootstrap.md` rule and cannot be safely reconciled → halt; surface the conflict per `bootstrap.md` §24 and wait for operator guidance.

## Completion Criteria

The agent emits a one-sentence confirmation that all 24 PRD §9 sections of `.testatlas/bootstrap.md` were re-read and either no precedence conflicts surfaced or the conflicts that did surface are listed verbatim. The five lifecycle files listed above are updated.

## What's Next

Now that the constitution is reloaded:

- **`/atlas:init`** — bootstrap the workspace if `_testatlas/` is missing or partial
- **`/atlas:validate-workspace`** — confirm capability profile + degradation rules align with on-disk artifacts
- **`/atlas:brain-validate`** — on V2 workspaces, validate the brain layer immediately after bootstrap.
- **`/atlas:status`** — V2 status snapshot of the freshly bootstrapped workspace.
- **`/atlas:bootstrap-refresh`** — long-running session shard refresh (V2 token-budget audit + bootstrap-shard regeneration).
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
