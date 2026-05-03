// scripts/lib/workspace-guard.js
//
// Two-tree invariant guard.
//
// TestAtlas keeps the SUITE (.testatlas/) and the WORKSPACE (_testatlas/)
// strictly separate. The suite-update path (Phase 7's update.js) MUST NEVER
// mutate workspace state — that's the user's data, not ours.
//
// Every code path that mutates _testatlas/ MUST call assertNotUpdate() with
// its caller-context (an explicit string argument, NOT stack inspection — stack
// inspection is fragile across bundlers, async hops, and Node minor releases).
//
// Valid contexts:
//   - 'init'       — first-run initialization (init-workspace.js, /atlas:init)
//   - 'command'    — user-invoked command (e.g., /atlas:explore)
//   - 'migration'  — explicit data migration script (Phase 7+)
//   - 'test'       — test fixtures
//
// Forbidden context: 'update' — throws TESTATLAS_TWO_TREE_VIOLATION.
// Unknown context: throws TESTATLAS_INVALID_CALLER_CONTEXT (fail loud).
//
// See .planning/phases/02-schemas-templates-workspace-skeleton/02-RESEARCH.md
// §"Pattern 5: Two-Tree Invariant Guard" and PITFALLS.md Pitfall 5.

export const VALID_CONTEXTS = new Set(['init', 'command', 'migration', 'test']);
const FORBIDDEN_FROM_UPDATE = 'update';

/**
 * Guard called by every workspace mutation entry point.
 *
 * @param {'init'|'command'|'migration'|'test'|'update'} callerContext
 * @throws {Error} `TESTATLAS_TWO_TREE_VIOLATION` when context is 'update'
 * @throws {Error} `TESTATLAS_INVALID_CALLER_CONTEXT` for any other unknown context
 */
export function assertNotUpdate(callerContext) {
  if (callerContext === FORBIDDEN_FROM_UPDATE) {
    const e = new Error(
      `Two-tree invariant violation: code path tagged "${callerContext}" attempted to mutate workspace. ` +
        'Suite update (.testatlas/) MUST NOT touch workspace (_testatlas/). ' +
        'Workspace mutations belong in init, commands, migrations, or tests.',
    );
    e.code = 'TESTATLAS_TWO_TREE_VIOLATION';
    throw e;
  }
  if (!VALID_CONTEXTS.has(callerContext)) {
    const e = new Error(`workspace-guard: unknown callerContext "${callerContext}"`);
    e.code = 'TESTATLAS_INVALID_CALLER_CONTEXT';
    throw e;
  }
}
