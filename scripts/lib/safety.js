// scripts/lib/safety.js
//
// Plan 11-04 fix for ISSUE-014 (G-08, medium). Pure-functional capability
// assertion helper for destructive primitives — code-side defense-in-depth
// that complements the instruction-side gates documented in
// `.testatlas/bootstrap.md` §3 §4.
//
// Contract:
//
//   assertCapability(config, action) → { allowed: boolean, reason?: string }
//
// The helper does NOT throw. Callers decide whether to throw, log-and-skip,
// or prompt. This keeps the helper pure and lets each callsite pick the
// failure mode that fits its context (e.g. uninstall throws on denial;
// best-effort cleanup paths in atomic-write/lockfile log-and-skip).
//
// For callers that want hard-fail semantics, the convenience wrapper
// `requireCapability(config, action)` throws an Error with
// `code === 'CAPABILITY_DENIED'` and `action` populated when denied.
//
// Action vocabulary (LOCKED in 11-CONTEXT.md):
//   - 'destructive-fs'      fs.rm, fs.unlink, fs.cp({force:true})
//   - 'destructive-git'     git push --force, git reset --hard, etc.
//   - 'production-network'  calls to known production hosts (smtp, prod APIs)
//   - 'spawn'               child_process.spawn / execFile (any binary)
//   - 'fetch-write'         write side of fetch (POST/PUT/DELETE) to networks
//
// Flag semantics:
//   - safeMode is the master kill switch. When true, all actions denied,
//     regardless of other flags.
//   - destructive-fs / destructive-git / spawn → require allowDestructiveActions
//   - production-network / fetch-write → require allowProductionTesting
//
// Defaults (per .testatlas/default.config.json):
//   safeMode: true, allowDestructiveActions: false, allowProductionTesting: false
//
// Helpers used at callsites that don't currently thread `config`:
// pass `null` and accept the default-deny outcome (typical for best-effort
// cleanup paths). Loaders that DO have a config available SHOULD pass it
// for defense-in-depth.

const VOCABULARY = new Set([
  'destructive-fs',
  'destructive-git',
  'production-network',
  'spawn',
  'fetch-write',
]);

const DESTRUCTIVE_ACTIONS = new Set(['destructive-fs', 'destructive-git', 'spawn']);
const NETWORK_ACTIONS = new Set(['production-network', 'fetch-write']);

/**
 * @param {object | null | undefined} config
 * @param {string} action
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function assertCapability(config, action) {
  if (!VOCABULARY.has(action)) {
    return { allowed: false, reason: `unknown action enum: ${action}` };
  }
  const cfg = config ?? {};

  // safeMode default: true. Master kill switch.
  const safeMode = cfg.safeMode !== false;
  if (safeMode) {
    return { allowed: false, reason: `safeMode is enabled — refusing ${action}` };
  }

  if (DESTRUCTIVE_ACTIONS.has(action)) {
    if (cfg.allowDestructiveActions === true) return { allowed: true };
    return { allowed: false, reason: `${action} requires allowDestructiveActions:true` };
  }

  if (NETWORK_ACTIONS.has(action)) {
    if (cfg.allowProductionTesting === true) return { allowed: true };
    return { allowed: false, reason: `${action} requires allowProductionTesting:true` };
  }

  // Defensive — should be unreachable since VOCABULARY check above.
  return { allowed: false, reason: `unhandled action: ${action}` };
}

/**
 * Throwing wrapper for callers that want hard-fail behavior. Throws an Error
 * with `code: 'CAPABILITY_DENIED'` and `action` populated when denied.
 *
 * @param {object | null | undefined} config
 * @param {string} action
 * @returns {void}
 * @throws {Error & { code: 'CAPABILITY_DENIED', action: string }}
 */
export function requireCapability(config, action) {
  const r = assertCapability(config, action);
  if (!r.allowed) {
    const err = new Error(`Capability denied (${action}): ${r.reason}`);
    err.code = 'CAPABILITY_DENIED';
    err.action = action;
    throw err;
  }
}
