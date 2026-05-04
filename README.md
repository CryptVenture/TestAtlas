# TestAtlas

[![npm version](https://img.shields.io/npm/v/testatlas.svg)](https://www.npmjs.com/package/testatlas)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/<org>/testatlas/ci.yml?branch=main&label=ci)](.github/workflows/ci.yml)

TestAtlas is an installable, agent-agnostic product testing and quality intelligence framework. It turns any capable AI coding agent (Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP-capable, generic) into a persistent product-understanding, exploration, test-planning, user-flow execution, evidence-collection, and issue-management system that produces a durable `_testatlas/` workspace inside any target repository.

## Status

Pre-1.0. Active development. The v0.1.0 release ships the full distribution infrastructure (install / update / uninstall / signing / migrations); GA release is gated on Phase 8 (examples + first real npm publish).

See [.planning/ROADMAP.md](.planning/ROADMAP.md) for phase progress.

## Installation

Three install paths are supported. Pick the one that matches your environment:

### Path 1 — `npx testatlas init` (recommended)

```sh
cd /path/to/your/project
npx testatlas init
```

Auto-detects the installed agent platform (Claude Code, Cursor, Aider, KiloCode, OpenCode, MCP, generic), installs only relevant adapter(s), and writes `./.testatlas/` (suite) + `./_testatlas/` (workspace).

### Path 2 — `curl … | sh` (POSIX installer)

```sh
curl -fsSL https://raw.githubusercontent.com/<org>/testatlas/main/install.sh | sh
```

Use when Node isn't installed yet, or for unattended provisioning. Pinned to a tagged release with SHA-256 verification. Tested on Linux + macOS (Alpine + BusyBox compatible).

### Path 3 — `git clone` + `node install.js` (offline)

```sh
git clone https://github.com/<org>/testatlas.git
cd testatlas
node install.js /path/to/your/project
```

For airgap, security-conscious adoption, or vendoring a specific commit.

**Detailed install docs:** [docs/INSTALL.md](docs/INSTALL.md)

## Documentation

| Topic | Doc |
|-------|-----|
| Install paths + troubleshooting | [docs/INSTALL.md](docs/INSTALL.md) |
| Updates, migrations, pinning | [docs/UPDATE.md](docs/UPDATE.md) |
| Uninstall behavior matrix | [docs/UNINSTALL.md](docs/UNINSTALL.md) |
| Signing & verification | [docs/SIGNING.md](docs/SIGNING.md) |
| LTS strategy + support window | [docs/LTS.md](docs/LTS.md) |
| Release process (maintainers) | [docs/RELEASE.md](docs/RELEASE.md) |
| Threat model | [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) |
| Scope | [docs/SCOPE.md](docs/SCOPE.md) |
| Adapter ownership | [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md) |

## Examples

Examples gallery ships with Phase 8 (GA). See [.planning/REQUIREMENTS.md](.planning/REQUIREMENTS.md) `EX-*` requirements.

## Quick Links

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE).
