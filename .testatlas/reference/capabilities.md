# Capability Vocabulary

> **When to read this:** You are about to take an action that requires a capability and need to confirm the capability is available, or you are writing a command file and need to declare its required capabilities.

TestAtlas adapters declare per-adapter capabilities (Phase 6 ships `adapter-capabilities.json`). Until that file is shipped, treat the conservative default as: only the capabilities you have already successfully used in this session are available. Do not assume — confirm.

## The five capabilities

### browser

The agent can drive a browser (Chrome DevTools MCP, Playwright wrapper, or equivalent) to navigate, click, type, screenshot, capture network and console.

**Used by:** UI Explorer, accessibility checks, performance checks, end-to-end flow tests.

### shell

The agent can execute shell commands (Bash, sh, or platform equivalent) and capture exit codes, stdout, stderr.

**Used by:** CLI Explorer, runtime checks, package-script invocation, build-tool exercises.

### web-fetch

The agent can issue outbound HTTP(S) requests to public endpoints. Distinct from `browser` — `web-fetch` is request/response only and does not include navigation, JavaScript execution, or DOM access.

**Used by:** API Explorer for documented endpoints, update-check (Phase 7), schema fetches.

### MCP

The agent can communicate with Model Context Protocol servers (Chrome DevTools, custom MCP servers, third-party tool servers).

**Used by:** UI Explorer (preferred path when available), specialized integrations, structured tool surfaces.

### file-write

The agent can write files inside the workspace (`_testatlas/`) and the suite (`.testatlas/`) when explicitly authorized by the safety rules in bootstrap §4.

**Used by:** every persistence step; without this, no findings can be recorded and no test runs can be journaled.

## Capability-aware degradation rule (mirrored from bootstrap §4)

Before any action requiring a capability, confirm it is available. If unavailable:

1. MUST NOT fabricate output as if the action succeeded.
2. MUST mark any resulting finding `confidence: needs-validation`.
3. MUST add a `tool_unavailable: <capability>` field to the artifact (issue, evidence, finding).
4. SHOULD propose an alternative path that does not require the missing capability (e.g., code-reading instead of browser).

The `tool_unavailable` field is part of every finding-bearing schema in Phase 2. It is the structural evidence that an agent honored the degradation rule rather than silently fabricating.

## Per-capability action matrix

| Capability   | Confirms via                              | Fallback when unavailable                          |
|--------------|-------------------------------------------|----------------------------------------------------|
| `browser`    | Successful navigation + screenshot capture | Code-read the route handler / static template      |
| `shell`      | Successful `node --version` (or equivalent) | Read package scripts and document expected behavior |
| `web-fetch`  | Successful GET to a known-public endpoint  | Document expected request/response from API docs   |
| `MCP`        | Successful tool list from the MCP server   | Fall back to `browser` or `shell` capability       |
| `file-write` | Successful write + read-back to a temp file | HALT; without `file-write` no findings persist     |

## Schema reference

The five values are enumerated in every adapter capability declaration. Do not introduce new capability values without a PRD revision.
