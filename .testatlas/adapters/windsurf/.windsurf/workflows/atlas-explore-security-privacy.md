---
description: Map auth flows, permission boundaries, sensitive-data handling, injection risks, and privacy controls. V2 expansion of V1 explore-security with mandatory walkthrough when browser+MCP available.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-security-privacy.md" hash="30de363024c3347aba911b609217a1bbfe6963133130e8f2d45b40604ebbf4ea" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the security and privacy posture: authentication flows (login, signup, password reset, MFA, SSO), permission / authorization boundaries (per-role visibility, resource ownership checks), sensitive-data handling (PII storage, transit encryption, at-rest encryption, secret-management hygiene, redaction in logs), and injection / abuse surfaces (XSS, SQLi, SSRF, CSRF, IDOR, insecure deserialization, file-upload bypass, prototype pollution, ReDoS, header smuggling). V2 supersedes V1 `explore-security.md` and expands the privacy axis. Persist evidence under `_testatlas/evidence/explore-security-privacy/<timestamp>/`. File issues for confirmed findings via `node scripts/create-issue.js`.

## Required First Reads

- `.testatlas/bootstrap.md` — §4 (capability degradation), §8 (no-evidence-no-finding), §10 (safety: never run live exploits).
- `.testatlas/reference/chrome-devtools-mcp.md` — Tier-1 toolset, walkthrough patterns.
- `_testatlas/12_app_map.json` — auth flows, API endpoints, integrations.
- `_testatlas/maps/{routes,endpoints,components,integrations}.json` — surface to inspect.
- `.testatlas/schemas/{evidence,issue,app-map}.schema.json`.
- `.testatlas/default.config.json` — `allowDestructiveActions`, `allowProductionTesting`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **No live exploits.** This command MUST NOT brute-force credentials, send malicious payloads against production, attempt to bypass production safeguards, or perform any action a black-hat would. Read code, observe behavior, induce predictable failures (e.g. malformed input on a sandbox), but never escalate.

3. **Capability check.** Auth flow probing prefers `browser` + `MCP`; static audit accepts `shell` only. If `shell` AND `browser` AND `MCP` are all unavailable, halt. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: <cap>`. Never invent vulnerabilities.

4. **Mandatory walkthrough when capabilities are available** (auth-flow probing only). When `browser` AND `MCP` are both available, this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Interactive-surface walkthrough* for each auth flow (login, signup, reset, MFA, SSO). Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, because training-data priors tell the agent what the page contains, or because exhaustive coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the flow is third-party-hosted, the tool errors after retry), record the skip rationale on the entry. MUST NOT skip silently.

5. **Tier-1 toolset (verbatim):** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`. Pre-register `handle_dialog` BEFORE any auth flow that may surface a confirm.

6. **Auth-flow inventory.** For each auth flow:
   - Drive the happy path with valid credentials in a sandbox account → capture network requests (which endpoint, what cookies/tokens come back, are tokens in URL or body or `Set-Cookie`, are cookies `Secure` + `HttpOnly` + `SameSite=Strict|Lax`, is the JWT signed properly).
   - Drive invalid-creds path → confirm rate-limit / lockout fires (read response status + body; do NOT brute-force).
   - Inspect MFA: TOTP / SMS / WebAuthn — capture which factor is offered and whether it can be skipped.
   - Inspect password-reset: email-link / SMS-code; confirm token is single-use, time-bounded.

7. **Permission boundaries.** For each `/atlas:explore-routes` guarded route + each `/atlas:explore-api` protected endpoint:
   - Authenticate as role A → access role-B-only resource → expect 401/403.
   - Test IDOR: change a path or query ID to another user's resource → expect 403.
   - Capture matrix of role × resource × allowed-method into `evidence/permission-matrix.json`.

8. **Sensitive-data handling.** Run `node scripts/redact-evidence.js --scan <evidence-dir>` on every captured request/response/log to detect PII, secrets, or PCI/PHI leakage. Record any leak as a critical issue.

9. **Injection / abuse surfaces (static audit).** Use `shell` to grep for known antipatterns: raw SQL string concatenation (`SELECT ... + req.`), `dangerouslySetInnerHTML`, `eval(`, `Function(`, `child_process.exec(req.`, deserialization of untrusted input (`unpickle`, `Marshal.load`, `XMLDecoder`), unbounded regex on user input. Record matches with file:line + a one-line risk classification.

10. **Privacy controls.** Verify the product offers (a) data-export, (b) account-deletion, (c) cookie consent, (d) tracking opt-out. Test each control end-to-end. Inspect what telemetry fires before consent vs after.

11. **File issues.** For every finding above (severity ≥ medium), call `node scripts/create-issue.js` with title, severity, evidence ref. Include `discoveredByPersona: explore-security-privacy` (V2 optional field).

12. Close the lifecycle.

## Outputs

- New issues filed via `create-issue.js` for confirmed findings.
- `_testatlas/evidence/explore-security-privacy/<timestamp>/` — `auth-flows/`, `permission-matrix.json`, `redaction-scan.txt`, `static-audit.txt`, `privacy-controls.json`.
- Updated `_testatlas/12_app_map.json` — `securityFindings[]` array (additive, schema-tolerant).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, finding counts by severity.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.{issues,evidence}`.
- `_testatlas/history/run_log.md` — narrative: "Audited `<n>` auth flows / `<m>` permission boundaries / `<k>` injection surfaces; filed `<i>` issues."

Then run `node scripts/update-brain-after-command.js --command explore-security-privacy --actor agent --status completed --reindex`.

## Stop Conditions

- `allowProductionTesting=false` AND target resolves to a production host → halt.
- A finding requires a destructive probe (e.g. SQLi confirmation) and `allowDestructiveActions=false` → record as `confidence: needs-validation` with rationale; do not escalate.
- Any captured artifact path fails to materialize on disk → halt.

## Completion Criteria

- Every auth flow probed end-to-end OR explicit skip rationale recorded.
- Permission matrix covers ≥1 protected resource per role.
- Redaction scan ran on every captured artifact.
- Static audit list complete with file:line citations.
- Privacy controls (export, delete, consent, opt-out) verified.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:triage`** — prioritize the issues this command filed.
- **`/atlas:explore-observability`** — confirm security events surface in logs.
- **`/atlas:report`** — produce a security-readiness report.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
