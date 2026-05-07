# Continue.dev Adapter

This adapter ships TestAtlas's 30 commands as Continue.dev prompts. Once installed, every command is invocable in Continue's Chat / Plan / Agent modes as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Continue auto-discovers prompts at `.continue/prompts/<name>.prompt.md` per project, or `~/.continue/prompts/<name>.prompt.md` machine-wide.

## Install

```sh
# Project-local:
npx testatlas init
# Or global:
npx testatlas init --global
```

`--global` writes the 30 prompts to `~/.continue/prompts/atlas-*.prompt.md`. Continue picks them up automatically — open the slash-command picker to confirm they appear.

## Capabilities

Continue declares: `shell`, `web-fetch`, `MCP`, `file-write`. **No first-class browser automation** in Continue today (Agent mode runs tools, but headless-browser drivers are MCP-server-provided rather than core). Source commands needing `browser` carry the canonical degradation prose in their bodies; Continue will work statically from source artifacts and mark findings `confidence: needs-validation`.

## Format

Continue prompts are markdown with a YAML frontmatter block:

- `name: atlas-<command>` — the slash-name (without the leading `/`).
- `description` — copied verbatim from the TestAtlas command source; shown in the slash-command picker.
- `invokable: true` — surfaces the prompt in the slash-command picker (Continue's contract for user-invokable prompts).

The prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **Browser-only commands degrade.** `atlas-explore-ui`, `atlas-test-flow`, and similar UI-runtime commands run as static-analysis under Continue (see Capabilities).
- **Mode selection is the user's choice.** TestAtlas doesn't pin Chat / Plan / Agent — you choose at invocation time. Most commands work best in Agent mode.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter continue-dev`. Do **not** hand-edit any `atlas-*.prompt.md` under `.continue/prompts/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter continue-dev` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter continue-dev --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **simulated** mode. Continue.dev single-agent — councils run as multi-pass slash invocations.

**Council orchestration via simulated multi-pass.** Each council round runs as a sequential prompt; the operator (or the prior round's output) primes the persona context for the next round.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
/atlas-init                       # bootstrap V2 workspace
/atlas-status                     # show coverage + drift summary
/atlas-council-domain-review      # run council on a domain
```

### Caveats

- Council orchestration is simulated: the same agent role-plays each persona sequentially. For high-stakes councils, prefer a subagent-capable adapter (claude-code, opencode, kilocode, codex, gemini-cli, cline, kiro, sourcegraph-amp).
