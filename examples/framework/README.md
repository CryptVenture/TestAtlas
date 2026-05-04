# `examples/framework/` — TestAtlas Examples Framework

This directory is **not** an example — it is the framework documentation for
the example regeneration system that ships in `scripts/regenerate-example.js`
and the `_testatlas-fixture/example-script.json` files inside each
`examples/<name>/`.

It is the canonical reference for plans 08-01 through 08-04 and for anyone
adding a new example post-v1.0.0.

## How regeneration works

Each example ships:

- a small source codebase (`server.js`, routes, libraries — varies per
  example),
- a deterministic recipe at `examples/<name>/_testatlas-fixture/example-script.json`
  validated against the 19th JSON Schema
  (`.testatlas/schemas/example-script.schema.json`),
- a checked-in `_testatlas/` workspace populated by replaying the recipe
  against the suite's Phase 5 emitters.

`scripts/regenerate-example.js` is the orchestrator. Internally it:

1. Loads + AJV-validates the fixture's `example-script.json` (refuses to
   replay an invalid script).
2. Wipes `<example>/_testatlas/` (or runs into a tempdir if `--check` was
   passed).
3. Runs `init-workspace.js` against the target.
4. Replays each step in order, dispatching to the matching Phase 5 emitter
   (`create-domain`, `create-flow`, `create-issue`, `create-evidence-record`,
   `update-indexes`, `sync-status`, `summarize-run`, `generate-report`) as a
   child process.
5. Runs `update-indexes` + `sync-status` again to settle derived state.
6. Runs `validate-workspace --auto-heal --apply` once to populate the
   cross-cut indexes (`to_fix/by_*` directories).
7. Runs `update-indexes` + `sync-status` once more.
8. Runs `validate-workspace` (no auto-heal) — **must exit 0**.
9. (`--check` only) Diffs the tempdir against the checked-in
   `<example>/_testatlas/` byte-for-byte and exits non-zero on drift.

## Determinism env contract (FROZEN)

Every child process spawned by the orchestrator runs with these
environment variables. They are the canonical names — used by plans 08-02,
08-03, 08-04, 08-05 too. Do not rename without bumping the schema version:

| Var                          | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `TESTATLAS_DETERMINISTIC=1`  | Switches every Phase 5 emitter into deterministic mode.  |
| `TESTATLAS_FIXED_TIMESTAMP`  | ISO-8601 timestamp; replaces every `new Date()` in artifacts. |
| `TESTATLAS_SUITE_VERSION`    | Optional pin for embedded version markers.               |

`scripts/lib/determinism.js` exports the helpers (`now()`, `uuid(seed)`,
`sortedReaddir()`, `isDeterministic()`) that honor these. The header of
that file is the canonical doc for the contract.

## Two-tree invariant in examples

Examples ship the **workspace tree** (`_testatlas/`) only — they do **not**
ship the **suite tree** (`.testatlas/`). The suite tree lives once in the
TestAtlas repo (or is `npm install`-ed by users into their own repos);
each example regeneration consumes the suite tree from `suiteRoot` rather
than from inside the example.

Concretely, the orchestrator passes `cwd=suiteRoot` to every spawned
emitter so `loadConfig` and `loadAllSchemas` resolve the suite tree
correctly while `--workspace=<absolute>/examples/<name>/_testatlas` directs
the writes into the example.

## Adding a new example

1. Create `examples/<name>/` with the example source code (plain ESM, no
   build step, real working app).
2. Author `examples/<name>/_testatlas-fixture/example-script.json`
   following the 19th schema.
3. Run `node scripts/regenerate-example.js examples/<name>` once locally
   to populate `examples/<name>/_testatlas/`. Commit the result.
4. Add a `test/examples/<name>-regenerate.test.js` that asserts:
   - `regenerate --check` exits 0,
   - `validate-workspace` exits 0,
   - the fixture validates against `example-script.schema.json`.
5. Add the example to `.github/workflows/e2e-smoke.yml`'s matrix
   (this lands as part of plan 08-04).

## What `package.json#files` excludes

The npm tarball **must not** include `examples/`. The `files` whitelist in
the suite repo's `package.json` is positive (`bin/`, `install.js`,
`install.sh`, `scripts/`, `.testatlas/`, `package.json`, `README.md`,
`LICENSE`, `CHANGELOG.md`) and intentionally omits `examples/`.

Verify with:

```sh
npm pack --dry-run | grep -c examples/   # → 0
```

If a future change accidentally adds `examples/` to the tarball, the
suite ships with ~30+ files of unused workspace data per install — a
noticeable regression for npx users.
