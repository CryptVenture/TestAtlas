# 01 System Map

> Updated automatically by every TestAtlas command. Human notes outside the generated blocks are preserved across runs.

This document captures the structural shape of the codebase: what apps and packages exist, what languages and runtimes are involved, which surfaces (UI, API, CLI, jobs) exist, what data stores back them, what integrations they speak to, and how it all gets deployed. The companion `12_app_map.json` is the machine-readable form; this file is the prose narrative.

## Repository Structure

(Describe the top-level layout: monorepo workspaces, app directories, infra directories, docs, tooling.)

## Apps and Packages and Services

(Enumerate every deployable unit and shared package. Link each to its directory.)

## Languages and Runtimes

(List the languages and runtime versions used: Node 20, Python 3.12, etc.)

## Surfaces

(List the user-facing surfaces: web UI, mobile, CLI. Link each to its routes/pages.)

## APIs

(List API surfaces: REST, GraphQL, gRPC. Link to per-endpoint records under `api/`.)

## CLIs

(List command-line interfaces. Link to per-command records under `cli/`.)

## Jobs

(List scheduled/background jobs. Link to per-job records under `jobs/`.)

## Data Stores

(List databases, caches, object stores, queues. Note their purpose and ownership.)

## Integrations

(List third-party services the system depends on. Note direction and auth model.)

## Deployment

(Describe how the system is deployed: container orchestrator, serverless, VMs, CI/CD pipeline.)

## Environment Boundaries

(Describe the boundaries between local, staging, and production. Note what is safe to test against.)

## Ownership

(Who owns which surfaces? Link to team or individual contacts when known.)

## Evidence and Source References

<!-- TESTATLAS:GENERATED:START section="source-references" -->
(no source references collected yet)
<!-- TESTATLAS:GENERATED:END section="source-references" -->
