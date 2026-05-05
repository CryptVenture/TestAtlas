---
name: atlas-update
description: Invoke the suite self-update flow — checks GitHub Releases per UPDATE-01, delegates to Phase 7 update.js for atomic apply with backup, never auto-applies without operator confirmation.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/update.md" hash="b53bbcfc58bab7e8040647f4c8fddd27bea4d021d5a57a64efcec75018ad9968" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Invoke the suite self-update flow per UPDATE-01..07: check GitHub Releases for a newer version of the TestAtlas suite, present the delta and migration notice to the operator, and on explicit operator confirmation delegate to `node .testatlas/scripts/update.js` (Phase 7 runtime) for an atomic apply with backup. This command is the agent-facing instruction; the actual filesystem mutation, backup, and rollback semantics live in `update.js`. The cardinal rule is: **NEVER auto-apply.** Updates require operator confirmation every time. This command is non-finding-producing.

## Required First Reads

- `.testatlas/bootstrap.md` — the constitution.
- `.testatlas/VERSION` — current installed suite version.
- `.testatlas/default.config.json` — `pinnedVersion`, `disableUpdateCheck`, `updateCheckTtlHours` (UPDATE-03, UPDATE-04).
- `_testatlas/.lock` (if it exists) — UPDATE-06 in-flight-run detector.
- `_testatlas/11_workspace_manifest.json` — record the update outcome here.

## Required Actions

1. Verify the `shell` capability is available. **If `shell` is unavailable**, the runtime cannot be invoked: MUST NOT invoke `node update.js`. Fall back to a `web-fetch`-only check (if that capability is available) and surface the available version with the manual update instruction. Never simulate update output or version availability from training-data priors.
2. Verify the `web-fetch` capability is available. **If `web-fetch` is unavailable**, MUST NOT contact GitHub Releases. Surface the offline state, respect `disableUpdateCheck=true` semantics, and exit cleanly. Never fabricate version availability or release notes from training-data priors.
3. **Honor disable flags (UPDATE-03).** Read `disableUpdateCheck` from `.testatlas/default.config.json` and check for the `--no-update-check` flag. If either is set, exit cleanly with the message `Update check disabled.` This is a clean exit, not a failure.
4. **Workspace lockfile check (UPDATE-06).** If `_testatlas/.lock` exists, halt immediately with `In-flight test run detected; cannot update.` Updates while a test run is in progress can corrupt run output paths and break atomicity guarantees.
5. **Read current version.** Load `.testatlas/VERSION`.
6. **Fetch latest release (UPDATE-01).** Issue `GET https://api.github.com/repos/<owner>/<repo>/releases/latest` with a 5-second timeout via `web-fetch`. Parse the `tag_name` and `body` (release notes). Cache the result per `updateCheckTtlHours`.
7. **Compute semver delta.** Compare the current version against the latest release.
   - Equal versions → no-op; emit `Up to date.` and exit cleanly.
   - Pinned via `pinnedVersion`: apply `semver.satisfies(latest, pinnedRange)`. If the pin is satisfied by the current version and a newer release exists outside the pin, emit a stale-pin warning but do NOT prompt for update. If the pin range admits the latest release, proceed.
   - Latest is newer and admissible → continue to operator confirmation.
8. **Operator confirmation (UPDATE-02).** Present the version delta, an excerpt of the release notes, and the migration notice (if `update.js` reports a schema migration is required). Require explicit operator confirmation before proceeding. **NEVER auto-apply.** A non-interactive run that cannot prompt MUST exit cleanly with `Update available; operator confirmation required; rerun interactively.`
9. **Delegate to update.js (UPDATE-02).** On confirmation, shell-invoke `node .testatlas/scripts/update.js`. The runtime is responsible for: writing a `.testatlas.backup-<ts>/` directory, replacing the suite tree atomically, running schema migrations (UPDATE-05), and rolling back on any failure. This command captures stdout/stderr from that invocation.
10. **Surface failures.** If `update.js` exits non-zero, surface the error verbatim and instruct the operator to inspect the `.testatlas.backup-<ts>/` directory. Do NOT attempt rollback from this command — `update.js` owns atomicity. Never speculate about cause; report what `update.js` reported.
11. Close the lifecycle (next section).

## Outputs

- `_testatlas/history/update-<ts>.md` — narrative record of the update attempt: previous version, new version, operator decision, runtime exit code.
- Updated `.testatlas/VERSION` (mutated by `update.js`, observed here).
- Updated lifecycle files (next section).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record update status (`up-to-date` / `applied` / `skipped` / `failed`).
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the update record appears under `history/`).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing the previous and current version.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`.
- `_testatlas/history/run_log.md` — narrative entry: "Update check: `<previousVersion>` → `<latestVersion>`; `<applied|skipped|disabled|failed>`."

## Stop Conditions

- `disableUpdateCheck=true` or `--no-update-check` present → exit cleanly (not a failure).
- `_testatlas/.lock` present → halt; in-flight test run.
- `web-fetch` unavailable → exit cleanly with offline state surfaced; do NOT fabricate version data.
- Operator declines confirmation → exit cleanly.
- Pinned version range satisfied by current and latest is outside the pin → no-op + stale-pin warning.
- `update.js` exits non-zero → halt and surface backup-directory pointer; do not retry.
- Update would mutate `_testatlas/` (workspace layer) → halt; updates target only the `.testatlas/` suite tree.

## Completion Criteria

- Update either applied with explicit operator confirmation, correctly skipped per config, or cleanly reported as offline / disabled.
- The five lifecycle files listed above are updated.
- `_testatlas/history/update-<ts>.md` records the attempt outcome.
- Zero stop conditions triggered without surfacing.

## What's Next

Now that the suite is on the latest version:

- **`/atlas:validate-workspace`** — confirm schemas + manifest still validate after the swap
- **`/atlas:bootstrap`** — reload the constitution if §-numbering or rules changed
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
