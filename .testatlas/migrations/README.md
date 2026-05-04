# Workspace Migrations

This directory holds **forward-only, idempotent** migration scripts that bring a `_testatlas/` workspace from one schema version to the next during `testatlas update`.

## File Naming

```
v<N>-to-v<M>.js    where M = N + 1 (always +1 step)
```

Examples: `v1-to-v2.js`, `v2-to-v3.js`, `v3-to-v4.js`.

The runner composes long jumps automatically — to migrate v1 → v5, it runs `v1-to-v2.js`, `v2-to-v3.js`, `v3-to-v4.js`, `v4-to-v5.js` in that order. **Never write multi-step migrations** like `v1-to-v3.js`; the runner sorts by `fromSchema` and would treat such a file as a gap-filler with surprising semantics.

## Required Exports

Every migration module must export the following:

```js
// .testatlas/migrations/vN-to-vM.js
export const fromSchema = N; // number
export const toSchema   = M; // number, always N+1
export const description = 'Human-readable summary';

/**
 * Forward-only migration. Idempotent.
 * @param {string} workspaceDir - absolute path to <target>/_testatlas/
 * @param {{ fromVersion: string, toVersion: string }} ctx
 */
export async function up(workspaceDir, ctx) {
  // Mutate the workspace as needed.
  // DO NOT touch the install manifest's schemaVersion field — the runner
  // bumps it after all migrations succeed.
}
```

## Idempotency Contract

`up()` MUST be safe to call N times in a row. Always guard with existence/state checks:

```js
// Good
if (await exists(oldPath) && !(await exists(newPath))) {
  await rename(oldPath, newPath);
}
```

```js
// Bad — second invocation explodes when oldPath was already renamed
await rename(oldPath, newPath);
```

Why? Updates can be retried after partial failures (e.g. SIGINT during the swap). The migration runner catches errors from `up()` and aborts BEFORE the suite swap, so the next retry will rerun the migration.

## schemaVersion Bump

The migration runner — NOT individual `up()` functions — updates the install manifest's `schemaVersion`. After every migration succeeds, the runner writes `schemaVersion = lastMigration.toSchema` via `manifest.js writeManifest(...)`. If `up()` mutates the manifest itself, behavior is undefined.

## Two-Tree Invariant Bypass

Migrations are the ONE caller-context where workspace mutations during an update path are explicitly allowed (`workspace-guard.assertNotUpdate('migration')`). The runner sets this context before invoking each `up()`.

## Discovery + Composition

`scripts/lib/migrate.js applyMigrations({ target, fromVersion, toVersion, migrationsDir })`:

1. `readdir(migrationsDir)` and filter via `^v\d+-to-v\d+\.js$`.
2. Read every file's `fromSchema`/`toSchema` exports; sort by `fromSchema`.
3. Read current `schemaVersion` from the manifest.
4. For each migration in sort order:
   - Skip if `m.fromSchema < cur` (already applied).
   - Throw `Migration gap: at v<cur>, next available is v<m.fromSchema>` if the next available is not exactly `cur`.
   - Otherwise dynamic-import the module and `await mod.up(<target>/_testatlas, ctx)`.
   - Advance `cur = m.toSchema`.
5. After all migrations, `manifest.schemaVersion = cur`; write back.

## Versioning Policy

- **v0.1.0 ships with NO migrations.** This directory contains only this README.
- The first real migration arrives at the first schema break (v0.2.0 or v1.0.0, whichever schemes change first).
- The CI test `test/update/migrate-longjump.test.js` exercises v1→v3 via fixture migrations under `test/fixtures/migrations-fixture/` to prove the framework works end-to-end before any real migration ships.
