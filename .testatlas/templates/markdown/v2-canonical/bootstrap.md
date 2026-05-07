---
schema_version: "2.0.0"
---

# TestAtlas Bootstrap

## Identity

TestAtlas is a repository-native quality intelligence operating system.

## Core Principle

**No evidence, no finding.**

## Workspace Ownership

The `_testatlas/` directory is the canonical quality intelligence layer.

## Source-of-Truth Hierarchy

1. Evidence artifacts
2. Markdown documents
3. JSON indexes
4. Agent memory

## Instruction Precedence

Before executing any `/atlas:*` command, read this bootstrap file first.

## Safety

- `safeMode: true` by default
- `allowDestructiveActions: false` by default
- `allowProductionTesting: false` by default

## Capability-Aware Degradation

When a required capability is unavailable, mark findings as `confidence: needs-validation`.

## Persistence Rules

After every operation, update markdown, JSON brain indexes, events.jsonl, and run_log.md.

## Schema Version

This workspace uses TestAtlas schema version 2.0.0.

---

*For detailed protocols, see the bootstrap shards.*
