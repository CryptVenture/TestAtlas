<!-- OBD:project-start source:PROJECT.md -->
## Project

**TestAtlas**

TestAtlas is an installable, agent-agnostic product testing and quality intelligence framework. It turns any capable AI coding agent (Claude Code, OpenCode, KiloCode, Cursor-like, Aider-like, MCP-capable, generic) into a persistent product-understanding, exploration, test-planning, user-flow execution, evidence-collection, and issue-management system that produces a durable `_testatlas/` workspace inside any target repository.

**Core Value:** **A capable AI agent, after running `/atlas:init`, can map an unfamiliar product, test it from a real user's perspective, and leave behind a durable, evidence-backed quality intelligence layer that another agent or engineer can trust and continue — without any prior knowledge of the application stack.**

If everything else fails, this must work.

### Constraints

- **License**: MIT — broadest adoption for an agentic framework
- **Hosting**: Public GitHub — releases via GitHub Releases API, npm publishing for `npx` flow
- **Runtime**: Node.js for all scripts; agent instructions are platform-agnostic markdown
- **Tool dependency**: Suite must operate agent-only (scripts are optional accelerators per PRD §22)
- **Workspace location**: `./_testatlas` is canonical default; configurable via `workspaceDir`
- **Suite location**: `.testatlas/` is canonical default; configurable via `instructionDir`
- **Safety**: `safeMode: true`, `allowDestructiveActions: false`, `allowProductionTesting: false` are defaults; opt-in only
- **Schema discipline**: Every machine-readable artifact has a JSON schema; validate-workspace enforces
- **Backwards compatibility**: Schema migrations required across major versions; pinning supported
<!-- OBD:project-end -->

<!-- OBD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Summary (TL;DR)
- **Language:** Plain JavaScript (ESM), authored as `.js` — not TypeScript. Primary reason: PRD §22 mandates `node .testatlas/scripts/<name>.js` direct invocation with no build step on user machines. A build step would either ship transpiled code (loses readability for adapter authors) or require the user to have a compiler in their toolchain.
- **Module system:** ESM-only (`"type": "module"`). All scripts use `import`/`export`. Node 20+ has full ESM, fetch, and stable test runner.
- **Node floor:** **Node 20 LTS** (minimum). Node 22 LTS is the active LTS as of May 2026 and is the test/CI target. Node 20 is in maintenance until April 2026-04-30 (just expiring); a Node 20 floor maximizes reach for the next ~12 months while letting us use native fetch, stable `node:test`, and modern ESM.
- **CLI framework:** **`commander@^13`** — the indisputable standard (217M weekly downloads, used by webpack-cli, babel-cli, npm itself transitively). v13 adds first-class TypeScript types but works perfectly in plain JS.
- **JSON Schema validator:** **`ajv@^8` + `ajv-formats@^3`** — required because PRD §21 specifies the canonical schema set (V1 baseline of 20, extended in V2 to 38 JSON Schemas in `.testatlas/schemas/*.schema.json`); these are real JSON Schema documents, not Zod/Valibot schemas. AJV is the JSON Schema reference implementation in JS. Use Zod/Valibot only for runtime CLI argv validation if at all.
- **HTTP client (GitHub Releases API):** **Native `fetch`** (Node 20+) — zero dependency. Undici under the hood.
- **Semver:** **`semver@^7`** (the npm-maintained official one) for `pinnedVersion` comparison and update-check logic.
- **File system:** **Native `node:fs/promises`** — Node 20+ has `fs.cp` (recursive copy), `fs.rm` (recursive delete), `mkdir({recursive:true})`. `fs-extra` is no longer needed for this scope.
- **Test runner:** **`node:test`** (built-in) + `node:assert/strict`. Zero dependencies, ships with Node, sufficient for testing scripts/installer/schema validators. Use Vitest only if we later need snapshot-rich UI work (we don't).
- **Lint/format:** **`@biomejs/biome@^2`** — single tool, Rust-based, 10–20× faster than ESLint+Prettier, production-ready in 2026 (used at AWS, Google, Microsoft, Cloudflare, Coinbase, Slack). Single config file.
- **Package manager (suite repo dev):** **`pnpm@^10`** for the suite's own development. We do NOT enforce a package manager on consumer repos — `npx @webventures/testatlas init` works regardless of what the consumer uses.
- **Shell installer:** **POSIX `/bin/sh`** (not bash-only), shellcheck-clean, with `set -eu`, redirect-then-exec idiom (write to tempfile, verify, exec) to mitigate the "partial pipe" risk.
- **Build/bundle:** **None.** Ship raw `.js` files. No Babel, no Rollup, no esbuild for the suite scripts.
- **License/repo files:** MIT LICENSE, CHANGELOG.md (Keep-a-Changelog), CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, `.github/` with issue/PR templates.
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | `>=20.11.0` (engines), test on `22.x` LTS | Runtime for all scripts | Node 22 is active LTS through April 2027; Node 20 maintenance ends April 2026 but most users will have it. Floor of 20 gives us native `fetch`, stable `node:test`, `fs.cp`, `import.meta.url`, `import.meta.resolve`. |
| JavaScript (ESM) | ES2023 idioms | Source language | PRD §22 example shows `node .testatlas/scripts/validate-workspace.js` — plain Node execution with no transpile step. Authoring in TS would force either a build step (rejected) or `--experimental-strip-types` (still flagged in Node 22, only stable in 24). Plain JS = zero friction across all consumer Node installs ≥20. |
| `package.json` `"type": "module"` | n/a | ESM-by-default | All scripts use `import`. CJS is dead for greenfield 2026 projects per ecosystem consensus. Files use `.js` extension; if any script must be CJS-loadable (none in v1), use `.cjs`. |
| `commander` | `^13.0.0` | CLI argument parsing for `init.js`, `update.js`, `uninstall.js`, `install.js`, and the 12 utility scripts | Standard since 2011; 217M weekly downloads, 27.6k stars. v13 (2025) modernized: native ESM, TypeScript types, action-handler async, better subcommand handling. Better fit than `cac` (smaller community), `sade` (development inactive), `yargs` (heavier), or hand-rolled argv (12 scripts × consistent UX = use the standard). |
| `ajv` | `^8.17.0` | JSON Schema validation for the 19 schemas in `.testatlas/schemas/` | PRD §21 mandates real JSON Schema documents. AJV is THE JSON Schema reference implementation in JS — 65M weekly downloads, supports drafts 04/06/07/2019-09/2020-12. Compiles schemas to optimized JS for ~14M ops/sec. Used inside `validate-workspace.js`. |
| `ajv-formats` | `^3.0.1` | Format validators (`date-time`, `uri`, `email`, etc.) for AJV | Required because draft 2020-12 made formats non-asserting by default. PRD schemas use ISO-8601 timestamps and slug formats. |
| Native `fetch` | Node-built-in | GitHub Releases API check (`/repos/{owner}/{repo}/releases/latest`) | Zero dependency. Backed by undici. Stable since Node 21, widely available in 20+. We need exactly one GET with a 5s timeout — `AbortController` + `fetch` is ~10 lines. |
| `semver` | `^7.6.3` | Compare `package.json` version to GitHub release tag for self-update | npm's official semver parser; the canonical implementation. Tiny, zero-dep. Used for `compare`, `gt`, `satisfies` (for `pinnedVersion` ranges). |
| `node:fs/promises` | Node-built-in | All filesystem ops in init/install/update/uninstall/scripts | Node 20+ has all the recursive ops we need: `cp(src, dst, {recursive:true, errorOnExist, force})`, `rm(path, {recursive:true, force})`, `mkdir(path, {recursive:true})`, `readdir({withFileTypes:true})`. Eliminates `fs-extra` entirely. |
| `node:path`, `node:url`, `node:os` | Node-built-in | Path resolution, `import.meta.url` → `__dirname` shim, OS detection | ESM equivalents: `path.dirname(fileURLToPath(import.meta.url))`. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `picocolors` | `^1.0.0` | Terminal coloring for CLI output | 14× smaller than `chalk`, zero deps, supports `NO_COLOR`. Use for status messages in init/validate/update output. **Optional** — only add if we want colored output. |
| `prompts` | `^2.4.2` | Interactive Y/N prompts for `update.js` ("update available — apply? Y/n") | Tiny (<10kb), zero-runtime-deps, supports non-TTY fallback. Better than `inquirer` (huge) or `@clack/prompts` (newer/larger). Only needed if we keep the "user-prompts-before-update" rule from BOOT decision (we do — INSTALL/UPDATE table). |
| `node:test` + `node:assert/strict` | Node-built-in | Suite's own unit/integration tests | For testing schema-validator, init script idempotency, update detection logic. Zero deps; runs with `node --test test/**/*.test.js`. Has `mock`, `before`/`after`, parallel by default in Node 22. |
| **NOT** `chalk` | — | — | Replaced by `picocolors` (smaller, faster, ESM-clean). |
| **NOT** `fs-extra` | — | — | Replaced by `node:fs/promises` recursive ops. fs-extra still ships CJS-first and adds 11 transitive deps for capabilities Node now has natively. |
| **NOT** `update-notifier` | — | — | Drags in 65 transitive deps. We hand-roll a 30-line check against GitHub Releases API per PRD UPDATE-01. |
| **NOT** `node-fetch` | — | — | Native `fetch` superseded it in Node 18+. |
| **NOT** `dotenv` | — | — | The suite reads no env config of its own; consumer apps may use whatever they want. |
| **NOT** `glob` | — | — | Use `fs.readdir({withFileTypes, recursive})` (Node 20+) for the rare cases we need globbing. Most enumeration is template-directory-driven. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `@biomejs/biome` `^2.3.0` | Lint + format (replaces ESLint + Prettier) | Single config `biome.json`. Run `biome check --write .` in pre-commit. Adopted at AWS/Google/Microsoft/Cloudflare in 2026; mature for plain-JS + JSON projects. 10–20× faster than ESLint chain. |
| `shellcheck` (system tool) | Lint `install.sh` | Run via CI. Use `# shellcheck shell=sh` directive. Configure `.shellcheckrc` with `enable=all`. |
| `pnpm` `^10.0.0` | Package manager for the suite repo | Disk-efficient, correct strict-resolution, monorepo-friendly. Lockfile committed. **Internal only** — npm publish target is a normal package consumable by any PM. |
| `npm publish` | Distribution channel #1 | Publish to public npm as `testatlas`. Provenance enabled (`npm publish --provenance` from GitHub Actions). |
| GitHub Releases | Distribution channel #2 + update source | Tag releases as `v1.2.3`. Attach `.tar.gz` of suite. Use as authoritative source for `update.js` check. |
| `simple-git-hooks` `^2.11.x` | Pre-commit hook runner | Tiny (~50 LOC), zero-dep alternative to `husky`. Hooks: biome check, shellcheck. |
| GitHub Actions | CI: lint, test, schema-validate, validate-workspace against examples | Matrix: Node 20, 22, latest LTS on Linux + macOS + Windows. |
| `changesets` (`@changesets/cli`) `^2.27.x` | Release management | Standard 2026 tool for versioning + CHANGELOG. Generates GitHub Releases with notes. Alternative: `release-please`. |
## Installation
### Suite repo dev setup
# Clone and install
# Dev deps that get installed:
#   @biomejs/biome
#   simple-git-hooks
#   @changesets/cli
#   (and the runtime deps below as regular deps)
### Runtime deps (suite's own `dependencies`)
# Optional for nicer UX:
### Dev deps
### `package.json` skeleton
### Consumer install paths (per PRD INSTALL-01/02/03)
# Path 1: npx (modern Node devs)
# Path 2: curl pipe (shell-first / Node-light environments)
# Path 3: git clone (offline / airgap / security-conscious)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Plain JS (ESM) | TypeScript with build step | If we ever publish a typed programmatic API for downstream JS tooling. Defer — agent-facing markdown is the API. |
| Plain JS (ESM) | TypeScript with native Node strip-types | When Node 22 is the floor (post-April-2027) and `--experimental-strip-types` is fully stable. Revisit at v2. |
| `commander@13` | `cac` | When you want zero-dep + cleaner ergonomics for tiny CLIs. We chose commander for ecosystem familiarity (every Node dev has used it). |
| `commander@13` | Hand-rolled `process.argv` parsing | For 1–2 scripts, fine. We have ~15 entry points → consistency wins. |
| `commander@13` | `yargs` | When you need rich middleware/coercion. Heavier; we don't need it. |
| `commander@13` | `oclif` | For multi-command CLI distributions with plugins. Massive overkill — TestAtlas's "commands" are agent-facing markdown, not Oclif commands. |
| `ajv` | `zod` / `valibot` / `arktype` | If schemas were authored as TypeScript types. PRD mandates JSON Schema files (the actual draft 2020-12 spec) — AJV is the only mainstream choice. |
| `ajv` | `@hyperjump/json-schema` | More spec-compliant for esoteric JSON Schema features. AJV is faster and 10× more widely used. |
| Native `fetch` | `undici` directly | If we needed HTTP/2, connection pooling, or low-level streaming. We make 1 GET per check — overkill. |
| Native `fetch` | `got` / `axios` | Both are deprecated for greenfield in 2026. Native fetch wins on weight + zero-dep. |
| Hand-rolled update check | `update-notifier` | If you tolerate 65 transitive deps. We don't — `update-notifier` is a textbook "should be a function, not a package" case. |
| Hand-rolled update check | `latest-version` | Fine if checking npm registry. We're checking GitHub Releases per PRD — direct API call. |
| `node:fs/promises` | `fs-extra` | If we need extra utilities like `outputJson`, `readJson` with auto-mkdir. We can write ~20 lines of helpers in `lib/fs-helpers.js`. |
| `node:test` | `vitest` | When you need watch-mode UI, snapshot testing, or jsdom. None of these apply to a Node CLI. |
| `node:test` | `jest` | Legacy. Vitest replaced it for new projects. |
| Biome | ESLint + Prettier | When you depend on niche ESLint plugins (e.g., `eslint-plugin-import` rules Biome doesn't yet have). Biome 2.x covers ~95% of common rules; the rest can run as a complementary `eslint` step if needed. |
| `pnpm` | `npm` | When the project must be cloneable + installable with zero extra tools. `npm` works fine here too — pnpm is preference, not requirement. |
| `pnpm` | `bun` | If we wanted Bun runtime. Stays as Node-only target per PRD; using Bun as just-a-PM is uncommon. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| TypeScript with `tsc` build step | Adds compile step; PRD §22 says scripts run with `node` directly. Shipped JS becomes harder for adapter authors to read/modify. | Plain JS ESM. Add JSDoc `@type` annotations for editor IntelliSense if desired. |
| CommonJS (`require`) | Dead for greenfield 2026 packages. ESM is universal in Node 20+. | `"type": "module"` + `import`/`export`. |
| Babel | No transpilation needed at all. | Native Node 20+ syntax. |
| Webpack/Rollup/esbuild for the suite | The suite ships as raw `.js` files copied/installed into target repos. Bundling defeats inspectability. | No build step. |
| `chalk` | 14× larger than picocolors, ESM/CJS dual-package hazard, more deps. | `picocolors`. |
| `fs-extra` | Bloats install for capabilities Node now has natively (since 16/20). | `node:fs/promises` (`cp`, `rm`, `mkdir({recursive})`). |
| `update-notifier` | 65 transitive deps for a 30-line check. | Inline `fetch` to GitHub Releases API + `semver.gt`. |
| `node-fetch` / `cross-fetch` / `isomorphic-fetch` | Obsolete. | Native `fetch` (Node 18+). |
| `axios` / `got` / `request` | Heavyweight; not needed for one GitHub API call. | Native `fetch`. |
| `inquirer` | Massive (15+ deps including `chalk@5`, `cli-cursor`, etc.). | `prompts` (single-file, zero deps). |
| `commander` v6–v11 | Older versions had CJS-only or weaker TS types. | `commander@^13`. |
| `ajv@6` | Old draft support; incompatible API; deprecated. | `ajv@^8`. |
| ESLint + Prettier (for new setup) | 2× the config files, 10–20× slower, dependency churn. | Biome 2.x. Migrate-out option still exists if Biome falls short. |
| `husky` | Larger and adds shell-script complexity for what's a 50-line job. | `simple-git-hooks` (preferred) or native `core.hooksPath`. |
| `npm publish` without provenance | 2026 best practice is signed npm provenance via OIDC from GitHub Actions. | `npm publish --provenance --access public` from a release workflow. |
| Bash-only installer | Excludes Alpine/BusyBox `sh`, dash, ash. Some minimal containers don't have bash. | POSIX `/bin/sh` with `#!/bin/sh`, no bashisms (`[[ ]]`, arrays, `function` keyword), shellcheck `shell=sh`. |
| Direct `curl \| sh` without temp-file shield | Partial-pipe risk: interrupted curl can deliver a half-script that does damage. | Inside `install.sh`, the canonical pattern: `tmp=$(mktemp); curl -fsSL "$URL" -o "$tmp" && sh "$tmp"`. The OUTER `curl ... \| sh` line we instruct users to run is still standard, but our installer script's first action should be sanity-check (`set -eu`, sentinel comment at end of script, optional `exit` at top of `main()` invocation). |
| `pinnedVersion` config without lock semantics | Users will pin and never update; we need clear semver-range semantics. | `semver.satisfies(latestRelease, pinnedRange)` with a documented behavior matrix. |
## Stack Patterns by Variant
- Use full native stack (fetch, fs/promises recursive, node:test for our tests).
- `npx @webventures/testatlas init` works.
- Direct `node install.js` works.
- `install.sh` flow handles bootstrap.
- Detection logic in `install.sh`:
- `git clone` + `node install.js <target-repo>`.
- No registry calls. No update checks unless `--check-updates` explicitly passed.
- Honor `noUpdateCheck: true` in config.
- Self-update check is suppressed unless newer version satisfies the pin range.
- Use `semver.maxSatisfying(allReleases, pinRange)`.
- Strict: pnpm + Biome + node:test + Node 22.
- Loose: any contributor Node ≥ 20 should be able to run `npm install && npm test`.
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `node@>=20.11.0` | All listed deps | 20.11 introduced stable `import.meta.dirname` and `import.meta.filename`. Use these instead of `fileURLToPath` boilerplate. |
| `commander@^13` | Node ≥ 18 | ESM-native. `program.parseAsync()` for async actions. |
| `ajv@^8.17` + `ajv-formats@^3` | Each other | `ajv-formats@3` matches `ajv@8`. Old `ajv-formats@2` was for `ajv@6/7`. |
| `semver@^7` | Node ≥ 10 | Stable for years. No breaking changes expected. |
| `@biomejs/biome@^2` | Node ≥ 14 | Config schema changed between v1 → v2; greenfield = use v2 config from start. |
| `node:test` runner | Node ≥ 18 (stable in 20+) | In Node 22 it parallelizes by default. Add `--test-concurrency=1` if isolation needed. |
| `@changesets/cli@^2.27` | Node ≥ 18 | Standard 2026 release tool. Works with pnpm/npm/yarn. |
| `pnpm@^10` | Node ≥ 18 | Lockfile v9 (`pnpm-lock.yaml`). Commit it. |
## Critical Implementation Patterns (for downstream phases)
### Pattern: GitHub Releases self-update check (replaces `update-notifier`)
### Pattern: ESM-safe `__dirname` for script-relative paths
### Pattern: Atomic update (per UPDATE-02)
### Pattern: POSIX-safe install.sh skeleton
#!/bin/sh
# install.sh — POSIX, shellcheck shell=sh clean
# ... etc, all functions below main(), then:
# Trailing 'main "$@"' as last line: protects against partial-pipe execution
# (curl interrupted before EOF will not reach this line; sh will error).
### Pattern: AJV setup for the 19 schemas (validate-workspace.js)
## License & Repo Conventions (2026 OSS standard)
| File | Purpose | Notes |
|------|---------|-------|
| `LICENSE` | MIT | Per PRD constraint. Use https://opensource.org/license/mit canonical text with year + holder. |
| `README.md` | Quickstart, install paths, command index | First file. Include badges: npm version, license, CI status. |
| `CHANGELOG.md` | Keep-a-Changelog format | Generated by `@changesets/cli`. |
| `CONTRIBUTING.md` | How to file issues, run tests | Standard. |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 | Standard. |
| `SECURITY.md` | Vuln reporting (GitHub Security Advisories) | Standard 2026 expectation. |
| `.github/ISSUE_TEMPLATE/` | bug/feature/question | Markdown forms (not legacy YAML). |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist | Standard. |
| `.github/workflows/ci.yml` | Lint + test + schema-validate matrix | Matrix Node `[20, 22]`, OS `[ubuntu, macos, windows]`. |
| `.github/workflows/release.yml` | Tag → build → npm publish + GitHub Release | Uses `changesets/action`. Provenance enabled. |
| `.editorconfig` | Common whitespace rules | Standard. |
| `.gitignore` | `node_modules`, `.testatlas/.update-cache.json`, `.testatlas.bak.*`, `coverage/`, `.DS_Store` | Standard. |
| `biome.json` | Lint+format config | Single config replaces `.eslintrc` + `.prettierrc`. |
| `.shellcheckrc` | `enable=all` | For `install.sh`. |
## Confidence Levels per Decision
| Decision | Confidence | Basis |
|----------|------------|-------|
| Plain JS over TypeScript (this repo) | HIGH | PRD §22 explicit `node script.js` invocation; matches OSS-CLI convention (npm itself, eslint, prettier are all plain JS or have plain-JS dist). |
| Node 20 floor / target 22 LTS | HIGH | Official Node.js release schedule (verified). Node 20 maintenance ends 2026-04-30; Node 22 LTS through 2027-04. |
| `commander@13` | HIGH | npm trends data + 2026 reporting consensus + active maintenance. |
| `ajv@8` for JSON Schema | HIGH | The reference implementation; PRD requires real JSON Schema docs, not Zod-style schemas. No serious alternative for schema-driven validation in JS. |
| Native `fetch` over libs | HIGH | Stable in Node 21, widely available 18+, sufficient for one GET. |
| `node:test` over Vitest | MEDIUM-HIGH | Sufficient for this scope. Trade-off is DX (no watch UI) — acceptable for a library repo. Could go either way; recommend node:test to keep zero-dep test stack. |
| Biome over ESLint+Prettier | MEDIUM-HIGH | Adoption is real and accelerating in 2026. Ecosystem-niche ESLint plugins (e.g., specific React rules) aren't relevant for a plain-JS Node project. Risk: a niche rule we want isn't yet in Biome — small project, small risk. |
| pnpm for suite dev | MEDIUM | Preference, not requirement. npm or yarn would also work. Choose pnpm for strictness + monorepo headroom (examples/ may become a workspace). |
| Skip `update-notifier`, hand-roll | HIGH | Documented anti-pattern; PRD UPDATE-01/02 specify GitHub Releases (not npm registry) as the source-of-truth, which `update-notifier` doesn't natively target anyway. |
| Skip `fs-extra` | HIGH | Native fs/promises in Node 20+ has all needed primitives (`cp`, `rm`, `mkdir({recursive})`). Verified against current Node 22 docs. |
| ESM-only | HIGH | 2026 ecosystem consensus for greenfield. Dual-package CJS/ESM is a known footgun. |
| POSIX `sh` (not bash) | HIGH | Maximizes reach to Alpine/BusyBox/dash environments. shellcheck enforces. |
| `simple-git-hooks` over `husky` | MEDIUM | Preference for tiny dependency. Husky also fine. |
| `@changesets/cli` for releases | MEDIUM-HIGH | 2026 standard for monorepo + multi-package versioning. Alternatives: `release-please`, `semantic-release` — all viable. |
## Sources
### Library / version verification
- [npm trends: cac vs commander vs minimist vs sade vs yargs](https://npmtrends.com/cac-vs-commander-vs-minimist-vs-sade-vs-yargs) — confirms commander dominance (217M weekly DL)
- [commander on npm](https://www.npmjs.com/package/commander) — current major version 13
- [AJV docs / npm](https://ajv.js.org/) — confirms AJV 8 + ajv-formats 3 as the JSON Schema reference impl
- [npm/node-semver GitHub](https://github.com/npm/node-semver) — official semver lib
- [nodejs/undici](https://github.com/nodejs/undici) — confirms native fetch is undici-backed
- [Node.js previous releases](https://nodejs.org/en/about/previous-releases) — LTS schedule (Node 20 EOL 2026-04, Node 22 active LTS through 2027-04)
### 2026 ecosystem consensus
- [Building CLI apps with TypeScript in 2026](https://hackers.pub/@hongminhee/2026/typescript-cli-2026) — confirms commander still standard, v13 has TS types
- [Complete Guide to Building Developer CLI Tools in 2026](https://dev.to/chengyixu/the-complete-guide-to-building-developer-cli-tools-in-2026-a96)
- [Biome v2.4 February 2026 status](https://trybuildpilot.com/433-biome-review-2026) — production at AWS/Google/MS/Cloudflare
- [Biome migration guide](https://biomejs.dev/guides/migrate-eslint-prettier/)
- [pnpm vs npm vs Bun 2026 showdown](https://www.pkgpulse.com/blog/pnpm-vs-bun-vs-npm-2026)
- [node:test vs Vitest vs Jest 2026](https://www.pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026) — confirms node:test sufficient for libraries
- [Native TypeScript with Node](https://nodesource.com/blog/Node.js-Supports-TypeScript-Natively) — Node 22.18 strip-types still flagged; stable in 24
### Native-fs / native-fetch viability
- [LogRocket: Fetch API stable in Node](https://blog.logrocket.com/fetch-api-node-js/)
- [fs vs fs-extra comparison 2026](https://npm-compare.com/fs,fs-extra,fs-extra-promise) — confirms fs/promises sufficient for basic recursive ops in Node 20+
- [Node.js learn: Using Fetch with Undici](https://nodejs.org/learn/getting-started/fetch)
### Installer-script practices
- [ShellCheck 2026 guide](https://www.turbogeek.co.uk/how-to-install-and-use-shellcheck-for-safer-bash-scripts-in-2026/) — set -eu, quoted vars, POSIX patterns
- [Lobsters: What's the problem with curl|sh](https://lobste.rs/s/ymcbwl/what_s_problem_with_pipe_curl_into_sh) — partial-pipe risk + mitigations
- [nvm install.sh](https://github.com/nvm-sh/nvm) — canonical reference for a robust curl-pipe installer
### Update-notification patterns
- [simple-update-notifier vs update-notifier](https://github.com/alexbrazier/simple-update-notifier) — documents the 65-transitive-deps issue
- [check-update-github npm](https://www.npmjs.com/package/check-update-github) — pattern for GitHub-Releases-based checks
- [GitHub REST API: Get latest release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) — endpoint we'll call
### License / repo conventions
- [Choose a License: MIT](https://choosealicense.com/licenses/mit/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements)
<!-- OBD:stack-end -->

<!-- OBD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Self-dogfood: scripts run from `scripts/` locally, but commands now reference `.testatlas/scripts/`

In the TestAtlas suite source repo, the canonical accelerator scripts live at `./scripts/<name>.js`. In *installed* target repos, `install.js` copies them into `<target>/.testatlas/scripts/`.

**As of Phase 17 (2026-05-07)**, all source command bodies (`/atlas:*` commands under `.testatlas/commands/**/*.md`) reference scripts as `node .testatlas/scripts/<name>.js` — the universal installed-target form. This is the only form that works correctly in adapter-rendered output across all 18 adapters.

**Local dev mental swap:** when an `/atlas:*` command body says `node .testatlas/scripts/create-issue.js`, run it as `node scripts/create-issue.js` in this repo. The `.testatlas/scripts/` path doesn't exist locally — that's the installed-target form. The source-of-truth is `./scripts/`.

**Invariant:** `scripts/validate-workspace.js` enforces this — any source command body containing `node scripts/` (without the `.testatlas/` prefix) is a hard error (PHASE17-INV-B `script-path-leaks-suite-form`). Use only `node .testatlas/scripts/<name>.js` in source.

**Concrete impact:** when an `/atlas:*` command's "Preferred path" instruction reads `node .testatlas/scripts/create-issue.js …`, in this repo run it as `node scripts/create-issue.js …` instead. Same for `create-evidence-record.js`, `create-domain.js`, `create-flow.js`, `update-indexes.js`, `validate-workspace.js`, etc.

This is the source-repo's normal layout — not a framework bug. Do NOT file it as an issue.
<!-- OBD:conventions-end -->

<!-- OBD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- OBD:architecture-end -->

<!-- OBD:workflow-start source:OBD defaults -->
## OBD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through an OBD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/obd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/obd:debug` for investigation and bug fixing
- `/obd:execute-phase` for planned phase work

Do not make direct repo edits outside an OBD workflow unless the user explicitly asks to bypass it.
<!-- OBD:workflow-end -->



<!-- OBD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/obd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- OBD:profile-end -->

## Human Instructions

- Dont use worktrees, always make commits etc are in the main tree.
- Other agents may be working on the codebase at the same time, dont overwrite, or stash changes as this may break other agents. 
- Keep the changelog up to date / properly constructed whenever making changes. 
- IMPORTANT: When using slash commands like /obd:* or /atlas-* commands always follow the instructions verbatim. Do not hallucinate. If you dont understand something ask the human. If it is in the instructions - you follow it - including making sure add-phase, plan-phase, execute-phase and validations and verifictions are followed exactly. Always follow the humans instructions to the letter.  
