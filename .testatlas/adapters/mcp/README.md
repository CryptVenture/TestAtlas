# MCP Adapter

TestAtlas commands exposed as MCP prompts via a runnable JSON-RPC stdio server.

## Install

This adapter ships **two** artifacts:

1. **`mcp-server-manifest.json`** — declarative list of all 30 prompts (the contract). MCP clients that pre-fetch capabilities can read this directly.
2. **`scripts/mcp-server.js`** (committed at the repo root, not under `.testatlas/adapters/mcp/`) — the runnable server that speaks JSON-RPC over stdio per MCP spec 2025-11-25.

Register the server with your MCP client. Example for Claude Desktop's `mcp_config.json` (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%/Claude/claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "testatlas": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/scripts/mcp-server.js"],
      "env": {
        "TESTATLAS_WORKSPACE": "/absolute/path/to/your/project"
      }
    }
  }
}
```

For Cursor MCP and VS Code MCP, the registration shape is similar — see those clients' MCP integration docs. The only TestAtlas-specific requirements are:

- `command: "node"` (or any Node 20+ runtime)
- `args` pointing at `scripts/mcp-server.js`
- optional `env.TESTATLAS_WORKSPACE` overriding the workspace root (the server walks up from the script's directory if unset)

## Capabilities

This adapter declares `[shell, web-fetch, file-write]`. A note on terminology: TestAtlas's `MCP` capability refers to runtime affordances (e.g. Chrome DevTools MCP browser control); the **MCP transport** is what THIS adapter provides. The server itself doesn't drive a browser — it exposes TestAtlas's command surface to any MCP-aware client, which then carries out the work using whatever runtime it has.

## Why prompts/, not tools/

Per MCP spec 2025-11-25, `prompts/` are user-controlled — the spec literally says **"for example, slash commands"**. `tools/` are LLM-autonomous: the model decides when to invoke them. TestAtlas commands are user-driven workflows (`/atlas-init`, `/atlas-explore-ui`, etc.), so `prompts/` is the correct primitive. Using `tools/` would invite the model to call `atlas-init` autonomously, which would defeat the entire user-in-the-loop design of TestAtlas.

## Methods supported

- `initialize` → `{ protocolVersion, capabilities: { prompts: { listChanged: false } }, serverInfo: { name: "testatlas", version: "1.0.0" } }`
- `prompts/list` → 30 prompts, one per `.testatlas/commands/<name>.md` file
- `prompts/get { name: "atlas-<command>" }` → returns the source body prefixed with the verbatim BOOTSTRAP_PREAMBLE so the receiving model is told to read `.testatlas/bootstrap.md` first

All other JSON-RPC methods respond with error code `-32601` ("Method not found").

## Transport

stdio only in v1. Each message is a single newline-terminated JSON-RPC 2.0 line on stdin (request) or stdout (response). HTTP/SSE transport is deferred to a future plan once stdio adoption is proven.

## NO PER-COMMAND FILES

This adapter does **not** emit per-command derived files. The runnable server reads `.testatlas/commands/*.md` directly at request time:

- Adding a 31st command to `.testatlas/commands/` makes it instantly discoverable by the server (next `prompts/list` returns 31 entries) — no regeneration step.
- The manifest is the only declarative artifact and exists primarily for clients that want to discover the contract without spawning the server.

The trade-off is that the manifest must be regenerated whenever sources change (so `prompts/list` from a manifest matches `prompts/list` from a live server). The parity gate detects manifest drift on next `node scripts/check-adapter-parity.js`.

## Regeneration

`mcp-server-manifest.json` is **GENERATED** by `node scripts/assemble-adapter.js mcp`. Do not hand-edit it. To customize, edit the source command at `.testatlas/commands/<name>.md` and regenerate.

`scripts/mcp-server.js` is **NOT generated** — it's a hand-authored runtime, version-controlled like any other source file. Modify it the way you'd modify any other Node script in the repo.
