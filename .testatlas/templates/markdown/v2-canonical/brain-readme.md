# TestAtlas Brain

The brain is the machine-readable quality intelligence layer.

## File Inventory

### Core State
- `manifest.json` — Project identity
- `state.json` — Current counts, confidence, blockers

### Entity Indexes
- `domains.json`, `flows.json`, `routes.json`, `components.json`

### Registry Indexes
- `personas.json`, `issues.json`, `evidence.json`

### Intelligence Indexes
- `risks.json`, `assumptions.json`, `open_questions.json`, `decisions.json`

### Metrics
- `coverage.json`, `quality_scores.json`, `drift.json`

### Logs
- `claims.jsonl`, `observations.jsonl`, `events.jsonl`

## Sync Contract

Markdown is canonical. JSON is derived. Rebuild via `sync-markdown-json.js`.

## Schema Version

Brain files conform to TestAtlas schema version 2.0.0.
