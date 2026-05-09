# Capability Vocabulary

> **When to read this:** You are about to take an action that requires a capability and need to confirm the capability is available, or you are writing a command file and need to declare its required capabilities.

TestAtlas adapters declare per-adapter capabilities (Phase 6 ships `adapter-capabilities.json`). Until that file is shipped, treat the conservative default as: only the capabilities you have already successfully used in this session are available. Do not assume — confirm.

## The nine capabilities

> **Note (Phase 14 V2 + Phase 21):** The original 6-capability set (browser, shell, web-fetch, MCP, file-write, subagent-spawn) was extended in Phase 14 with three V2 capabilities — `council-orchestration`, `persona-context`, `brain-sync` — to model the multi-agent council + brain layer. Wave 1 of Phase 21 (Plan 21-02) wired them onto concrete consumers (the 10 `council-*` sub-commands plus `create-persona.md` + `consolidate.md`). They are no longer dead code.

### browser

The agent can drive a browser (Chrome DevTools MCP, Playwright wrapper, or equivalent) to navigate, click, type, screenshot, capture network and console.

**Used by:** UI Explorer, accessibility checks, performance checks, end-to-end flow tests.

### shell

The agent can execute shell commands (Bash, sh, or platform equivalent) and capture exit codes, stdout, stderr.

**Used by:** CLI Explorer, runtime checks, package-script invocation, build-tool exercises.

### web-fetch

The agent can issue outbound HTTP(S) requests to public endpoints. Distinct from `browser` — `web-fetch` is request/response only and does not include navigation, JavaScript execution, or DOM access.

**Used by:** API Explorer for documented endpoints, update-check (Phase 7), schema fetches.

### MCP

The agent can communicate with Model Context Protocol servers (Chrome DevTools, custom MCP servers, third-party tool servers).

**Used by:** UI Explorer (preferred path when available), specialized integrations, structured tool surfaces.

### file-write

The agent can write files inside the workspace (`_testatlas/`) and the suite (`.testatlas/`) when explicitly authorized by the safety rules in bootstrap §4.

**Used by:** every persistence step; without this, no findings can be recorded and no test runs can be journaled.

### subagent-spawn

The agent host supports parallel sub-agent invocation driven from a markdown command file (e.g. Claude Code's Task/Agent tool, OpenCode/Kilocode/Cline subagent files, Codex/Gemini `@agent-name` syntax, Copilot CLI `/fleet`, Kiro skills, Sourcegraph Amp subagent declarations). When this capability is unavailable, umbrella commands MUST fall back to sequential execution and mark output records `executionMode: 'sequential-fallback'` per `bootstrap.md` § Capability Degradation. See the per-host invocation table in `bootstrap.md` for the canonical 18-adapter matrix.

**Used by:** umbrella orchestration commands (e.g. `/atlas:explore`, `/atlas:plan`, `/atlas:test-flow`) when fan-out across multiple child commands is preferable to sequential execution.

### council-orchestration

**Definition.** Declares that this command runs the V2 council 9-round protocol — i.e. spawns one sub-agent per declared participant for rounds 2 (Independent review) and 3 (Initial findings) and runs rounds 1, 4-9 inline. Distinct from the lower-level `subagent-spawn` capability (which is the host primitive); `council-orchestration` is the command-level commitment to the per-persona spawn shape defined in `.testatlas/reference/council-protocol.md` §7.

**Consumers (10 sub-commands).** All `.testatlas/commands/council/council-*.md` files declare this capability EXCEPT the dispatcher `council.md`: `council-domain-review`, `council-flow-review`, `council-product-review`, `council-bug-triage`, `council-release-readiness`, `council-red-team`, `council-brain-audit`, `council-retest`, `council-design-critique`, `council-test-plan`.

**NOT consumed by.** `council.md` (the dispatcher) — it routes councils but does not run one. This boundary is enforced by Phase-21's `test/council-orchestration.test.js` Test 7 (Path B+ verdict — dispatcher gets `subagent-spawn` only, never the 3 V2 caps).

**Runtime contract.** When a host has both `subagent-spawn` AND the council command has `council-orchestration`, the orchestrator MAY spawn one persona-child per participant for rounds 2 and 3. The `session.json` `executionMode` field records what actually happened — one of the 6 values in `.testatlas/schemas/council_session.schema.json` (`parallel-subagents`, `single-spawn-inline`, `sequential-fallback`, `classify-only`, `inline-simulation`, `no-op`). The orchestrator picks the value via the 5-tier auto-detect table in `scripts/create-council-session.js`'s `detectExecutionMode` helper (or via the `--execution-mode` CLI flag); if both signals are absent (Tier 5), the field is OMITTED from `session.json` and the orchestrator records it post-hoc rather than producing systematically-wrong audit data.

### persona-context

**Definition.** Declares that this command slices context per persona via the persona's `read_first` allow-list. When a persona-child is spawned (rounds 2-3 of a council), the orchestrator passes only the persona's own `read_first` paths plus the session's `prompt.md` + `context_bundle.md` — NOT the full transcript. This enforces the independence cognitive contract: each persona reasons in its own scoped context. See `.testatlas/reference/council-protocol.md` §7 for the per-round mode table.

**Consumers.** Same 10 council-* sub-commands as `council-orchestration`. Also declared by `.testatlas/commands/create-persona.md` (which authors persona JSON sidecars including the `read_first` array) per the existing Phase-14 wire-up.

**NOT consumed by.** `council.md` dispatcher — it does not orchestrate persona work.

**Runtime contract.** The orchestrator reads each persona's `_testatlas/agents/personas/<type>/<persona-id>.json` and resolves the `read_first` array (5-7 paths typical) into the per-child brief's `files-to-read` slot. The child sees only those files — its independence is structurally enforced by what the orchestrator hands it. Adapter renderers must preserve the `read_first` semantics when translating per-host spawn primitives.

### brain-sync

**Definition.** Declares that this command writes consolidated council outputs back into the canonical brain on round 9 (Canonical updates) — specifically into `_testatlas/brain/decisions.json`, `_testatlas/brain/open_questions.json`, and any related canonical artifacts referenced in the council's `consolidation.json`. This is the only round that writes outside the session directory; it runs via `node .testatlas/scripts/consolidate-council.js`.

**Consumers.** Same 10 council-* sub-commands as `council-orchestration`. Also declared by `.testatlas/commands/consolidate.md` (the standalone consolidator) per the existing Phase-14 wire-up.

**NOT consumed by.** `council.md` dispatcher (does not run the consolidation hook).

**Runtime contract.** After round 8 produces `consolidation.json` for a session, the orchestrator invokes `node .testatlas/scripts/consolidate-council.js`, which applies accepted findings to the brain. The persona's `may_update` allow-list governs which canonical paths a given finding can touch; entries outside `may_update` become `open_questions` instead of `decisions`. Run records `executionMode_justification` if the brain-sync was skipped or partially applied.

## Capability-aware degradation rule (mirrored from bootstrap §4)

Before any action requiring a capability, confirm it is available. If unavailable:

1. MUST NOT fabricate output as if the action succeeded.
2. MUST mark any resulting finding `confidence: needs-validation`.
3. MUST add a `tool_unavailable: <capability>` field to the artifact (issue, evidence, finding).
4. SHOULD propose an alternative path that does not require the missing capability (e.g., code-reading instead of browser).

The `tool_unavailable` field is part of every finding-bearing schema in Phase 2. It is the structural evidence that an agent honored the degradation rule rather than silently fabricating.

## Per-capability action matrix

| Capability        | Confirms via                                          | Fallback when unavailable                          | Mandatory action when available                                       |
|-------------------|-------------------------------------------------------|----------------------------------------------------|-----------------------------------------------------------------------|
| `browser`         | Successful navigation + screenshot capture            | Code-read the route handler / static template      | Drive UI walkthroughs per `reference/chrome-devtools-mcp.md` patterns |
| `shell`           | Successful `node --version` (or equivalent)           | Read package scripts and document expected behavior | Execute scenarios that need test runners, dev servers, or fixtures    |
| `web-fetch`       | Successful GET to a known-public endpoint             | Document expected request/response from API docs   | Issue documented HTTP requests for API explorer / update-check        |
| `MCP`             | Successful tool list from the MCP server              | Fall back to `browser` or `shell` capability       | Invoke canonical Chrome DevTools MCP toolset per `reference/chrome-devtools-mcp.md` (Tier 1–4) |
| `file-write`      | Successful write + read-back to a temp file           | HALT; without `file-write` no findings persist     | Persist all command outputs atomically per `bootstrap.md` §5          |
| `subagent-spawn`  | Host-specific spawn primitive returns a child handle  | Sequential execution with `executionMode: 'sequential-fallback'` | Fan out independent subtasks per umbrella commands' Sub-Agent Orchestration sections |
| `council-orchestration` | Command frontmatter declares it AND host has `subagent-spawn` | Inline-simulate per `council-protocol.md` §7 (`executionMode: 'inline-simulation'`) | Run 9-round protocol; spawn one persona-child per participant for rounds 2-3 |
| `persona-context` | Persona JSON sidecar resolves with a non-empty `read_first` array | Pass full `prompt.md`+`context_bundle.md` to the child (independence weakened) | Resolve each persona's `read_first` paths into the spawn brief `files-to-read` slot |
| `brain-sync`      | `node .testatlas/scripts/consolidate-council.js --session-id <id>` exits 0 | Skip canonical write; record `executionMode_justification` explaining why | Apply round-9 consolidation to `_testatlas/brain/{decisions,open_questions}.json` |

## Schema reference

The nine values are enumerated in `.testatlas/schemas/vocabulary.schema.json` at `$defs/capability` and referenced from every adapter capability declaration via `$ref`. Do not introduce new capability values without a PRD revision. Phase 14 V2 added `council-orchestration`, `persona-context`, `brain-sync`; Phase 21 Wave 1 wired them onto concrete consumers (the 10 `council-*` sub-commands plus `create-persona.md` + `consolidate.md`).

## Deferred to vN+1

The following capabilities have schema/structure surfaces in the v2 brain layer but are intentionally deferred to a future major release. They are NOT required by `validate-brain.js` and producers/consumers will be wired in vN+1:

- **embeddings_manifest** — semantic search index over the brain. Schema field exists at `_testatlas/brain/embeddings_manifest.json`; producer is deferred. As of Phase 22 (DEC-008), `validate-brain.js` no longer requires this file; presence is tolerated for forward-compat with future vN+1 producers. The post-Phase-22 required-files count is 22 brain files (19 JSON + 3 JSONL), down from 23 (20 JSON + 3 JSONL).

## Concatenated-Conventions Adapter Limitations

Four adapters use a concatenated-conventions rendering style that caps each command's `## Sub-Agent Orchestration` section to 1-3 lines as a reference rather than reproducing the full orchestration body:

- **aider** — `.aider.conventions.md` per-section cap
- **roo-code** — `.roo/instructions.md` per-section cap
- **zed** — `.rules` per-section cap
- **amazon-q** — `.amazon-q/conventions.md` per-section cap

When TestAtlas commands run on these hosts, the runtime behavior collapses to **inline-simulation** regardless of source command edits. The `bootstrap.md` 18-adapter matrix entries (`yes` / `sequential` for these four) describe declared capability, not execution fidelity. For audit-grade honesty (DEC-010), downstream consumers SHOULD treat council sessions originating from these hosts as `executionMode: 'inline-simulation'` even when participants ≥ 2. The post-spawn `record-execution-mode.js` invocation wired into the 10 `council-*` sub-commands is the canonical place to record this honestly when the host's runtime collapses to inline-simulation.

> NOTE: If the `bootstrap.md:70-89` matrix entries change for these adapters, this section MUST be revisited.
