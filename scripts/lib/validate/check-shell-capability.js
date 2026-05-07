// scripts/lib/validate/check-shell-capability.js
//
// Phase 17 Plan 01 — REVIEW-INV-A.
//
// Suite-build invariant: every source command at `.testatlas/commands/**/*.md`
// whose body invokes a `node` accelerator (regex
// `\bnode\s+(\.testatlas\/)?scripts\/`) MUST declare `'shell'` in its
// frontmatter `capabilities` array.
//
// Why this exists:
//   - render-kilocode.js:99-101 emits `bash: allow` ONLY when caps include
//     `'shell'`. Otherwise it emits `bash: deny`, silently breaking every
//     KiloCode workflow whose body calls a node script.
//   - capsToTools() at _shared.js:216-230 includes `Bash` in Claude Code's
//     `allowed-tools` ONLY when caps include `'shell'`. Same defect class.
//   - The other 16 per-command-file adapters all consume the same source
//     capabilities array — so wrong source data wrong-renders 18 adapter trees.
//
// `check-adapter-parity.js` does NOT catch this because parity inspects render
// determinism, not semantic body-vs-frontmatter correctness — both source and
// rendered output are mutually consistent (faithfully wrong).
//
// Scope: this check only runs when `<cwd>/.testatlas/commands/` exists (i.e.
// the validator is being invoked against the TestAtlas suite source itself,
// or against an installed target whose user has authored their own commands).
// Target workspaces that have no `.testatlas/commands/` directory get a
// trivial pass.
//
// Findings:
//   TESTATLAS_SHELL_CAPABILITY_MISSING — severity 'error', fixable null.
//   reason code: `shell-capability-missing`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listCommandFiles } from '../list-command-files.js';
import { extractFrontmatter, parseFrontmatter } from '../parse-frontmatter.js';

export const id = 'check-shell-capability';
// New invariant added by Phase 17; not in PRD §33's original 10. We use a
// rule number outside the §33 range so reporters distinguish it cleanly.
export const prdRule = 'PHASE17-INV-A';

// Mirrors the regex used by `test/commands/shell-capability-invariant.test.js`
// and the review document at §1 ISSUE-006 line 197.
const NODE_SCRIPT_RE = /\bnode\s+(\.testatlas\/)?scripts\//;

/**
 * @param {{ config?: object }} ctx
 * @returns {Promise<{ id: string, prdRule: string, status: 'pass' | 'fail', findings: object[] }>}
 */
export async function check(ctx) {
  // Suite root — the directory containing `.testatlas/commands/`. ctx.config
  // is the loaded testatlas.config.json; its source dir lives at the same
  // process.cwd() the validator was started from. We re-derive cwd from the
  // workspace position because validateWorkspace stores wsDir but not cwd.
  // In suite-self runs, the parent of `_testatlas/` IS the suite root, which
  // is also where `.testatlas/commands/` lives.
  const cwd = ctx.wsDir ? path.dirname(ctx.wsDir) : process.cwd();
  const suiteCommandsRoot = path.join(cwd, '.testatlas', 'commands');

  let files;
  try {
    files = await listCommandFiles({ cwd, includeCategorized: true });
  } catch (err) {
    // Defensive: never let an enumeration error mask all other check output.
    return {
      id,
      prdRule,
      status: 'fail',
      findings: [
        {
          severity: 'error',
          path: suiteCommandsRoot,
          code: 'TESTATLAS_SHELL_CAPABILITY_ENUMERATION_FAILED',
          message: `Could not enumerate command source files under ${suiteCommandsRoot}: ${err.message}`,
          fixable: null,
        },
      ],
    };
  }

  // Empty directory (target install, no user-authored commands) → trivial pass.
  if (files.length === 0) {
    return { id, prdRule, status: 'pass', findings: [] };
  }

  /** @type {object[]} */
  const findings = [];
  for (const absPath of files) {
    let text;
    try {
      text = await readFile(absPath, 'utf8');
    } catch {
      continue; // unreadable file is a separate defect class
    }
    let fm;
    let body;
    try {
      fm = parseFrontmatter(text);
      ({ body } = extractFrontmatter(text));
    } catch {
      // CMD-04 / check-schemas owns malformed-frontmatter surface.
      continue;
    }
    if (!NODE_SCRIPT_RE.test(body)) continue;
    const caps = Array.isArray(fm?.capabilities) ? fm.capabilities : [];
    if (caps.includes('shell')) continue;

    const relPath = path.relative(cwd, absPath).split(path.sep).join('/');
    findings.push({
      severity: 'error',
      path: relPath,
      code: 'TESTATLAS_SHELL_CAPABILITY_MISSING',
      reason: 'shell-capability-missing',
      message: `Source command ${relPath} body invokes \`node scripts/...\` but frontmatter \`capabilities\` array does not include \`'shell'\`. This causes adapters (KiloCode bash:deny, Claude Code allowed-tools without Bash, etc.) to ship with mismatched permissions.`,
      fixable: null,
      fixDescription:
        "Add 'shell' to the capabilities array in the frontmatter; re-run `node scripts/assemble-adapter.js` to regenerate the 18 adapter trees.",
    });
  }

  return {
    id,
    prdRule,
    status: findings.length > 0 ? 'fail' : 'pass',
    findings,
  };
}
