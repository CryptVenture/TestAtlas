# .testatlas — TestAtlas Suite

This directory is the **TestAtlas suite tree** — the instruction surface every TestAtlas command reads. It is shipped content, not source code; do not edit files here unless you know what you are doing.

## Read bootstrap first

Every TestAtlas command begins by reading [`./bootstrap.md`](./bootstrap.md). It is the constitutional document — identity, safety, persistence, instruction precedence, evidence rules, and capability-aware degradation are all defined there. Read it before issuing any command.

## What lives here

- `bootstrap.md` — constitution; ≤3000 words, CI-enforced.
- `default.config.json` — defaults; deep-merged with `./testatlas.config.json` at the target-repo root.
- `config.schema.json` — Draft 2020-12 schema validating the merged config.
- `VERSION` — plaintext semver of the suite tree.
- `reference/` — long-form rationale read on demand (severity, confidence, capabilities).

## Project

For project-level documentation, contributing, scope, and threat model, see the project repository: <https://github.com/testatlas/testatlas>.
