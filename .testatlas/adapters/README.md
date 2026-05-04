# TestAtlas Adapters

TestAtlas is agent-agnostic. Each adapter renders the canonical
`.testatlas/commands/*.md` source for one target agent platform. The renderers
live in `scripts/lib/adapters/`; the per-adapter trees in this directory are
the *output* of that pipeline.

## Adapters

| Adapter | Capabilities | Render strategy | Output pattern | Per-adapter docs |
| --- | --- | --- | --- | --- |
| **Claude Code (canonical)** (`claude-code`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.claude/commands/atlas-{command}.md` | [`claude-code/README.md`](./claude-code/README.md) |
| **Generic Prompts** (`generic`) | browser, shell, web-fetch, MCP, file-write (paste-time-decided) | `per-command-file` | `prompts/atlas-{command}.md` | [`generic/README.md`](./generic/README.md) |
| **OpenCode** (`opencode`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.opencode/commands/atlas-{command}.md` | [`opencode/README.md`](./opencode/README.md) |
| **KiloCode** (`kilocode`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.kilo/agents/atlas-{command}.md` | [`kilocode/README.md`](./kilocode/README.md) |
| **Cursor** (`cursor`) | shell, web-fetch, file-write | `per-command-file` | `.cursor/rules/atlas-{command}.mdc` | [`cursor/README.md`](./cursor/README.md) |
| **Aider** (`aider`) | shell, file-write | `concatenated-conventions` | `CONVENTIONS.md` | [`aider/README.md`](./aider/README.md) |
| **MCP** (`mcp`) | shell, web-fetch, file-write | `mcp-server` | `mcp-server-manifest.json` (runnable JSON-RPC server) | [`mcp/README.md`](./mcp/README.md) |

The canonical capability declarations live in
[`adapter-capabilities.json`](./adapter-capabilities.json) and are validated by
`schemas/adapter-capabilities.schema.json` on every CI run.

## Generation

All non-canonical adapters are derived. Regenerate from the suite root:

```sh
node scripts/assemble-adapter.js                 # all adapters
node scripts/assemble-adapter.js --adapter mcp   # single adapter
```

The renderer enforces deterministic output (sorted keys, normalized line
endings) and stamps each derived file with a `TESTATLAS:GENERATED` marker
envelope whose hash binds the file to the source command spec it was rendered
from.

## Parity gate

The strict-mode parity check enumerates every command × adapter obligation
(30 × 7 = 210) and asserts coverage is 1.0 with zero drift entries:

```sh
node scripts/check-adapter-parity.js --strict
```

Drift kinds detected: `missing`, `no-marker`, `hash-mismatch`, `hand-edit`.
This gate runs in CI on every PR (`.github/workflows/ci.yml`) and via the
suite test runner (`test/adapter-parity-stub.test.js`).

## Two-tree invariant

Adapters live in the **suite tree** (`.testatlas/adapters/`), never in the
**workspace tree** (`_testatlas/`). The Phase 7 installer copies adapter trees
out to the target repo's user-facing locations (e.g. `claude-code/.claude/` →
the consumer's `.claude/` directory). Hand-edits to derived adapter files are
rejected by the parity gate; edits belong on the canonical command spec under
`.testatlas/commands/` instead.
