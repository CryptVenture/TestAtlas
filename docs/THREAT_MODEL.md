# Threat Model

This document enumerates concrete attack surfaces against TestAtlas and the
mitigations the project commits to. It enforces requirement GOV-05 and is referenced
from `SECURITY.md`.

Attack surfaces covered (per success criterion 4):
1. The `curl | sh` install path
2. Auto-update propagation
3. Agent-level prompt injection via `.claude/commands/` (and equivalent adapter
directories)

## Threat Model Method

We use STRIDE-lite (Spoofing, Tampering, Repudiation, Information Disclosure,
Denial of Service, Elevation of Privilege) framing per surface, focusing on
Tampering and Elevation, since TestAtlas is a developer-tool framework, not a
service.

---

## Surface 1: `curl | sh` Installer

**Description.** Users may install TestAtlas via
`curl -fsSL https://raw.githubusercontent.com/testatlas-dev/testatlas/<tag>/install.sh | sh`.
Anything served from the install URL executes with the user's shell privileges.

**Threats:**
- **T1.1 Tampering — repository compromise.** An attacker with write access to
  the repo (or a forged tag) replaces `install.sh` with a malicious version.
- **T1.2 Tampering — TLS/MITM.** Network attacker injects a malicious payload.
- **T1.3 Tampering — partial pipe execution.** A truncated download executes
  only part of the script, leaving the system in a half-installed state.
- **T1.4 Elevation — root assumption.** Script runs commands assuming root
  without checking, harming user sandbox.

**Mitigations:**
- **M1.1.** `install.sh` MUST be ≤200 lines, POSIX `/bin/sh`, shellcheck-clean.
  Smaller surface = easier review.
- **M1.2.** Installer pins to a **tagged release** (no `main` branch fetches).
- **M1.3.** Installer downloads the release tarball and **verifies SHA-256
checksums** published in the GitHub Release before extraction.
- **M1.4.** Installer uses the **redirect-then-exec idiom**: write to a temp
file, verify, then execute — never `curl ... | sh` of the payload itself.
- **M1.5.** GitHub Releases ship **signed tarballs**; `--verify-signature`
flag opts into signature check (Phase 7).
- **M1.6.** README Quick Install warning section recommends inspecting the
script first: `curl -fsSL .../install.sh -o install.sh && less install.sh && sh install.sh`.
- **M1.7.** Branch protection on `main`: required reviews, signed commits for
maintainers, no force-push.
- **M1.8.** Phase 0 governance: bus-factor ≥2 maintainers (`ADAPTER-OWNERS.md`)
so a single compromised account cannot ship a release.

**Residual risk.** A skilled attacker compromising both a maintainer GPG key
and the GitHub repo simultaneously could ship a signed malicious release. We
accept this residual risk as inherent to OSS distribution; mitigated only by
multi-maintainer review.

---

## Surface 2: Auto-Update Propagation

**Description.** TestAtlas polls the GitHub Releases API on a configurable TTL
(default 24h) and offers `/atlas:update` when newer versions exist. A malicious
release could silently propagate to many user repositories.

**Threats:**
- **T2.1 Tampering — malicious release propagation.** Compromised release tag
triggers users to update.
- **T2.2 Elevation — in-flight run corruption.** Update applied during an
active test run corrupts `_testatlas/` workspace.
- **T2.3 Information Disclosure — pin bypass.** A bug in the pin logic causes
a `pinnedVersion` user to update unintentionally.
- **T2.4 Denial of Service — update loop.** A buggy migration leaves the
workspace in a state where the next update cannot proceed.

**Mitigations:**
- **M2.1.** **Never auto-apply.** Updates are always user-prompted (PRD
decision; codified in `docs/SCOPE.md` rejection #8).
- **M2.2.** **Backup before update.** Every update creates
`.testatlas.backup-<timestamp>/` and rolls back on failure (Phase 7
UPDATE-02).
- **M2.3.** **Workspace lockfile** (`_testatlas/.lock`) blocks updates during
in-flight test runs with a clear error (Phase 7 UPDATE-06).
- **M2.4.** **`pinnedVersion` honored strictly**; CI test enumerates pin
bypass scenarios (Phase 7).
- **M2.5.** **Forward-only idempotent migrations** in `.testatlas/migrations/`
with N→N+5 long-jump composition tests (Phase 7 UPDATE-05).
- **M2.6.** **Two-tree invariant.** Updates touch only `.testatlas/`, never
`_testatlas/` workspace, except via explicit migrations.
- **M2.7.** **Stale-pin warnings.** Users on `pinnedVersion` past a configurable
threshold receive warnings, not silent updates.
- **M2.8.** **`disableUpdateCheck` config and `--no-update-check` flag**
available for offline / restricted environments.

**Residual risk.** A malicious release compromising the canonical command spec
could ship plausible-looking but adversarial instructions to all updating
users. Mitigated by: review-required CI on every command file, token-budget
gate (which makes silent payload injection harder), and the bus-factor policy.

---

## Surface 3: Prompt Injection via `.claude/commands/` (and Adapter Equivalents)

**Description.** TestAtlas installs slash-command instruction files into the
target repo's adapter directory (`.claude/commands/atlas-*.md` for Claude Code,
similar paths for other adapters). These files become part of the agent's
prompt every time the user invokes a command. An attacker who modifies these
files can inject instructions that the agent will execute with the user's
privileges.

**Threats:**
- **T3.1 Tampering — adapter file modification by malicious dependency.** A
compromised npm dependency in the consumer repo modifies
`.claude/commands/atlas-*.md` during a postinstall hook, injecting
instructions like "exfiltrate `~/.ssh/id_rsa`".
- **T3.2 Tampering — adapter file modification by adversarial PR.** A PR
against the consumer repo modifies adapter files; reviewers do not read
markdown carefully and merge.
- **T3.3 Information Disclosure — workspace data leak.** Injected
instructions tell the agent to read `_testatlas/` evidence and POST it to
an attacker-controlled URL.
- **T3.4 Elevation — destructive command execution.** Injected instructions
bypass the `allowDestructiveActions: false` default.

**Mitigations:**
- **M3.1.** **Adapters are generated, not hand-edited.** CI rejects
hand-edits to derived adapter files (Phase 6 ADP-02).
- **M3.2.** **Bootstrap-first preamble.** Every command file forces the agent
to read `.testatlas/bootstrap.md` first, where the safety/persistence rules
live in the first 500 tokens (Phase 1 BOOT-03). Injected late-file
instructions are constrained by early-file rules.
- **M3.3.** **"No evidence, no finding" hard rule.** Even if injected, the
agent cannot fabricate findings without evidence files; validate-workspace
catches orphans.
- **M3.4.** **Capability declarations.** Each command declares required
capabilities; an injected instruction asking for `web-fetch` on an adapter
without that capability emits a graceful refusal rather than executing.
- **M3.5.** **Safe-by-default config.** `allowDestructiveActions: false`,
`allowProductionTesting: false`, redaction pipeline mandatory.
- **M3.6.** **Install manifest** (`.testatlas/.install-manifest.json`) tracks
every installed adapter file; `validate-workspace` warns on unexpected
modifications outside the manifest (Phase 5 SCR-03 + VAL-01).
- **M3.7.** **Adapter directory in `.gitignore` recommendations.** Phase 8
docs recommend committing adapter files only when reviewed.
- **M3.8.** **Documentation in `SECURITY.md`** advising users to treat
`.claude/commands/atlas-*.md` and equivalents as code, not docs — review
them like source.

**Residual risk.** Sufficiently sophisticated prompt injection that respects
the bootstrap rules (e.g., social-engineering the user via the agent's output)
is hard to mitigate at the framework level. We rely on the bootstrap-first
contract + safety defaults + validate-workspace + user vigilance.

---

## Surfaces Out of Scope (Tracked Elsewhere)

- **Workspace data corruption (non-malicious)** — see PRD §31 generated-section
markers + validate-workspace, addressed in Phase 2/Phase 5.
- **Adapter parity drift** — addressed in Phase 6 (CI parity test).
- **Hallucinated findings** — addressed in Phase 1 bootstrap (anti-
hallucination rule) and Phase 5 validate-workspace.
- **Single-maintainer burnout** — addressed in `ADAPTER-OWNERS.md`
(governance, not security).

## Review Cadence

This document is reviewed at every major release and whenever a new attack
surface is identified. Changes require maintainer consensus via PR.

## See Also

- `SECURITY.md` — How to report vulnerabilities privately.
- `docs/SCOPE.md` — What TestAtlas refuses to do (complementary boundary).
- `.planning/research/PITFALLS.md` — Source research for these threats.
