---
name: atlas-explore-security
description: Catalog auth surfaces, secrets-handling locations, and redaction risks per PRD §6.5 — read-only defensive audit; never attempts exploitation; never persists secret values.
inclusion: manual
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-security.md" hash="f41d26573a2123db" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Catalog the target product's security and privacy surface per PRD §6.5: authentication and authorization surfaces (login flows, OAuth grants, session and token storage, refresh paths, MFA hooks, password-reset flows, role/permission checks), secrets-handling locations (env files, secret-manager SDK calls, KMS/keystore reads, code paths that touch `process.env`), and redaction risks (places where secrets or PII could leak into logs, error responses, screenshots, network captures, or telemetry payloads). This command is **defensive, read-only, and finding-producing**: it produces a security-surface inventory for the agent and maintainer to review. It does NOT attempt exploitation. Penetration testing is explicitly out of scope for v1 and is deferred to specialized tooling.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/11_workspace_manifest.json` — confirm initialization and counts.
- `_testatlas/12_app_map.json` — auth-related routes, integrations, and handler entry points.
- `prd/prd.md` §6.5 — security/privacy surface scope.
- The target repo's auth config files, `.env.example` (and ANY `.env*` files present, KEYS only), secret-manager SDK config (e.g. AWS Secrets Manager, HashiCorp Vault, Doppler, GCP Secret Manager, Azure Key Vault), and any redaction utilities already shipped by the project.
- `.testatlas/schemas/evidence.schema.json` — evidence sidecar shape.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Audit the security surface — secrets exposure, auth model, OWASP-aligned read-only checks, redaction-pipeline coverage — of the target product. Read-only; no exploitation.
- **scope:** Every auth-related route, integration, and handler entry in `_testatlas/12_app_map.json`; every `.env*` file (KEYS only); every redaction utility shipped by the project. Excludes active penetration testing — this command never executes attacks.
- **files-to-read:** `_testatlas/12_app_map.json`; `prd/prd.md` §6.5 (security/privacy scope); the target's auth config files; `.env.example` / any `.env*` files (KEYS only); secret-manager SDK config (AWS Secrets Manager, HashiCorp Vault, Doppler, GCP Secret Manager, Azure Key Vault); `.testatlas/schemas/evidence.schema.json`.
- **output-format:** Markdown findings list — one entry per OWASP-aligned check — with severity, confidence, evidence-path, recommended-action. Evidence (config dumps, redaction-test outputs, dependency CVE snapshots) under `_testatlas/evidence/explore-security/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** Every check produces a finding (or a documented "no surface" rationale); no secret values ever read or recorded; no exploitation attempted; redaction pipeline confirmed before any evidence persists.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/explore-security/<timestamp>/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify the `shell` capability. **If `shell` is unavailable, MUST NOT run grep for secret patterns or filesystem walks — fall back to package-manifest reading only (read what `app-map` already enumerates) and mark every finding `confidence: needs-validation` per `bootstrap.md` §4. Add `tool_unavailable: shell` to each artifact. Never invent auth flows, secret-handling patterns, or redaction gaps from training-data priors.**
3. **Non-exploitation contract (verbatim, mandatory):** This command is DEFENSIVE and READ-ONLY. It MUST NOT attempt: exploitation, fuzzing, credential stuffing, brute-forcing, SSRF tests, SQL injection probes, XSS payload submission, dependency-confusion attacks, supply-chain tampering, or any active probing of running services. It MAY ONLY read source files, configs, package manifests, and SDK documentation already on disk. Penetration testing is out of scope for v1.
4. **Never persist secret values (verbatim, mandatory):** Whenever this command identifies a location that holds a secret (`.env*` value, hardcoded token, leaked log line, captured network payload), it MUST redact the value before writing any artifact. Replace the value with the literal token `<redacted>` and record only the KEY name, file path, and line number. The command MUST NOT exfiltrate any captured value outside `_testatlas/`. If a candidate value cannot be safely redacted, omit the finding rather than risk persistence.
5. Catalog **auth surfaces**. Cross-reference `_testatlas/12_app_map.json` for: login routes and handlers, registration flows, OAuth/OIDC client config and grant flows, session storage (cookies, signed JWTs, server sessions), token refresh paths, MFA hooks, password-reset flows, magic-link flows, role/permission/policy checks, and protected-route enforcement. Persist as `_testatlas/evidence/explore-security/<timestamp>/auth-surfaces.md` — every entry cites a source file path and line number.
6. Catalog **secrets-handling locations**. Identify: `.env*` files (KEYS only — values redacted), secret-manager SDK calls (`SecretsManager.getSecretValue`, `vault.read(...)`, `secretmanager.access_secret_version(...)`, `kv.get(...)`, etc.), KMS/keystore reads, and code paths that read `process.env` (or language equivalent) and forward the value to logs, error responses, telemetry, or rendered output. Persist as `secrets-locations.md` — every entry cites a source file path and line number; no value is ever recorded.
7. Catalog **redaction risks**. Identify places where secrets or PII could leak: log statements that template request/response bodies, error handlers that echo internal state, screenshots saved under `_testatlas/evidence/`, network-trace captures, telemetry payloads, third-party analytics SDKs, crash reporters. Cross-reference any redaction pipeline already shipped by the project; flag gaps. Persist as `redaction-risks.md` — every risk cites a source file path and line number.
8. Aggregate findings into `_testatlas/evidence/explore-security/<timestamp>/findings.md` with severity per PRD §28 (critical / high / medium / low / enhancement) and confidence per `bootstrap.md` §8. Every finding cites at least one source-file evidence path; no finding records a secret value.
9. Close the lifecycle (next section).

## Outputs

- `_testatlas/evidence/explore-security/<timestamp>/auth-surfaces.md` — auth + authorization inventory with file/line citations.
- `_testatlas/evidence/explore-security/<timestamp>/secrets-locations.md` — secret KEYS, secret-manager call sites, env-read sites; values always `<redacted>`.
- `_testatlas/evidence/explore-security/<timestamp>/redaction-risks.md` — locations where secrets or PII could leak; gaps in the existing redaction pipeline.
- `_testatlas/evidence/explore-security/<timestamp>/findings.md` — aggregated findings with severity, confidence, and evidence paths; no secret values persisted.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence-directory path, and findings count by severity.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "Catalogued security surface — `<n>` auth surfaces / `<n>` secret-handling sites / `<n>` redaction risks; `<n>` critical / `<n>` high / `<n>` medium / `<n>` low / `<n>` enhancement findings."

## Stop Conditions

- Any step would attempt active exploitation, probing, fuzzing, or credential stuffing → refuse; out of scope for v1.
- Any step would persist a secret value (verbatim, even partially) → refuse; redact or omit.
- Any step would exfiltrate captured data outside `_testatlas/` → refuse.
- `shell` is unavailable AND no package manifests are readable from `_testatlas/12_app_map.json` → halt; nothing safe to inventory.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- Every catalogued surface (auth, secrets, redaction) cites a source-file path that exists in the target repo.
- No secret value is persisted anywhere in `_testatlas/`; redaction discipline is visible in the evidence files.
- `findings.md` exists and lists each finding with severity, confidence, and at least one evidence path.
- The five lifecycle files listed above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that the security surface is catalogued:

- **`/atlas:log-issue`** — file individual issues for high-severity findings
- **`/atlas:plan`** — fold security findings into the test plan
- **`/atlas:test-flow`** — exercise negative-path flows derived from these findings
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
