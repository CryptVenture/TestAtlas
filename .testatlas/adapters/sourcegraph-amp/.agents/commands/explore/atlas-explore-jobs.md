<!-- TestAtlas command: atlas-explore-jobs. Invoke as /atlas-explore-jobs. Description: Map background jobs, schedules, queues, retry policies, timeouts, and failure scenarios; observable via shell + log inspection; degrade to code-reading when shell unavailable. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-jobs.md" hash="72df762acd8b1c1ed60c24fd3d116db2d767c9c0b4bd944ee84a0ecceb716984" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map every background job, scheduled task, queue worker, cron, and serverless trigger: name, schedule (cron expression / interval), queue (topic / channel / consumer group), retry policy (max attempts, backoff strategy), timeout, idempotency keys, dependencies (which other jobs it triggers / requires), and observed failure modes. Persist evidence under `_testatlas/evidence/explore-jobs/<timestamp>/`. Update `_testatlas/maps/jobs.md` and `_testatlas/maps/jobs.json`. Every claim MUST cite an on-disk evidence path.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/12_app_map.json.jobs[]` — jobs from `explore-codebase`.
- `_testatlas/maps/jobs.json` — existing job catalog.
- `.testatlas/schemas/{evidence,app-map}.schema.json`.
- `.testatlas/default.config.json` — `allowDestructiveActions`, `allowProductionTesting` flags.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `shell` (for invoking job runners, reading queue tooling like `bullmq`, `sidekiq`, `celery`, `pg-boss`, `cloud Scheduler`, etc.). If `shell` unavailable, degrade to code reading: parse job-definition source files referenced by `12_app_map.json.jobs[].source`. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: shell`. Never invent retry counts, queue depths, or timing data.

3. **Source enumeration.** For each job in `12_app_map.json.jobs[]`:
   - Open the source file referenced by `source.file`.
   - Parse the cron / interval / trigger expression literally — DO NOT decode by translating from a function call signature you "know" without verifying the version's defaults.
   - Parse retry-policy options (max attempts, backoff strategy: fixed | exponential | linear | jitter, base delay).
   - Parse timeout (often a `timeout: N` option, or a wrapping `withTimeout(N, fn)`).
   - Parse idempotency keys (often a `jobId: stableHash(payload)` pattern; flag jobs that mutate state without one).
   - Parse dependencies (jobs that enqueue other jobs, jobs that wait on prior runs).

4. **Runtime probe (when `shell` available).** For each job, invoke the runner's CLI to query state without triggering execution:
   - Bull / BullMQ: `node -e "<script reading the queue's getJobCounts()>"` from a sandbox connection if a sandbox URL exists in env.
   - Sidekiq: `bundle exec sidekiq-cli stats`.
   - Celery: `celery -A <app> inspect registered`.
   - PG-Boss: SQL `select name, state, count(*) from pgboss.job group by 1, 2;`.
   - Cloud Scheduler / EventBridge / GitHub Actions cron: read manifest files (`*.yaml`, `*.tf`, `cloudbuild.yaml`, `.github/workflows/*.yml`).
   - Capture stdout/stderr to `evidence/explore-jobs/<ts>/<job-name>/runtime.txt`.

5. **Failure-scenario inventory.** From source + runtime probe, document for each job:
   - Common failure modes (network timeout, downstream 5xx, malformed payload, deadline exceeded).
   - Observable retry behavior (how many attempts before dead-letter / failure shelf?).
   - Dead-letter queue (DLQ) location if any; the path / table where failed jobs land.
   - On-call alerting hook (does failure surface a metric / alert? cross-reference `explore-observability`).

6. **Schedule sanity check.** For cron jobs, parse the cron expression (5-field or 6-field) into "next 5 fire times" using a deterministic library or by hand. Flag schedules that are obviously wrong (e.g. `0 0 31 2 *` — Feb 31 never fires).

7. **Persist + write.** Validate each job entry against the jobs-map schema fragment before writing. Write `_testatlas/maps/jobs.json` (atomic) and regenerate `_testatlas/maps/jobs.md`. Update `_testatlas/12_app_map.json.jobs[]` with retry/timeout/dependency fields. If any cited evidence path is missing on disk, halt.

8. **Safety constraints.** With `allowDestructiveActions=false`, MUST NOT trigger jobs whose handler mutates production data (purge, billing, email-send). Inspect handler bodies before any "test fire"; default to `--dry-run` flags when the runner exposes them; otherwise stick to read-only inspection.

9. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/jobs.md` and `_testatlas/maps/jobs.json` — full job catalog with schedule, queue, retry, timeout, dependencies, failure modes, evidence refs.
- Updated `_testatlas/12_app_map.json.jobs[]`.
- `_testatlas/evidence/explore-jobs/<timestamp>/<job-name>/` — `source.txt` (relevant source slice), `runtime.txt` (runner CLI output), `schedule.json` (parsed cron + next-5 fire times), `dlq.json` (DLQ stats if available).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, job count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative: "Mapped `<n>` jobs / `<m>` queues / `<k>` schedules in `_testatlas/evidence/explore-jobs/<ts>/`."

Then run `node scripts/update-brain-after-command.js --command explore-jobs --actor agent --status completed --reindex`.

## Stop Conditions

- `shell` unavailable AND no job-definition source files in `12_app_map.json` → halt.
- A "test fire" would mutate production data with `allowDestructiveActions=false` → skip the fire, record the skip rationale, continue with other jobs.
- Any captured artifact path fails to materialize on disk → halt.

## Completion Criteria

- Every job in `12_app_map.json.jobs[]` has a corresponding entry in `_testatlas/maps/jobs.json` with schedule, queue, retry, timeout, dependencies, observed failure modes, evidence refs.
- `maps/jobs.md` regenerated.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:explore-observability`** — verify alerting hooks for the jobs.
- **`/atlas:explore-data`** — map the data the jobs mutate.
- **`/atlas:test-regression`** — exercise jobs in a sandbox.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
