<p align="center">
  <img src="media/TestAtlas-HorizontalLogo1.png" alt="TestAtlas" width="600" />
</p>

<p align="center">
  <strong>Turn any AI coding agent into a persistent product-quality intelligence layer.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@webventures/testatlas"><img src="https://img.shields.io/npm/v/@webventures/testatlas.svg" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://github.com/CryptVenture/TestAtlas/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/CryptVenture/TestAtlas/ci.yml?branch=main&label=ci" alt="CI" /></a>
  <a href="https://docs.npmjs.com/generating-provenance-statements"><img src="https://img.shields.io/badge/npm-provenance-success.svg" alt="Provenance" /></a>
</p>

## Why TestAtlas?

You ship features fast. But who is systematically exploring the product from a *user's* perspective? Who catches the broken checkout flow on mobile, the missing focus ring, the API that returns 500 under throttled networks? TestAtlas closes that gap by giving your AI agent a structured testing brain — one that persists everything it learns into a durable workspace any engineer (or another agent) can pick up and continue.

**The problem:** AI agents today write code brilliantly, but they forget what they tested, lose track of findings across sessions, and cannot hand off quality intelligence to the next developer. TestAtlas fixes this.

## What is this?

TestAtlas is an installable, agent-agnostic product testing and quality intelligence framework. It turns any capable AI coding agent (Claude Code, Cursor, Aider, KiloCode, OpenCode, MCP-enabled hosts, Codex, Gemini CLI, Cline, Windsurf, Kiro, Continue.dev, GitHub Copilot, Sourcegraph Amp, Roo Code, Zed, Amazon Q, plus a generic paste-prompt fallback — 18 adapter families in total; see [`ADAPTER-OWNERS.md`](ADAPTER-OWNERS.md)) into a persistent product-understanding, exploration, test-planning, user-flow execution, evidence-collection, and issue-management system that produces a durable `_testatlas/` workspace inside any target repository.

**Core value:** A capable AI agent, after running `/atlas:init`, can map an unfamiliar product, test it from a real user's perspective, and leave behind a durable, evidence-backed quality intelligence layer that another agent or engineer can trust and continue — without any prior knowledge of the application stack.

## Quickstart

```sh
cd /path/to/your/project
npx @webventures/testatlas init
```

Then in your AI agent of choice:

```
/atlas:init
```

That's it. The agent now has 31 `/atlas:*` commands, schema-validated workspace artifacts, and a capability-aware degradation rule that keeps it honest when tools (browser/MCP/shell) aren't available.

## How it works

```
Your Repo                    TestAtlas Suite                    AI Agent
─────────────────────────────────────────────────────────────────────────
   │                              │                                  │
   │  npx @webventures/testatlas init                                │
   │─────────────────────────────>│                                  │
   │                              │  .testatlas/ suite installed     │
   │                              │  _testatlas/ workspace skeleton  │
   │<─────────────────────────────│                                  │
   │                              │                                  │
   │  /atlas:explore              │                                  │
   │────────────────────────────────────────────────────────────────>│
   │                              │                                  │
   │                              │  Agent maps product surface:     │
   │                              │  • UI routes & components        │
   │                              │  • API endpoints                 │
   │                              │  • Data models & flows           │
   │                              │  • Performance baselines         │
   │                              │  • Accessibility gaps            │
   │                              │                                  │
   │                              │  Evidence captured:              │
   │                              │  • Screenshots                   │
   │                              │  • Network traces                │
   │                              │  • Performance traces            │
   │                              │  • DOM snapshots                 │
   │                              │                                  │
   │  _testatlas/ workspace       │                                  │
   │<────────────────────────────────────────────────────────────────│
   │                              │                                  │
   │  • domains/                  │  Durable quality intelligence    │
   │  • flows/                    │  that survives session end       │
   │  • issues/                   │                                  │
   │  • evidence/                 │  Next agent picks up where       │
   │  • runs/                     │  the last one left off           │
   │                              │                                  │
```

## Installation

Three install paths are supported. Pick the one that matches your environment:

| Path | Use when |
|------|----------|
| **Path 1**: [`npx @webventures/testatlas init`](docs/INSTALL.md#path-1--npx-webventurestestatlas-init-recommended) | You have npm. (Most users.) |
| **Path 2**: [`curl -fsSL .../install.sh \| sh`](docs/INSTALL.md#path-2--curl--sh-posix-installer) | Shell-first env, no Node tooling. POSIX `sh`, Alpine/BusyBox tested. |
| **Path 3**: [`git clone && node install.js <target>`](docs/INSTALL.md#path-3--git-clone--node-installjs-offline) | Airgap, security review, contributor. |

All three paths converge on the same install kernel and produce the same `.testatlas/` suite tree, `_testatlas/` workspace skeleton, and `.testatlas/.install-manifest.json` ledger.

## What you get

- `_testatlas/` workspace inside your repo — durable, schema-validated quality intelligence layer (14 canonical files + 23 subdirs).
- Auto-detected adapter for your agent across 18 adapter families spanning the major 2026 AI coding agent ecosystems (see [`ADAPTER-OWNERS.md`](ADAPTER-OWNERS.md) for the full roster). `--all-adapters` ships every adapter; `--adapter <name>` picks specific ones.
- 31 `/atlas:*` commands covering init, validate, explore (×11 sub-explorers), test (×10 types), issue lifecycle, reporting, lifecycle/handoff/cleanup.
- 19 JSON Schemas (Draft 2020-12) governing every machine-readable artifact.
- Atomic self-update with backup + rollback, signed tarball verification (cosign opt-in), and version pinning for stability-conscious teams.

## Real browser testing, real evidence

TestAtlas does not simulate browsers from training data. It drives **Chrome DevTools MCP** to navigate, screenshot, trace performance, audit accessibility, and capture network traffic — then persists every artifact as evidence:

| Test type | What the agent does | Evidence captured |
|-----------|--------------------|--------------------|
| **UI exploration** | `navigate_page` → `take_snapshot` → `take_screenshot` → `resize_page` (mobile/tablet/desktop) | DOM snapshots, responsive screenshots, console logs, network HARs |
| **Accessibility audit** | `lighthouse_audit` (accessibility category) + `press_key` Tab traversal + contrast sampling | Lighthouse JSON, focus-order trails, ARIA inventories, contrast samples |
| **Performance trace** | `performance_start_trace` → exercise flow → `performance_stop_trace` + `emulate` (CPU throttling, Slow 3G) | Baseline + throttled traces, LCP/INP/CLS insights, network waterfalls |
| **End-to-end flows** | Execute scenarios from `tests/matrix.json` against running product | Per-state screenshots, step-by-step run records, pass/fail assertions |

Every claim is backed by on-disk evidence. The agent marks findings `confidence: needs-validation` when tools are unavailable — it never fabricates trace timings, Lighthouse scores, or DOM structures from memory.

## Who is this for?

| Role | How TestAtlas helps |
|------|--------------------|
| **Solo developers** | Your AI agent becomes a QA partner that remembers what it found, so you don't have to re-test manually after every refactor. |
| **Small teams without dedicated QA** | Systematic product exploration and regression testing without hiring a separate team. |
| **Teams onboarding new developers** | The `_testatlas/` workspace is a living map of the product — routes, flows, known issues, evidence. New hires read it instead of guessing. |
| **AI-first engineering teams** | 18 adapter families mean your existing agent setup (Claude Code, Cursor, KiloCode, etc.) works out of the box. |
| **Open-source maintainers** | Contributors can run `/atlas:explore` and `/atlas:test-flow` before opening PRs, catching regressions before review. |
| **Agencies & consultancies** | Hand off a `_testatlas/` workspace to clients as a deliverable — documented quality intelligence they can continue. |

## Documentation

| Topic | Doc |
|-------|-----|
| First-hour walkthrough | [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) |
| Command reference (auto-generated) | [docs/COMMANDS.md](docs/COMMANDS.md) |
| Schema reference (auto-generated) | [docs/SCHEMAS.md](docs/SCHEMAS.md) |
| Adapter guides | [.testatlas/adapters/README.md](.testatlas/adapters/README.md) |
| Examples gallery | [examples/README.md](examples/README.md) |
| Install paths + troubleshooting | [docs/INSTALL.md](docs/INSTALL.md) |
| Updates, migrations, pinning | [docs/UPDATE.md](docs/UPDATE.md) |
| Uninstall behavior matrix | [docs/UNINSTALL.md](docs/UNINSTALL.md) |
| Signing & verification | [docs/SIGNING.md](docs/SIGNING.md) |
| LTS strategy + support window | [docs/LTS.md](docs/LTS.md) |
| Monorepo orchestration | [docs/MONOREPO.md](docs/MONOREPO.md) |
| Release process (maintainers) | [docs/RELEASE.md](docs/RELEASE.md) |
| Threat model | [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) |
| Scope (in / out) | [docs/SCOPE.md](docs/SCOPE.md) |
| Adapter ownership | [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

## Examples gallery

Five reference projects, each shipping a checked-in `_testatlas/` workspace that validates against the v1 schemas:

| Example | Kind | Adapter set | Showcase |
|---------|------|-------------|----------|
| [nextjs-saas](examples/nextjs-saas/) | Next.js 15 App Router + React 19 | All 18 | UI exploration, page/route/component mapping, auth flow |
| [node-api](examples/node-api/) | Express 5 ESM API | All 18 | API exploration, endpoint mapping, mock-auth security findings |
| [cli-tool](examples/cli-tool/) | Commander 14 CLI | **Aider-only** | Capability-aware degradation; `confidence: needs-validation` |
| [monorepo](examples/monorepo/) | pnpm workspaces (web + api + shared) | All 18 | Per-app workspace orchestration; cross-cut flows in root `_testatlas/` |
| [mobile-web-hybrid](examples/mobile-web-hybrid/) | Expo SDK 52+ Router | All 18 | Universal RN+web mapping; structure-only (not built in CI) |

Regenerate any example deterministically with:

```sh
node scripts/regenerate-example.js examples/<name>
```

See [examples/README.md](examples/README.md) for the per-example deep dives.

## Contributing

TestAtlas is built in the open and we actively welcome contributors. Whether you want to add an adapter for your favourite agent, improve the schema validation, write new example workspaces, or sharpen the documentation, there is a place for you.

**Why contribute?**

- **Shape the future of AI-driven testing** — this is a greenfield space. Your ideas directly influence how 18+ agent ecosystems discover and test software.
- **Adapter work is high-leverage** — adding or improving one adapter (e.g. a new VS Code extension, a new CLI tool) instantly benefits every user of that agent family. See [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md) for current ownership.
- **Well-tested, well-documented** — 1,000+ tests, 19 JSON Schemas, auto-generated docs, and deterministic example regeneration mean you can refactor with confidence.
- **Clear contribution paths:**
  - **New adapter?** Copy an existing renderer, add your entry to `adapter-capabilities.json`, run `node scripts/assemble-adapter.js`, and open a PR.
  - **New command?** Add a `.testatlas/commands/<name>.md` file, update schemas if needed, and the parity gate regenerates all 18 adapter families automatically.
  - **Bug fix?** Add a failing test first (TDD is the norm here), then fix.
  - **Docs?** Every doc under `docs/` and `examples/` is version-controlled and reviewed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development setup, schema/command-contract change rules, and the LTS support policy. The project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

Adapter-specific changes route through [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md).

## Trust & quality

TestAtlas is engineered for production use:

- **1,000+ tests** covering install, update, uninstall, workspace init, schema validation, adapter parity, capability degradation, and end-to-end example regeneration — all run on every PR.
- **19 JSON Schemas (Draft 2020-12)** — every machine-readable artifact is schema-governed. `validate-workspace` rejects malformed data before it pollutes your quality intelligence.
- **Atomic updates with rollback** — self-update copies the suite atomically (staging → backup → swap) and can roll back on failure. Version pinning lets stability-conscious teams lock to a known-good release.
- **Signed release artifacts** — npm provenance + optional cosign signature verification on tarballs.
- **Capability-aware degradation** — when `browser` or `MCP` is unavailable, the agent falls back to code-reading and marks findings `confidence: needs-validation`. It never fabricates evidence.
- **MIT licensed** — use it commercially, fork it, embed it. No restrictions.

## Security

Please report security issues privately per [SECURITY.md](SECURITY.md). Do **not** open a public GitHub Issue for security-sensitive reports. We aim to acknowledge within 72 hours and patch high-severity issues within 30 days.

The full threat model lives at [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## License

MIT — see [LICENSE](LICENSE).

## What's Next

**Start in under a minute:**

```sh
cd /path/to/your/project
npx @webventures/testatlas init
```

Then tell your agent: `/atlas:explore` — and watch it map your product surface, capture evidence, and build a durable quality intelligence layer you can trust.

**Learn more:**

| Step | Resource |
|------|----------|
| 1. Install | [docs/INSTALL.md](docs/INSTALL.md) — three paths (npx, curl, git clone) |
| 2. First hour | [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) — walk through all 31 `/atlas:*` commands |
| 3. Explore your product | `/atlas:explore` — the agent maps UI, API, CLI, data, integrations, performance, accessibility |
| 4. Run tests | `/atlas:test-flow` — execute scenarios against your running product with evidence capture |
| 5. Deep dive | [docs/COMMANDS.md](docs/COMMANDS.md) — auto-generated command reference |
| 6. Add your agent | [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md) — if your favourite agent is not listed, open a PR |

**Star the repo** to follow releases, and open an issue if your agent family is missing — we ship new adapters regularly.
