---
id: FLOW-items-api-create-item
slug: {{slug}}
name: Create Item
domain: domain-items-api
persona: api-client
priority: medium
status: mapped
confidence: low
lastUpdatedAt: 2026-05-03T00:00:00.000Z
---

# Flow: Create Item

> One markdown document per user-perspective flow. PRD §16. A flow is a goal-shaped sequence of steps a persona takes to achieve a user-visible outcome.

## Goal

(What does the persona accomplish? Stated as a verb phrase: "checkout a cart", "reset a password", "invite a teammate".) POST /api/items with a valid body, expect 201 and the normalized item back

## Persona

(Which persona drives this flow? Link to `personas/<slug>.md`.) api-client

## Domain

(Which domain owns this flow? Link to `domains/<slug>/`.) domain-items-api

## Preconditions

(What must be true before the flow can start? Authenticated, has data, on the right environment, feature flag on?)

## Entry Points

(Where does the flow start? URL, navigation path, deep link?)

## Expected Behavior (Happy Path)

(Step-by-step happy-path narrative. Each step should be a discrete user action and an observable result.)

## Alternate Paths

(Variants of the happy path: different roles, different input shapes, different feature flags.)

## Edge Cases

(Boundary conditions: empty input, max-length input, slow network, race conditions.)

## Failure Paths

(How the flow fails: invalid input, permission denied, dependency unavailable, data corruption.)

## Data Requirements

(What test data is needed? Seed values, fixtures, fresh accounts.)

## Dependencies

(External systems or other domains the flow depends on.)

## Test Scenarios

(Linked test scenarios under `tests/`. One scenario per testable assertion.)

## Evidence

(Linked evidence records under `evidence/` that support this flow's assertions.)

## Issues

(Linked issues under `to_fix/` that affect this flow.)

## Retest Notes

(When was this flow last retested? What was the outcome? When is the next retest due?)

## Last Updated

<!-- TESTATLAS:GENERATED:START section="last-updated" -->
2026-05-03T00:00:00.000Z
<!-- TESTATLAS:GENERATED:END section="last-updated" -->
