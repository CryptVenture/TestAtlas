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
| **KiloCode** (`kilocode`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.kilocode/workflows/atlas-{command}.md` | [`kilocode/README.md`](./kilocode/README.md) |
| **Cursor** (`cursor`) | shell, web-fetch, file-write | `per-command-file` | `.cursor/rules/atlas-{command}.mdc` | [`cursor/README.md`](./cursor/README.md) |
| **Aider** (`aider`) | shell, file-write | `concatenated-conventions` | `CONVENTIONS.md` | [`aider/README.md`](./aider/README.md) |
| **MCP** (`mcp`) | shell, web-fetch, file-write | `mcp-server` | `mcp-server-manifest.json` (runnable JSON-RPC server) | [`mcp/README.md`](./mcp/README.md) |
| **OpenAI Codex CLI** (`codex`) | shell, web-fetch, MCP, file-write | `per-command-file` | `.codex/prompts/atlas-{command}.md` | [`codex/README.md`](./codex/README.md) |
| **Google Gemini CLI** (`gemini-cli`) | shell, web-fetch, MCP, file-write | `per-command-file` (TOML) | `.gemini/commands/atlas-{command}.toml` | [`gemini-cli/README.md`](./gemini-cli/README.md) |
| **Cline** (`cline`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.clinerules/workflows/atlas-{command}.md` | [`cline/README.md`](./cline/README.md) |
| **Windsurf / Cascade** (`windsurf`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.windsurf/workflows/atlas-{command}.md` | [`windsurf/README.md`](./windsurf/README.md) |
| **Kiro** (`kiro`) | shell, web-fetch, MCP, file-write | `per-command-file` | `.kiro/skills/atlas-{command}.md` | [`kiro/README.md`](./kiro/README.md) |
| **Continue.dev** (`continue-dev`) | shell, web-fetch, MCP, file-write | `per-command-file` | `.continue/prompts/atlas-{command}.prompt.md` | [`continue-dev/README.md`](./continue-dev/README.md) |
| **GitHub Copilot** (`github-copilot`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.github/prompts/atlas-{command}.prompt.md` | [`github-copilot/README.md`](./github-copilot/README.md) |
| **Sourcegraph Amp** (`sourcegraph-amp`) | browser, shell, web-fetch, MCP, file-write | `per-command-file` | `.agents/commands/atlas-{command}.md` | [`sourcegraph-amp/README.md`](./sourcegraph-amp/README.md) |
| **Roo Code** (`roo-code`) | browser, shell, web-fetch, MCP, file-write | `concatenated-conventions` | `.roo/rules/atlas.md` | [`roo-code/README.md`](./roo-code/README.md) |
| **Zed** (`zed`) | shell, MCP, file-write | `concatenated-conventions` | `.rules` | [`zed/README.md`](./zed/README.md) |
| **Amazon Q Developer** (`amazon-q`) | shell, MCP, file-write | `concatenated-conventions` | `.amazonq/rules/atlas.md` | [`amazon-q/README.md`](./amazon-q/README.md) |

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
(30 commands × 18 adapters = 540 today; the count grows as new adapters land)
and asserts coverage is 1.0 with zero drift entries:

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
