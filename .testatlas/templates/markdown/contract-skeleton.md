---
framework: contract
status: generated-but-not-validated
generated_by: scripts/generate-automation.js
---

# Contract test skeleton

This template is the language-agnostic shape of every consumer-provider
contract test emitted by `scripts/generate-automation.js --contract`. The
script writes a `.contract.json` file under
`_testatlas/tests/generated_automation/contract/`. The shape is compatible
with Pact JSON contracts and similar consumer-driven contract tools.

## Status lifecycle

`generated-but-not-validated` → `validated` → `committed` → `flaky`

Status lives inside `metadata.status` in the contract JSON itself, plus the
companion `<slug>.meta.json`.

## File shape (JSON)

```json
{
  "consumer": { "name": "TODO-consumer" },
  "provider": { "name": "TODO-provider" },
  "interactions": [
    {
      "description": "Generated from FLOW-<id>",
      "providerState": "TODO-state",
      "request": { "method": "GET", "path": "<entry-point>" },
      "response": { "status": 200, "headers": { "Content-Type": "application/json" }, "body": {} }
    }
  ],
  "metadata": {
    "generated_by": "scripts/generate-automation.js",
    "source_flow": "FLOW-<id>",
    "status": "generated-but-not-validated",
    "fixtures": [],
    "mock_data": ["replace with canonical fixture; mock provider state via seeded fixture file"]
  }
}
```

## Required sections

1. `consumer` + `provider` names.
2. At least one `interactions[]` entry sourced from the flow.
3. `metadata` block with status, fixtures, mock data plan.
4. Companion `<slug>.meta.json` mirroring status history.
