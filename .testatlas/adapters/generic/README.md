# Generic Prompt Adapter

A capability-agnostic, paste-able prompt set for **any** AI coding agent that lacks first-party slash-command tooling. Each `prompts/atlas-<command>.md` is a self-contained markdown file whose body you paste into the agent's chat to invoke that TestAtlas command.

## Install

There is no installer to run and no slash-command surface to register. Two paths:

```sh
# Path A: keep the prompts in the suite tree, copy/paste from there
ls .testatlas/adapters/generic/prompts/

# Path B: copy them into your project for easier discovery
cp -r .testatlas/adapters/generic/prompts/ <target-repo>/atlas-prompts/
```

## Capabilities

This adapter declares **all five** capabilities:

- `browser`
- `shell`
- `web-fetch`
- `MCP`
- `file-write`

Unlike the per-platform adapters (Cursor, Aider) that downgrade declared capabilities to match what the host agent provides, the Generic adapter delegates that decision to **the receiving agent at paste time**. The agent that receives a Generic prompt should read `.testatlas/bootstrap.md` §4 (capability-aware degradation), declare the capabilities it actually has, and run each command honestly — degrading and emitting `confidence: needs-validation` whenever a required capability is missing.

## How to use

The Generic adapter has no auto-loading; you control what context the agent sees. The two-step paste contract is **non-negotiable**:

1. **STEP 1 — paste the bootstrap.** Open `.testatlas/bootstrap.md` and paste it into a fresh agent conversation. The agent now knows TestAtlas's safety rules, persistence model, two-tree invariant, and confidence taxonomy.
2. **STEP 2 — paste a single prompt.** Open `prompts/atlas-<command>.md` (e.g. `atlas-init.md`, `atlas-explore-ui.md`, `atlas-plan.md`) and paste its body into the same conversation. The agent will execute that command following the bootstrap's rules.

If you skip STEP 1, the agent receives the BOOTSTRAP_PREAMBLE reminder embedded in every prompt file and will refuse to proceed until you provide `.testatlas/bootstrap.md`. That refusal is correct — the suite's safety contract requires the constitution to be loaded first.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter generic`. Do **not** hand-edit any `atlas-*.md` under `prompts/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter generic` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter generic --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **prompt-pivot** mode. Generic prompts — operator pastes persona context manually before each council round.

**Council orchestration via simulated multi-pass.** Each council round runs as a sequential prompt; the operator (or the prior round's output) primes the persona context for the next round.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
# Adapter applies V1 + V2 commands as a single concatenated rules file.
# Operator types the slash-style invocation in chat:
/atlas-init
/atlas-council-domain-review
```

### Caveats

- Council orchestration is simulated: the same agent role-plays each persona sequentially. For high-stakes councils, prefer a subagent-capable adapter (claude-code, opencode, kilocode, codex, gemini-cli, cline, kiro, sourcegraph-amp).
