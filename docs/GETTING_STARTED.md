<p align="center">
  <img src="../media/TestAtlas-HorizontalLogo1.png" alt="TestAtlas" width="420" />
</p>

# Getting Started with TestAtlas

This is the first-hour, runnable walkthrough of the 31 V1 + 41 V2 `/atlas:*` commands. It assumes you have already installed the suite into your repo (e.g., `npx @webventures/testatlas init` — see [docs/INSTALL.md](INSTALL.md) if not). Everything below is what you run *inside your AI agent* once `.testatlas/` and `_testatlas/` are on disk. Read top-to-bottom and you'll go from a cold repo to a schema-validated, evidence-backed `_testatlas/REPORT-latest.md` without consulting any other doc first.

The pipeline is linear: **Setup → Discovery → Organize → Plan → Test → Findings → Reporting → Lifecycle**. Each phase below names the commands you run, in the order you run them, and points at the artifacts under `_testatlas/` they produce. For exhaustive per-command behavior, flags, and schemas, see [docs/COMMANDS.md](COMMANDS.md).

> ### Day 1 happy path (do these in order)
>
> 1. `/atlas:init` — bootstrap the `_testatlas/` workspace
> 2. `/atlas:validate-workspace` — confirm the workspace is schema-valid
> 3. `/atlas:explore` — get a routing recommendation (umbrella, does not invoke sub-explorers)
> 4. `/atlas:explore-codebase` — required prerequisite; produces the app map
> 5. *(optional)* additional sub-explorers the umbrella recommended (e.g. `/atlas:explore-ui`, `/atlas:explore-api`)
> 6. `/atlas:map-domains` — distill the app map into per-domain artifacts
> 7. `/atlas:plan` — generate strategy, master plan, matrix, and charters
> 8. `/atlas:test-flow` — execute scenarios and capture evidence
> 9. `/atlas:report` — aggregate runs and issues into `REPORT-latest.md`
>
> Total wall-clock for a small/medium app: roughly 60–90 minutes of agent time. You can stop after step 7 if you only need a test plan; you can stop after step 9 with a complete first-pass quality report.

---

## 1. Setup & sanity check (~5 min)

Two commands. The first creates the workspace; the second proves it is well-formed.

### /atlas:init

Bootstraps the `_testatlas/` workspace inside the current repo, seeds the lifecycle artifacts (manifest, execution status, command log, run log), and records the agent's current capability profile (shell / browser / MCP / etc.). Idempotent — safe to re-run.

```
/atlas:init
```

**Produces:** `_testatlas/11_workspace_manifest.json`, `_testatlas/03_execution_status.md`, `_testatlas/09_artifact_index.md`, `_testatlas/10_command_log.md`, `_testatlas/history/run_log.md`
**Next:** `/atlas:validate-workspace`

### /atlas:validate-workspace

Schema-validates every machine-readable artifact under `_testatlas/` against the JSON Schemas shipped in `.testatlas/schemas/`. Run this whenever the workspace looks off, after pulling another agent's `_testatlas/` tree, and before handing the workspace off.

```
/atlas:validate-workspace
```

**Produces:** validation report appended to `_testatlas/10_command_log.md`; failure list (if any) under `_testatlas/03_execution_status.md`.
**Next:** `/atlas:explore` (if validation passed) — or [docs/COMMANDS.md](COMMANDS.md) for the full failure-recovery flow.

### /atlas:bootstrap

Refreshes the agent's "constitution" — re-reads the suite's PRD-§38 preamble, capability rules, and config. Run this if the agent seems to have forgotten how TestAtlas commands behave (e.g., after a long session or a context switch). Not part of the Day 1 happy path; use as needed.

```
/atlas:bootstrap
```

**Produces:** no new artifacts; updates the agent's in-context understanding of suite rules.
**Next:** continue with whatever phase you were in.

---

## 2. Discovery (~15–30 min)

Discovery is the most valuable phase and the one most likely to be misused. Read this section carefully.

### /atlas:explore — the umbrella router

`/atlas:explore` is **not** a do-everything command. It is a *router*: it inspects the app, considers your capability profile, and writes a recommendation to `_testatlas/explore-plan.md` listing which sub-explorers to run and in what order. **It does not invoke any sub-explorers itself.** You read its recommendation, then run the named sub-explorers manually.

The umbrella requires `_testatlas/12_app_map.json` to be present. Generate it first by running `/atlas:explore-codebase`.

```
/atlas:explore-codebase   # required prerequisite — produces _testatlas/12_app_map.json
/atlas:explore            # writes a recommendation, does NOT invoke sub-explorers
```

**Produces (umbrella):** `_testatlas/explore-plan.md`
**Next:** read `_testatlas/explore-plan.md`, then run only the recommended sub-explorers.

### Sub-explorers (run only what the umbrella recommends)

Do **not** run all 11. The umbrella picks the ones that match your app's surface area and your agent's capabilities.

| Command | Use when… |
|---------|-----------|
| `/atlas:explore-codebase` | **Always** (prerequisite). Maps languages, frameworks, routes, components, integrations into `_testatlas/12_app_map.json`. |
| `/atlas:explore-ui` | The product has a web UI / pages / components worth mapping by user-facing flow. |
| `/atlas:explore-cli` | The product is a CLI or has a meaningful CLI surface (commands, flags, exit codes). |
| `/atlas:explore-api` | There are HTTP/REST/GraphQL/gRPC endpoints to enumerate and contract-check. |
| `/atlas:explore-docs` | There is published user-facing documentation (README, docs site, OpenAPI, etc.) worth ingesting. |
| `/atlas:explore-runtime` | Behavior depends on runtime services (DB, queue, cache, scheduler) the agent should observe live. |
| `/atlas:explore-data` | Data models, schemas, fixtures, or migrations are central to correctness. |
| `/atlas:explore-integrations` | Third-party integrations (Stripe, Auth0, S3, webhooks) materially shape behavior. |
| `/atlas:explore-accessibility` | Accessibility coverage is in scope (WCAG, keyboard nav, screen-reader semantics). |
| `/atlas:explore-performance` | Performance budgets, slow paths, or load behavior are in scope. |
| `/atlas:explore-security` | A security pass (auth, authz, input validation, secrets, CORS, etc.) is in scope. |

Each sub-explorer writes its findings into the app map and into per-area sections referenced by `_testatlas/09_artifact_index.md`. See [docs/COMMANDS.md](COMMANDS.md) for the per-explorer artifact spec.

**Next after Discovery:** `/atlas:map-domains`

---

## 3. Organize findings (~5 min)

### /atlas:map-domains

Distills `_testatlas/12_app_map.json` into per-domain artifacts under `_testatlas/domains/<domain>/domain.json`. A "domain" is a coherent slice of behavior (auth, billing, search, admin, etc.) the agent will plan and test as a unit. Domains are the unit of risk, the unit of test focus, and the unit of reporting.

```
/atlas:map-domains
```

**Produces:** `_testatlas/domains/<domain>/domain.json` (one per identified domain)
**Next:** `/atlas:plan`

---

## 4. Plan (~10 min)

### /atlas:plan

Generates a risk-based, domain-aware test strategy and matrix from the domain artifacts. Considers state (anonymous / authed / admin), flow (happy path, edge, error), and capability (what the agent can actually exercise given browser/shell/MCP availability).

```
/atlas:plan
```

**Produces:** `_testatlas/02_test_strategy.md`, `_testatlas/plans/PLAN-master.md`, `_testatlas/tests/matrix.md`, `_testatlas/tests/matrix.json`, `_testatlas/tests/exploratory_charters.md`
**Next:** `/atlas:test-flow` (or one of the specialized variants below)

---

## 5. Test execution (~30 min, varies)

`/atlas:test-flow` is the workhorse. The four specialized variants exist because some kinds of testing benefit from a focused run loop.

### /atlas:test-flow

Executes scenarios from `_testatlas/tests/matrix.json` and the exploratory charters. Captures evidence (screenshots, transcripts, response bodies, exit codes, timings) under a fresh `_testatlas/runs/RUN-<id>/` directory.

```
/atlas:test-flow
```

**Produces:** evidence under `_testatlas/runs/RUN-<id>/`; pass/fail rollup appended to `_testatlas/03_execution_status.md`.
**Next:** `/atlas:log-issue` for any failures observed; `/atlas:report` to aggregate.

### /atlas:test-domain

Focus a run on one domain at a time. Useful when a single domain is rapidly evolving and you want a tight inner loop without re-running the whole matrix.

```
/atlas:test-domain
```

**Produces:** evidence under `_testatlas/runs/` scoped to the named domain.
**Next:** `/atlas:log-issue` / `/atlas:report` as needed.

### /atlas:test-accessibility

Runs the accessibility-specific scenarios from the matrix (keyboard navigation, focus order, ARIA, color contrast, semantic landmarks). Pairs with `/atlas:explore-accessibility` upstream.

```
/atlas:test-accessibility
```

**Produces:** a11y-tagged evidence under `_testatlas/runs/`.
**Next:** `/atlas:log-issue` for any violations; `/atlas:report`.

### /atlas:test-performance

Runs the performance-specific scenarios (cold/warm timings, payload sizes, p95 budgets where measurable). Pairs with `/atlas:explore-performance` upstream.

```
/atlas:test-performance
```

**Produces:** perf-tagged evidence under `_testatlas/runs/`.
**Next:** `/atlas:log-issue` / `/atlas:report`.

### /atlas:test-regression

Re-runs scenarios tied to issues that have been marked closed. The fastest way to verify "the fix actually fixed it" without re-running the whole matrix. Designed to be CI-friendly — see the "I want to add tests to a CI pipeline" pattern below.

```
/atlas:test-regression
```

**Produces:** regression-tagged evidence under `_testatlas/runs/`.
**Next:** `/atlas:retest` for individual issue verification; `/atlas:report`.

---

## 6. Findings management (continuous)

These three commands run alongside test execution. Use them whenever you have a new finding, need to rank a backlog, or want to confirm a fix.

### /atlas:log-issue

Captures a finding under `_testatlas/to_fix/ISSUE-<id>.md` with reproduction steps, evidence pointers, severity, and tags. Linkable from any RUN.

```
/atlas:log-issue
```

**Produces:** `_testatlas/to_fix/ISSUE-<id>.md`; index entry in `_testatlas/09_artifact_index.md`.
**Next:** `/atlas:triage` to rank, or `/atlas:retest` once a fix is claimed.

### /atlas:triage

Ranks the open issues under `_testatlas/to_fix/` by severity, impact, and risk so the team can decide what to fix first. Updates issue files in place; never deletes.

```
/atlas:triage
```

**Produces:** updated severity / priority fields on existing `_testatlas/to_fix/ISSUE-*.md` files.
**Next:** continue testing, or `/atlas:report`.

### /atlas:retest

Re-runs the reproduction scenario for a single closed/fixed issue and updates its status. Use this when a developer claims an issue is fixed and you want a quick targeted verification (vs. a full `/atlas:test-regression` run).

```
/atlas:retest
```

**Produces:** updated `_testatlas/to_fix/ISSUE-<id>.md` with retest result + evidence pointer under `_testatlas/runs/`.
**Next:** `/atlas:report` if the retest closes the loop.

---

## 7. Reporting (~5 min)

### /atlas:report

Aggregates the latest runs and the open/closed issue set into a single, human-readable summary at `_testatlas/REPORT-latest.md`. This is what you share with the team or hand to the next agent.

```
/atlas:report
```

**Produces:** `_testatlas/REPORT-latest.md`
**Next:** `/atlas:consolidate` if you want a longer-horizon rollup; `/atlas:handoff` to package the workspace for another agent/engineer.

### /atlas:consolidate

Produces a cross-run rollup that highlights trends (recurring failures, flaky scenarios, drift) over multiple `RUN-*` directories. Run this after several days of testing, not after every run.

```
/atlas:consolidate
```

**Produces:** rollup notes under `_testatlas/` (see [docs/COMMANDS.md](COMMANDS.md) for the exact path).
**Next:** `/atlas:report` again, or `/atlas:handoff`.

---

## 8. Lifecycle (when needed)

These commands are not part of every session — use them at the right moment.

### /atlas:handoff

Packages workspace state so another agent or engineer can pick it up without context loss. The receiving agent runs `/atlas:init` (idempotent — it will detect the existing workspace), then `/atlas:bootstrap`, then continues from `_testatlas/03_execution_status.md`.

```
/atlas:handoff
```

**Produces:** handoff manifest / summary referenced from `_testatlas/09_artifact_index.md`.
**Next:** the receiving agent runs `/atlas:init` → `/atlas:bootstrap` → continues.

### /atlas:cleanup

Archives stale runs, closed issues older than the retention window, and obsolete artifacts. Non-destructive by default — moves things into an archive subtree rather than deleting.

```
/atlas:cleanup
```

**Produces:** archived files under `_testatlas/` (path documented in [docs/COMMANDS.md](COMMANDS.md)).
**Next:** `/atlas:validate-workspace` to confirm the cleanup left a valid workspace.

### /atlas:update

Pulls a newer version of the suite (`.testatlas/`) from the configured release source. Atomic with backup + rollback — if the update fails mid-flight, the previous suite tree is restored. See [docs/UPDATE.md](UPDATE.md) for migration mechanics, version pinning, and rollback details.

```
/atlas:update
```

**Produces:** updated `.testatlas/` suite tree; backup at `.testatlas.bak.<timestamp>/` (auto-pruned).
**Next:** `/atlas:validate-workspace` (always — schemas may have changed).

---

## Common patterns

Four real flows you'll likely run.

### "I just want to find security issues"

```
/atlas:init
/atlas:validate-workspace
/atlas:explore-codebase           # produces the app map
/atlas:explore-security           # security-specific exploration
/atlas:map-domains
/atlas:plan                       # strategy + matrix; security scenarios will be tagged
/atlas:test-flow                  # execute (filter on security-tagged scenarios in your agent)
/atlas:log-issue                  # for each finding
/atlas:report
```

Agents that support filtering (most do) can be told "run only security-tagged scenarios from the matrix" — the matrix tags this for you.

### "I want to add tests to a CI pipeline"

```
/atlas:init                       # one-time, in the repo
/atlas:explore                    # one-time, captures the recommendation
/atlas:map-domains
/atlas:plan
/atlas:test-regression            # this is the CI-friendly entry point
/atlas:report                     # CI uploads REPORT-latest.md as an artifact
/atlas:triage                     # only if /atlas:test-regression reports failures
```

`/atlas:test-regression` is designed for CI: it re-runs scenarios tied to closed issues, so a regression breaks the build the same week the bug came back.

### "I want to hand this off to another agent"

```
# Sender:
/atlas:validate-workspace         # must pass before handoff
/atlas:consolidate                # roll up trends so the receiver has narrative
/atlas:handoff                    # package the state

# Commit and share the _testatlas/ tree (it's checked in by design)

# Receiver:
/atlas:init                       # idempotent — detects existing _testatlas/, fills gaps only
/atlas:bootstrap                  # refresh the constitution + capability profile
# Read _testatlas/03_execution_status.md and continue from where the sender stopped.
```

### "I want to keep the suite up to date"

```
/atlas:update                     # pulls newest suite tree, atomic w/ rollback
/atlas:validate-workspace         # schemas may have changed — always re-validate
# Skim _testatlas/CHANGELOG-style notes referenced from the run log.
```

For migration semantics, version pinning, and rollback details, see [docs/UPDATE.md](UPDATE.md).

---

## Troubleshooting

**First-line advice:** when anything looks off, run `/atlas:validate-workspace`. It will tell you precisely which artifact failed which schema.

- **Workspace looks wrong / missing files** → run `/atlas:validate-workspace`, then re-run `/atlas:init` (idempotent — it fills gaps without clobbering).
- **No `.testatlas/` directory in the repo** → the suite isn't installed yet. See [docs/INSTALL.md](INSTALL.md) for the three install paths.
- **Signed-tarball or signature questions during install/update** → see [docs/SIGNING.md](SIGNING.md).
- **`/atlas:explore` halts complaining about missing `_testatlas/12_app_map.json`** → the umbrella requires the app map. Run `/atlas:explore-codebase` first; then re-run `/atlas:explore`.
- **Capability degradation (no shell / no browser / no MCP)** → expected behavior. Commands self-mark `confidence: needs-validation` per the rule embedded in `bootstrap.md`. Run those commands again later when the capability is restored — the workspace will upgrade the confidence level on a successful re-run.
- **Update broke something** → `/atlas:update` keeps a backup at `.testatlas.bak.<timestamp>/`. See [docs/UPDATE.md](UPDATE.md) for the rollback procedure.

---

## Next steps

- Full per-command reference (auto-generated from `.testatlas/commands/*.md` frontmatter): [docs/COMMANDS.md](COMMANDS.md)
- Updates, migrations, version pinning, rollback: [docs/UPDATE.md](UPDATE.md)
- Install paths and install troubleshooting: [docs/INSTALL.md](INSTALL.md)
- Project overview and the wider documentation map: [README.md](../README.md)
