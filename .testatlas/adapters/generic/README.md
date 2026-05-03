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
