<!-- TestAtlas command: atlas-explore-observability. Invoke as /prompts:atlas-explore-observability. Description: Map logging setup, metrics, alerts, and tracing — verify log generation, metric collection, alert triggers, and distributed-trace propagation. Static audit + live probe when shell available. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-observability.md" hash="5c9ce850ea014b8308d4e0fe2338aae3d6c6827f2d77beaaa583556db0f7fa72" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-explore-observability.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the observability surface: logging setup (logger libraries, sinks, log levels, structured-log fields, redaction rules), metrics (Prometheus / StatsD / Cloud monitoring exports, custom RED/USE/Four-Golden-Signals), alerts (alert routing, severity thresholds, on-call paths), tracing (OpenTelemetry / Datadog APM / Honeycomb propagation, span IDs in headers, sample rate). Verify each layer is wired end-to-end: a log line generated reaches the sink, a metric increment reaches the dashboard, an alert condition triggers a notification (in test/staging only), a span propagates from frontend to backend. Persist evidence under `_testatlas/evidence/explore-observability/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md` — §4 (capability degradation), §8 (no-evidence-no-finding).
- `_testatlas/12_app_map.json.integrations[]` — observability vendors detected by `explore-codebase`.
- `_testatlas/maps/integrations.json` — existing integrations catalog.
- `.testatlas/schemas/{evidence,app-map}.schema.json`.
- `.testatlas/default.config.json` — `allowProductionTesting`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `shell` for invoking observability CLIs (loki, promtool, otelcol, fluent-cli, datadog-cli, honeycomb-cli) and reading log files. If unavailable, degrade to source reading (parse logger config files, OTel instrumentation imports). Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: shell`.

3. **Logging audit.**
   - **Library detection:** identify the logger (`pino`, `winston`, `bunyan`, `slog`, `zap`, `logback`, `log4j`, `serilog`). Read its config: levels, transports, formatters, redaction.
   - **Sink enumeration:** stdout-only, file rotation, syslog, vendor (Datadog, Sumo, Splunk, ELK, Loki). Capture credentials only by reference (path / env var name); NEVER copy credentials into evidence.
   - **Level distribution:** generate a sample run (`shell` invocation that exercises a representative endpoint) → capture stdout/stderr to `evidence/log-sample.txt` → count log lines per level (debug/info/warn/error/fatal).
   - **Structured-log fields:** confirm each line is JSON or key-value structured. Record the standard fields (`timestamp`, `level`, `service`, `traceId`, `spanId`, `userId`, `requestId`).
   - **Redaction:** for each evidence record emitted under this run, invoke `node .testatlas/scripts/redact-evidence.js --evidence-id <EVIDENCE-XXX>` (per-record; loop over records in `_testatlas/evidence/explore-observability/<timestamp>/`) to flag any secret / PII leak. The script's per-record `--evidence-id` model is the only supported invocation — there is no `--scan` flag.

4. **Metrics audit.**
   - **Library detection:** identify the metrics surface (`prom-client`, `@opentelemetry/sdk-metrics`, `statsd-client`, `micrometer`, `dropwizard`).
   - **Endpoint:** if Prometheus, hit `/metrics` (sandbox) and capture. If push-based StatsD, intercept the UDP packets via a local stand-in or read recent flush logs.
   - **Standard metric coverage:** confirm RED (Rate, Errors, Duration) for HTTP routes; USE (Utilization, Saturation, Errors) for resources; Four Golden Signals (latency, traffic, errors, saturation).
   - **Custom metrics:** enumerate non-standard metrics with their names + label cardinality (high cardinality is a perf gotcha → file as a finding).

5. **Alerts audit.**
   - **Source:** read alert rules (Prometheus `alerts.yml`, Datadog monitors via API in dry-run mode, GCP alerting policy YAML, AWS CloudWatch alarm Terraform).
   - **Coverage:** confirm one alert per critical SLO (availability, latency p99, error rate, queue depth, DLQ size). Flag absent SLO coverage as a finding.
   - **Routing:** confirm severity → on-call path mapping (PagerDuty / Opsgenie service keys; do NOT print the keys).
   - **Test fire:** in staging only, trigger one synthetic alert (e.g. flip a metric over threshold for 1 min) and observe the routing landing in a non-production channel. NEVER do this in production.

6. **Tracing audit.**
   - **Library:** OTel SDK / Datadog APM / Honeycomb beeline / Sentry tracing.
   - **Propagation:** trigger one HTTP request through the system → capture the propagated headers (`traceparent`, `tracestate`, `X-B3-*`, `X-Datadog-*`) at each hop.
   - **Sample rate:** read config; flag 100% sampling in production as a perf concern.
   - **Span attributes:** confirm `service.name`, `db.statement` (with PII redacted), `http.route`, `error.type` are set.

7. **Persist + write.** Update `_testatlas/maps/integrations.json` observability rows. Write to `_testatlas/12_app_map.json` under the top-level `observability` object property (added to `app-map.schema.json` in Phase 20-01). The shape is closed (`additionalProperties: false`):

   - `logging` (string[], optional) — surfaces with logging
   - `metrics` (string[], optional) — surfaces emitting metrics
   - `tracing` (string[], optional) — surfaces emitting traces
   - `alerts` (string[], optional) — alert wiring identifiers
   - `evidence` (string, optional) — pointer to evidence record id

   Example:
   ```json
   {
     "observability": {
       "logging": ["src/lib/logger.ts", "POST /api/checkout"],
       "metrics": ["GET /api/health"],
       "evidence": "EVIDENCE-058-observability"
     }
   }
   ```

   DO NOT invent keys outside this shape. If a finding doesn't fit, write it to a sidecar at `_testatlas/maps/observability.json` per the bootstrap escape-hatch rule. If any cited evidence path fails to materialize on disk, halt.

8. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/integrations.json` (observability rows enriched).
- Updated `_testatlas/12_app_map.json` top-level `observability` object (schema-aligned per `app-map.schema.json`).
- `_testatlas/evidence/explore-observability/<timestamp>/` — `log-sample.txt`, `metrics-snapshot.json`, `alerts.yml-extracted.json`, `traces/<traceId>.json`, `redaction-scan.txt`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative: "Audited logging / metrics / alerts / tracing in `_testatlas/evidence/explore-observability/<ts>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-observability --actor agent --status completed --reindex`.

## Stop Conditions

- `shell` unavailable AND no observability config files in repo → halt.
- An alert test-fire would page production on-call AND target is production → halt; only test-fire in staging.
- Any captured artifact path fails to materialize on disk → halt.

## Completion Criteria

- Logger / metrics / alert / tracing layers each have at least one evidence file documenting current state.
- Redaction scan ran on every captured log artifact.
- Coverage gaps (SLOs without alerts, missing trace propagation hops) listed in evidence.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:explore-errors`** — verify the error paths surface into the logging layer mapped here.
- **`/atlas:explore-jobs`** — confirm jobs alert on failure as expected.
- **`/atlas:report`** — synthesize observability readiness.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
