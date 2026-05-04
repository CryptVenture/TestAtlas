---
name: atlas-explore-api
description: Map REST/GraphQL/RPC/server-action/webhook/event-consumer surfaces; capture contracts, auth, errors, pagination; safely probe sandbox endpoints.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-api.md" hash="ca6dbcea4a64e233" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map every machine-callable interface the target product exposes per PRD §13.4: REST routes, GraphQL queries/mutations/subscriptions, RPC handlers (tRPC, gRPC, JSON-RPC), framework server actions (Next.js, Remix, SvelteKit), inbound and outbound webhooks, and event-consumer subscriptions (Kafka, SQS, Redis pub/sub, NATS). For each, capture method, path, auth, request/response shape, error codes, and pagination. Probe only sandbox or local endpoints when `allowProductionTesting=false`. Outputs land in `_testatlas/12_app_map.json` (api-endpoint entries) and `_testatlas/evidence/explore-api/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation), §8 (no-evidence-no-finding), §12 (explorer standards).
- `_testatlas/11_workspace_manifest.json` — initialization status; current counts.
- `_testatlas/12_app_map.json` — existing api-endpoint entries (often seeded by `explore-codebase`); this command enriches contracts and probe evidence.
- `.testatlas/default.config.json` — read `allowDestructiveActions` AND `allowProductionTesting`. Both flags gate this command's behavior.
- `.testatlas/schemas/api-endpoint.schema.json` — output contract every entry must satisfy.
- Target schema files when present: `openapi.{yaml,json}`, `swagger.{yaml,json}`, `schema.graphql`, `*.proto`, `*.tsp`, `*.smithy`, framework route files.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Map the HTTP / RPC / GraphQL API surface — endpoints, request/response shapes, auth model, status-code map, error contracts — of the target product.
- **scope:** Every API endpoint reachable from the app: REST routes, GraphQL resolvers, RPC handlers (gRPC, tRPC, JSON-RPC), WebSocket / SSE handlers, server actions. Excludes internal-only IPC unless documented as part of the API surface.
- **files-to-read:** `.testatlas/schemas/api-endpoint.schema.json`; `_testatlas/12_app_map.json`; `.testatlas/default.config.json` (`allowDestructiveActions`, `allowProductionTesting`); target schema files (`openapi.*`, `schema.graphql`, `*.proto`, `*.tsp`, `*.smithy`); framework route files.
- **output-format:** `api-endpoint` entries in `12_app_map.json` validating against `api-endpoint.schema.json`; per-endpoint evidence (probe responses, schema dumps) under `_testatlas/evidence/explore-api/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** Every endpoint enumerated with method/path/handler/auth-model/status-codes; production hosts skipped when `allowProductionTesting=false`; destructive endpoints tagged; schema validation passes.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every api-endpoint entry this command produces MUST cite an evidence file path under `_testatlas/evidence/explore-api/<timestamp>/`. Fabricated endpoints, response shapes, or status-code maps fail `validate-workspace`.
2. Verify capabilities. **If `shell` is unavailable, MUST NOT execute curl/grep against the codebase** — fall back to OpenAPI/GraphQL schema file reading and mark findings `confidence: needs-validation` per `bootstrap.md` §4. Add `tool_unavailable: shell` to each affected entry. Never invent endpoints, response shapes, or auth schemes from training-data priors. If `web-fetch` is unavailable, perform schema-only enrichment and skip live probes (no fabricated probe responses).
3. Discover endpoint sources. Where `explore-codebase` already mapped routes, enrich them; where it has not, parse:
   - REST routes (Express, Fastify, Hono, Next.js `route.ts`, Rails `routes.rb`, Django `urls.py`, Laravel `routes/api.php`, Spring `@RequestMapping`, ASP.NET `[Route]`).
   - GraphQL: `schema.graphql` plus resolver files; record queries, mutations, subscriptions.
   - RPC: tRPC routers, gRPC `.proto` services, JSON-RPC handler maps.
   - Framework server actions: Next.js `'use server'`, Remix `action`/`loader`, SvelteKit `+server.ts`, Astro endpoints.
   - Webhooks (inbound consumer routes AND outbound emitters with their target URLs).
   - Event consumers: Kafka topics + consumer groups, SQS queues, Redis Streams subscriptions, NATS subjects, RabbitMQ bindings.
4. For each endpoint, capture:
   - `method` (HTTP verb, GraphQL operation type, RPC procedure kind, event topic name)
   - `path` (URL pattern, GraphQL field path, topic / subject)
   - `auth` (none, bearer, session, OAuth scopes, signature header, IAM policy) — derived from middleware/decorators, never guessed
   - `request` and `response` schemas (from OpenAPI/GraphQL/proto first; only from sample probes when no schema file exists)
   - `errors` (status codes + bodies; GraphQL error extensions; RPC error codes)
   - `pagination` (cursor / offset / page-token / link-header / GraphQL Relay connection)
5. **Sandbox-vs-production discipline.** Read `allowProductionTesting`. If `false`, refuse to send any request to a host that resolves to production: production hostnames, `prod`/`live`/`production` env names, live API key prefixes (`pk_live_*`, `sk_live_*`, etc.). Probe ONLY sandbox/staging/local URLs (`localhost`, `127.0.0.1`, `*.test`, `*.local`, sandbox hostnames declared in env files / config). Record refusals in `10_command_log.md`.
6. **Destructive-endpoint discipline.** When `allowDestructiveActions=false`, do NOT probe endpoints whose method is `DELETE`, `PUT`, `PATCH`, or whose path contains delete-like verbs (`/delete`, `/drop`, `/reset`, `/purge`); record them as `executed: false` with `safety: destructive`. Probe only `GET`/`HEAD`/`OPTIONS` plus explicitly idempotent introspection endpoints (`/health`, `/version`, GraphQL `__schema`).
7. For each safe sandbox probe, send a minimal request (with appropriate auth headers from `.env.example` placeholders if needed; never with live secrets). Save request/response under `_testatlas/evidence/explore-api/<timestamp>/<endpoint-slug>/request.txt`, `response.txt`, `headers.json`. Redact any token-like values per `bootstrap.md` redaction guidance.
8. Update `_testatlas/12_app_map.json` api-endpoint entries with discovered shape + evidence references. Validate against `api-endpoint.schema.json`. Halt on validation failure; surface AJV errors verbatim.
9. Append an API section to `_testatlas/01_app_inventory.md` listing endpoint counts by surface (REST / GraphQL / RPC / webhook / event-consumer) and total probed vs unprobed.
10. Close the lifecycle (next section).

## Outputs

- `_testatlas/12_app_map.json` — api-endpoint entries with method, path, auth, request/response, errors, pagination, evidence paths.
- `_testatlas/evidence/explore-api/<timestamp>/` — per-endpoint subdirectories with redacted request/response captures, schema file copies, introspection dumps.
- Updated `_testatlas/01_app_inventory.md` — API section with surface-type counts.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence directory path, and per-surface counts.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (new evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row per `command-result.schema.json`. Note refusals (destructive endpoints, production hosts).
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute the api-endpoint count.
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` API endpoints across `<surfaces>` into `12_app_map.json`."

## Stop Conditions

- No API surface detected (no routes, schemas, RPC services, event consumers) → record an empty API inventory and close.
- Target exposes only production hosts and `allowProductionTesting=false` → halt; surface the gap; do not probe.
- Both `shell` AND `web-fetch` unavailable AND no schema files present → halt; explorer cannot proceed without at least one path to truth.
- `api-endpoint.schema.json` validation fails on any entry → halt; do not commit a malformed map.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- Every api-endpoint entry cites at least one evidence path that exists on disk under `_testatlas/evidence/explore-api/<timestamp>/`.
- Sandbox-vs-production boundary respected; every refusal recorded in `10_command_log.md`.
- Manifest `counts.api-endpoints` (or analogous) reflects the on-disk map.
- The five lifecycle files above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that the API surface is mapped:

- **`/atlas:explore-integrations`** — trace outbound dependencies the API depends on
- **`/atlas:test-flow`** — execute API scenarios end-to-end with response evidence
- **`/atlas:plan`** — turn the endpoint inventory into a test plan
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
