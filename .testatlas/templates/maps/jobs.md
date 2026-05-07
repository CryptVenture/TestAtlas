# TestAtlas Jobs Map

Human-readable view of `_testatlas/maps/jobs.json`. Catalogs every background job, cron, queue worker, scheduled trigger. Per PRD §7.13.

> **Updated by:** `/atlas:explore-jobs`. **Source:** `jobs.json`.

## Field reference

| Field | Description |
| --- | --- |
| `name` | Job name. |
| `schedule` | `{type, expression, timezone}` — cron expression literal + parsed schedule. |
| `queue` | `{runner, name, concurrency}` — runner library, queue name, worker count. |
| `retry_policy` | `{max_attempts, backoff_strategy, base_delay_ms, jitter}`. |
| `timeout` | `{value_ms, source}` — ms timeout + source-file citation. |
| `dependencies` | Array of `{type, target}` — `enqueues` / `awaits` other jobs. |
| `test_coverage` | Test IDs + percent. |
| `evidence` | On-disk evidence paths. |

<!-- TESTATLAS:GENERATED:START section="jobs" -->
_Generated from `jobs.json`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="jobs" -->
