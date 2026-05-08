<!-- TestAtlas command: atlas-create-persona. Invoke as /atlas-create-persona. Description: Author a new persona (system, generated, or project scope) by invoking node .testatlas/scripts/create-persona.js — emits persona.{md,json} pair under _testatlas/agents/personas/<type>/<id>.{md,json} and updates brain/personas.json. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/create-persona.md" hash="cdc10e94d6fe76cf55509a202c5cd5aaedbb996e3ed30d97c229eeb39db942c6" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-create-persona.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Author a new persona — a character/role definition used by V2 council protocols (`council-bug-triage`, `council-design-critique`, `council-product-review`, etc.). Each persona has a scope (`system` for shipped-with-suite roles, `generated` for council-spawned ad-hoc roles, `project` for repo-specific roles) and lives under `_testatlas/agents/personas/<type>/<id>.{md,json}` validating against `persona.schema.json`. The brain index `_testatlas/brain/personas.json` is updated atomically.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/schemas/persona.schema.json` — schema all persona records must conform to (id, name, type, version, mission, domains).
- `_testatlas/agents/personas/system/` — existing system personas (read for naming + voice conventions).
- `_testatlas/agents/personas/project/` — existing project personas if any.
- `_testatlas/brain/personas.json` — current persona index; the new persona will be appended (or replaced by id).

## Required Actions

1. **Choose a persona slug, scope, name, and mission.** Slug is derived from `--name` (kebab-case, max 64 chars). Scope is one of `system | generated | project`. Mission is a one-paragraph statement of the persona's purpose, voice, and decision biases.
2. **Preferred path (if `shell`):** invoke the accelerator
   ```sh
   node .testatlas/scripts/create-persona.js \
     --name "<Human Name>" \
     --type <system|generated|project> \
     --mission "<one-paragraph mission>" \
     [--domains a,b,c] \
     [--version 2.0.0]
   ```
   The script:
   - validates the record against `persona.schema.json` BEFORE writing;
   - atomic-writes `_testatlas/agents/personas/<type>/<id>.md` and `<id>.json`;
   - updates `_testatlas/brain/personas.json` (replacing existing entry by id, else appending).
3. **Fallback (no `shell`):** hand-author the pair under `_testatlas/agents/personas/<type>/<id>.{md,json}` matching the schema verbatim, and hand-edit `_testatlas/brain/personas.json` to add the entry. Mark the run `confidence: needs-validation`.
4. **Edit the generated `persona.md`** to fill in role traits, voice, decision biases, and any domain-specific knowledge per the persona archetype. The script scaffolds a minimal markdown body; the operator (or follow-up agent) supplies the substance.
5. **Validate.** Run `node .testatlas/scripts/validate-workspace.js` to confirm the new persona conforms to schema and the brain index is internally consistent.
6. Close the lifecycle.

## Outputs

- `_testatlas/agents/personas/<type>/<id>.md` — human-readable persona narrative.
- `_testatlas/agents/personas/<type>/<id>.json` — machine-readable persona record validating against `persona.schema.json`.
- Updated `_testatlas/brain/personas.json` index.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new persona files appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`.
- `_testatlas/history/run_log.md` — narrative entry: "Authored persona `<id>` (<type>); brain/personas.json updated."

## Stop Conditions

- `--name`, `--type`, or `--mission` missing → halt; the script refuses with `TESTATLAS_INVALID_ARGS`.
- `--type` not one of `system | generated | project` → halt; the schema enum rejects.
- Persona record fails schema validation → halt; surface AJV errors verbatim. Do NOT write a malformed persona.
- `_testatlas/brain/` not initialized → halt: "Run `/atlas:core-init --mode upgrade` first."
- `safeMode: true` AND a step would mutate target-repo source files → halt; only `_testatlas/` is writable.

## Completion Criteria

- New persona pair exists at `_testatlas/agents/personas/<type>/<id>.{md,json}`.
- `persona.json` validates against `persona.schema.json`.
- `_testatlas/brain/personas.json` contains the new entry.
- The five lifecycle files updated.
- Zero stop conditions triggered.

## What's Next

- **`/atlas:council`** — invoke a council session that includes the new persona (route via the dispatcher to a sub-command matching the persona's expertise).
- **`/atlas:core-brain-sync`** — refresh the brain so subsequent commands see the new persona.
- **`/atlas:core-status`** — confirm the workspace recognizes the new persona.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
