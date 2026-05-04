---
mode: agent
description: Map package scripts, binaries, and task runners for the target product; classify destructive vs safe commands; capture help text and exit codes for safe ones.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-cli.md" hash="6b7ef74be192a057" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map every command-line entry point the target product exposes — `package.json` scripts, `bin/` executables, `Makefile`/`Justfile` targets, language task runners (`pyproject.toml [tool.poe.tasks]`, `Cargo.toml [[bin]]`, `composer.json scripts`, `Rakefile`, `mix.exs`) — per PRD §13.2. Classify each as safe or destructive against `allowDestructiveActions`, run `--help` / `--version` on safe commands only, and record stdout, stderr, and exit codes as evidence. Outputs land in `_testatlas/12_app_map.json` (cli-command entries) and `_testatlas/evidence/explore-cli/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation), §8 (no-evidence-no-finding), §12 (explorer standards: destructive commands tagged `unsafe-without-flag`).
- `_testatlas/11_workspace_manifest.json` — initialization status; current counts.
- `_testatlas/12_app_map.json` — existing cli-command entries this command extends; never duplicates.
- `.testatlas/default.config.json` — read `allowDestructiveActions`. When `false`, destructive commands are recorded as findings but MUST NOT be executed.
- `.testatlas/schemas/cli-command.schema.json` — the output contract every cli-command entry must satisfy.
- Target repo manifests: `package.json` (`scripts`, `bin`), `Makefile`, `Justfile`, `pyproject.toml`, `Cargo.toml`, `composer.json`, `Rakefile`, `mix.exs`, plus any `bin/` directory entries.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Map the CLI surface — argument parsers, subcommands, flags, exit codes, help text, destructive-command flags — of the target product.
- **scope:** Every entry in `package.json#scripts` and `package.json#bin`, every `Makefile`/`Justfile`/`Rakefile` target, every `pyproject.toml`/`Cargo.toml`/`composer.json`/`mix.exs` script, plus loose binaries under `bin/`. Excludes test runners and lint scripts unless the operator opts in.
- **files-to-read:** `.testatlas/schemas/cli-command.schema.json`; `_testatlas/12_app_map.json`; `.testatlas/default.config.json` (`allowDestructiveActions`); the manifest files listed above.
- **output-format:** `cli-command` entries appended to `12_app_map.json` (validating against `cli-command.schema.json`), each with help-text capture, exit-code mapping, and a destructive-command flag where applicable. Evidence under `_testatlas/evidence/explore-cli/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** All non-test scripts enumerated; help text captured for each; destructive commands tagged `unsafe-without-flag` per `bootstrap.md` §12; schema validation passes.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every cli-command entry this command produces MUST cite an evidence file path under `_testatlas/evidence/explore-cli/<timestamp>/`. Fabricated paths fail `validate-workspace`.
2. Verify `shell` capability. **If `shell` is unavailable, MUST NOT execute any command** — fall back to manifest-only enumeration (read `package.json` scripts, `Makefile` targets, `bin/` entries, language task runners) and mark every finding `confidence: needs-validation` per `bootstrap.md` §4. Add `tool_unavailable: shell` to each entry. Never fabricate help text, exit codes, or runtime behavior from training-data priors.
3. Enumerate every command source the target ships:
   - `package.json` `scripts` map
   - `package.json` `bin` field plus any `bin/` directory entries
   - `Makefile` targets (parse `^[a-zA-Z0-9_-]+:`)
   - `Justfile` recipes
   - `pyproject.toml` `[tool.poe.tasks]`, `[project.scripts]`
   - `Cargo.toml` `[[bin]]` entries
   - `composer.json` `scripts`
   - `Rakefile`, `mix.exs`, language-specific task runners
4. **Safety classification.** For each command, classify as:
   - `safe` — verbs `help`, `list`, `status`, `check`, `lint`, `test`, `build`, `--version`, `--help`, `--dry-run`, `info`, `print`, `show`, `format` (non-mutating)
   - `destructive` — verbs `deploy`, `publish`, `push`, `release`, `drop`, `reset`, `purge`, `clean` (when it deletes), `migrate`, `seed`, `install` (modifies `node_modules` / lockfile), `prune`, `force`, `delete`, `truncate`, `restore`
   When `allowDestructiveActions=false` and a command is destructive, record the entry with `safety: destructive` and `executed: false`; do NOT invoke it. Surface refusal in `10_command_log.md`.
5. For each `safe` command, run `<cmd> --help` (fall back to `-h`) and `<cmd> --version` if applicable. Use a short timeout (≤15s). Capture stdout, stderr, exit code, and the exact invocation under `_testatlas/evidence/explore-cli/<timestamp>/<cmd-slug>/help.txt`, `version.txt`, `meta.json`.
6. Update `_testatlas/12_app_map.json` `cli-command` entries with: `name`, `source` (file path + line number), `runner` (npm / make / just / cargo / poe / etc.), `safety`, `executed`, `evidence` (array of paths from step 5), and any extracted subcommand list parsed from `--help`.
7. Validate the produced cli-command entries against `cli-command.schema.json`. Halt on validation failure; surface AJV errors verbatim.
8. Append a CLI section to `_testatlas/01_system_map.md` listing the discovered runners, total command counts (safe / destructive), and pointers to the evidence directory.
9. Close the lifecycle (next section).

## Outputs

- `_testatlas/12_app_map.json` — cli-command entries each citing at least one evidence path under `_testatlas/evidence/explore-cli/<timestamp>/`.
- `_testatlas/evidence/explore-cli/<timestamp>/` — per-command subdirectories containing `help.txt`, `version.txt`, `meta.json` (invocation, exit code, duration).
- Updated `_testatlas/01_system_map.md` — CLI section with runner inventory and safe/destructive counts.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence directory path, and counts of safe / destructive commands discovered.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row per `command-result.schema.json`. Note any refusals (destructive + `allowDestructiveActions=false`).
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute the cli-command count.
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` CLI commands (`<safe>` safe, `<destructive>` destructive) into `12_app_map.json`."

## Stop Conditions

- Target repo ships no recognizable CLI surface (no scripts, no `bin/`, no Make/Just) → record an empty inventory citing the absence and close. Do not fabricate commands.
- `shell` unavailable AND no manifests parseable → halt; the explorer cannot operate without at least one source-of-truth path.
- A destructive command would be invoked while `allowDestructiveActions=false` → refuse; record refusal in `10_command_log.md` and continue with remaining safe commands.
- `cli-command.schema.json` validation fails → halt; do not commit a malformed map.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- Every cli-command entry cites at least one evidence path that exists on disk under `_testatlas/evidence/explore-cli/<timestamp>/`.
- Manifest `counts.cli-commands` (or analogous) is updated to match the on-disk map.
- All safe commands have a captured `--help` and (when applicable) `--version` evidence file.
- Every destructive command has `safety: destructive` and `executed: false` recorded.
- The five lifecycle files above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that the CLI surface is mapped:

- **`/atlas:explore-codebase`** — cross-reference CLI commands with their handler source
- **`/atlas:test-flow`** — execute safe CLI flows end-to-end with evidence capture
- **`/atlas:plan`** — turn the cli-command inventory into a test plan
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
