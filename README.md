<p align="center">
  <img src="media/TestAtlas-HorizontalLogo1.png" alt="TestAtlas" width="600" />
</p>

<p align="center">
  <strong>Turn any AI coding agent into a persistent product-quality intelligence layer.</strong>
</p>

# TestAtlas

<p align="center">
[![npm version](https://img.shields.io/npm/v/@webventures/testatlas.svg)](https://www.npmjs.com/package/@webventures/testatlas)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/CryptVenture/TestAtlas/ci.yml?branch=main&label=ci)](.github/workflows/ci.yml)
[![Provenance](https://img.shields.io/badge/npm-provenance-success.svg)](https://docs.npmjs.com/generating-provenance-statements)
</p>

## What is this?

TestAtlas is an installable, agent-agnostic product testing and quality intelligence framework. It turns any capable AI coding agent (Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP-capable, generic) into a persistent product-understanding, exploration, test-planning, user-flow execution, evidence-collection, and issue-management system that produces a durable `_testatlas/` workspace inside any target repository.

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

That's it. The agent now has 30 `/atlas:*` commands, schema-validated workspace artifacts, and a capability-aware degradation rule that keeps it honest when tools (browser/MCP/shell) aren't available.

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
- Auto-detected adapter for your agent: Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP, or Generic. `--all-adapters` ships every adapter.
- 30 `/atlas:*` commands covering init, validate, explore (×11 sub-explorers), test (×10 types), issue lifecycle, reporting, lifecycle/handoff/cleanup.
- 19 JSON Schemas (Draft 2020-12) governing every machine-readable artifact.
- Atomic self-update with backup + rollback, signed tarball verification (cosign opt-in), and version pinning for stability-conscious teams.

## Documentation

| Topic | Doc |
|-------|-----|
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
| [nextjs-saas](examples/nextjs-saas/) | Next.js 15 App Router + React 19 | All 7 | UI exploration, page/route/component mapping, auth flow |
| [node-api](examples/node-api/) | Express 5 ESM API | All 7 | API exploration, endpoint mapping, mock-auth security findings |
| [cli-tool](examples/cli-tool/) | Commander 14 CLI | **Aider-only** | Capability-aware degradation; `confidence: needs-validation` |
| [monorepo](examples/monorepo/) | pnpm workspaces (web + api + shared) | All 7 | Per-app workspace orchestration; cross-cut flows in root `_testatlas/` |
| [mobile-web-hybrid](examples/mobile-web-hybrid/) | Expo SDK 52+ Router | All 7 | Universal RN+web mapping; structure-only (not built in CI) |

Regenerate any example deterministically with:

```sh
node scripts/regenerate-example.js examples/<name>
```

See [examples/README.md](examples/README.md) for the per-example deep dives.

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, schema/command-contract change rules, and the LTS support policy. The project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

Adapter-specific changes route through [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md).

## Security

Please report security issues privately per [SECURITY.md](SECURITY.md). Do **not** open a public GitHub Issue for security-sensitive reports. We aim to acknowledge within 72 hours and patch high-severity issues within 30 days.

The full threat model lives at [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## License

MIT — see [LICENSE](LICENSE).
