# TestAtlas CLI commands Map

Human-readable view of `_testatlas/maps/cli_commands.json`. Catalogs every CLI binary / sub-command. Per PRD §7.13.

> **Updated by:** `/atlas:explore-cli`. **Source:** `cli_commands.json`.

## Field reference

| Field | Description |
| --- | --- |
| `command` | Full command including subcommand path (e.g. `example-cli init`). |
| `flags` | Array of `{name, type, required, description}`. |
| `help_text` | The `--help` body verbatim. |
| `config_files` | Files the command consumes for config. |
| `env_vars` | Array of `{name, required, secret}`. |
| `output_formats` | Output formats supported (text/json/yaml/etc.). |
| `exit_codes` | Array of `{code, meaning}`. |
| `test_coverage` | Test IDs + percent. |
| `evidence` | On-disk evidence paths. |

<!-- TESTATLAS:GENERATED:START section="cli_commands" -->
_Generated from `cli_commands.json`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="cli_commands" -->
