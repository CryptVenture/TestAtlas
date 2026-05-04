# 07 Environment and Access

> Updated automatically by every TestAtlas command. Human notes outside the generated blocks are preserved across runs.

This document describes how to set up a working test environment. It is the runbook a fresh agent or engineer reads to get from "clone" to "running tests." It also documents the safety boundaries — what is safe to touch, what is not.

## Local Setup

(Step-by-step: clone, install, build, seed, run. Note prerequisites and OS-specific gotchas.)

## Environments

(Describe each environment available for testing: local, staging, ephemeral preview, production-read-only.)

## Ports

(List local ports the application uses: 3000 for web, 5432 for db, 6379 for cache, etc.)

## URLs

(List the URLs for each environment: `http://localhost:3000`, `https://staging.example.com`, etc.)

## Roles and Accounts

(List test user accounts, their roles, and their credentials reference. Never embed credentials directly — use a secret store reference.)

## Environment Variables

(List required and optional environment variables, with examples and notes on where to obtain values.)

## Feature Flags

(List feature flags that affect behavior under test. Note the default state and how to toggle.)

## External Dependencies

(List third-party services the test environment talks to. Note auth, rate limits, sandbox vs production.)

## Seed Data

(Describe how to obtain a clean seeded database. Reference seed scripts, fixtures, or snapshots.)

## Safety Boundaries

(What MUST NOT be touched? Production write-paths, real payment endpoints, real email sends, real SMS sends. Document the destructive-action policy.)

## Caveats

(Known issues with the environment: flakiness, slow seeds, cache-busting needs, manual reset steps.)
