---
description: Map auth, payments, email, analytics, storage, webhooks, and feature-flag integrations; distinguish sandbox/test/prod endpoints; probe sandbox only when safe.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-integrations.md" hash="97cf7802fd369d7f" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the target product's external integrations per PRD §13.8: auth providers, payment SDKs, email/SMS senders, analytics pipelines, object-storage clients, webhook receivers and emitters, and feature-flag systems. Produce integration entries inside `_testatlas/12_app_map.json` (validates against `app-map.schema.json`) plus a per-run evidence directory at `_testatlas/evidence/explore-integrations/<timestamp>/`. Every integration entry MUST distinguish sandbox / test / production endpoints; production endpoints MUST NOT be probed unless `allowProductionTesting=true` is set with explicit operator approval.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/12_app_map.json` — REQUIRED. If missing, halt with `Run /atlas:explore-codebase first.` Reuse the integration entries already discovered there as the starting set.
- `.testatlas/default.config.json` — read `safeMode` and `allowProductionTesting`. The default `allowProductionTesting=false` forbids any probe against a production endpoint.
- `.testatlas/schemas/app-map.schema.json` — output contract for the integration entries this command writes.
- Target SDK config files: `stripe.config.*`, `auth.config.*`, `next-auth.config.*`, `clerk.config.*`, `sentry.config.*`, `resend.config.*`, `segment.config.*`, `launchdarkly.config.*`, `s3.config.*`. Also scan `package.json` for SDK dependencies (`stripe`, `@auth/*`, `@clerk/*`, `resend`, `@sendgrid/*`, `mixpanel-browser`, `@launchdarkly/*`, etc.).
- Environment-key inventories: `.env.example`, `.env.sample`, `infra/secrets.tf`, deployment manifests. **Read key NAMES only — never values.**

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Map external integrations — auth, payments, email, SMS, analytics, telemetry, object storage, search, feature flags, webhooks, outbound APIs — and their sandbox-vs-production boundaries.
- **scope:** Every third-party SDK referenced in `package.json` dependencies plus every integration entry already seeded by `explore-codebase`. **MUST NOT call production endpoints** — boundary distinction is read from source (env names, base URLs, key prefixes).
- **files-to-read:** `_testatlas/12_app_map.json` (REQUIRED); `.testatlas/schemas/app-map.schema.json`; `.testatlas/default.config.json` (`safeMode`, `allowProductionTesting`); SDK config files (`stripe.config.*`, `auth.config.*`, `next-auth.config.*`, `clerk.config.*`, `sentry.config.*`, etc.); environment-key inventories (`.env.example`, `.env.sample`, `infra/secrets.tf`) — KEYS only.
- **output-format:** `integration` entries in `12_app_map.json` (each with sandbox-vs-prod marker and env-key list); evidence (SDK config dumps, env-key listings) under `_testatlas/evidence/explore-integrations/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** Every integration cataloged with sandbox/production marker; no production endpoint contacted; secret values never read; schema validation passes.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Verify `web-fetch` capability. If `web-fetch` is unavailable, MUST NOT probe any sandbox endpoint — fall back to SDK config + env-key inventory only and mark every finding `confidence: needs-validation` per `bootstrap.md` §4. Never invent endpoints, response shapes, or keys from training-data priors.
3. Enumerate integration surfaces by category:
   - **Auth providers:** Auth0, Clerk, NextAuth/Auth.js, Cognito, Firebase Auth, Supabase Auth, Stytch, custom JWT.
   - **Payment SDKs:** Stripe, Square, Adyen, Braintree, Paddle, Lemon Squeezy.
   - **Email / SMS senders:** SendGrid, Resend, Postmark, Mailgun, Twilio, Vonage.
   - **Analytics:** Segment, Mixpanel, PostHog, Amplitude, GA4.
   - **Object storage:** S3, R2, GCS, Azure Blob, Cloudflare Images, Uploadthing.
   - **Webhooks:** incoming receivers (handlers in target product) AND outgoing emitters (calls into third-party APIs).
   - **Feature flags:** LaunchDarkly, Unleash, ConfigCat, Statsig, Flagsmith.
4. **Sandbox-vs-prod discrimination — load-bearing.** For each integration, identify the base URL pattern, env-key prefix, or config flag that distinguishes sandbox / test / prod (e.g. `sk_test_*` vs `sk_live_*` for Stripe, `*.dev.auth0.com` vs `*.auth0.com`, `STRIPE_SECRET_KEY` vs `STRIPE_LIVE_SECRET_KEY`). If `allowProductionTesting=false` (the default), refuse to probe any production endpoint and list each skipped endpoint in `_testatlas/evidence/explore-integrations/<timestamp>/skipped-prod.md` with the reason.
5. For each safe sandbox integration with a discoverable read-only endpoint, send a minimal probe (auth status check, sandbox `me` endpoint, public health check) and capture the request envelope + response under `_testatlas/evidence/explore-integrations/<timestamp>/<integration-slug>/`. **NEVER trigger real charges, real emails, real SMS, real OAuth grants, real webhooks, or any side effect** — only read-only metadata calls. Probes that would have side effects must be skipped and logged as `probe: not-attempted` with reasoning.
6. Document per-integration: SDK name + version (from `package.json` lockfile), env keys used (KEY NAMES only — never values), base URLs (sandbox vs prod), webhook receive endpoints in the target product (route + handler symbol), webhook send endpoints out of the target product (caller file + line).
7. Update `_testatlas/12_app_map.json` integration entries with discovered shape + sandbox/prod classification + evidence references. Validate against `app-map.schema.json` before commit. If validation fails, halt and surface AJV errors verbatim.
8. Append an integration inventory to `_testatlas/01_system_map.md` listing each integration with category, sandbox/prod boundary, and probe outcome.
9. Close the lifecycle (next section).

## Outputs

- Integration entries in `_testatlas/12_app_map.json` — schema-valid integration entries citing evidence paths and explicitly classified sandbox / test / prod.
- `_testatlas/evidence/explore-integrations/<timestamp>/` — per-integration probe envelopes (request + response, sandbox only), SDK config dumps, env-key inventories, and `skipped-prod.md` listing every prod endpoint deliberately not probed.
- Updated `_testatlas/01_system_map.md` — integration inventory with category, classification, and probe outcome per integration.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence-directory path, and counts of integrations discovered / probed / skipped.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new evidence directory and updated `12_app_map.json` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.integrations`.
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` integrations (`<n>` probed sandbox, `<n>` skipped prod)."

## Stop Conditions

- No integrations found in `12_app_map.json` and no SDK dependencies declared → record an empty integration inventory and close (NOT a halt; legitimate for fully self-contained targets).
- Target product runs only against production endpoints with `allowProductionTesting=false` → halt and surface; "Refusing to probe production endpoints; rerun with allowProductionTesting=true (operator-approved) or supply sandbox credentials."
- A probe would trigger a real charge, real email, real SMS, real OAuth grant, real outbound webhook, or any other side effect → refuse the probe; log as `probe: not-attempted` and continue with the next integration.
- `web-fetch` unavailable AND no SDK config files OR env inventories present on disk → halt; this command cannot operate without at least one source-of-truth path.
- `app-map.schema.json` validation fails on the updated map → halt; do not commit a malformed map.

## Completion Criteria

- Every integration entry in `12_app_map.json` cites at least one evidence path under `_testatlas/evidence/explore-integrations/<timestamp>/` that exists on disk.
- Every integration is classified sandbox / test / prod with the discriminator (URL pattern, env-key prefix, config flag) recorded.
- The sandbox/prod boundary has been respected — `skipped-prod.md` is present whenever any prod endpoint was found.
- Zero real side effects (charges, emails, SMS, OAuth grants, outbound webhooks) have been triggered by this command.
- The five lifecycle files listed above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that integrations are catalogued:

- **`/atlas:explore-api`** — confirm integration boundaries match the API surface
- **`/atlas:explore-security`** — audit credentials, secrets, and trust boundaries
- **`/atlas:test-flow`** — exercise sandbox flows that traverse each integration
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
