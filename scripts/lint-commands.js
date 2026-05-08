#!/usr/bin/env node
// scripts/lint-commands.js
//
// Quick 260508-pc0. Doc-vs-truth invariant linter. Runs as part of `pnpm test`
// and is invoked from scripts/validate-workspace.js so workspace validation
// surfaces command-body drift.
//
// The linter prevents the recurring dogfood-round defect class where command
// bodies (`.testatlas/commands/**/*.md`) drift from the scripts/schemas/paths
// they reference. It enforces 5 invariants:
//
//   Invariant 1 — flag-existence: every `node .testatlas/scripts/<x>.js
//     [--flag]` must be a real argv flag of `scripts/<x>.js` (HARD-FAIL).
//   Invariant 2 — path-canonicity: every `_testatlas/<path>` reference must
//     match the canonical layout in scripts/lib/canonical-paths.json; known
//     anti-patterns surface with a suggested replacement.
//   Invariant 3 — schema-key-existence: every `counts.<key>` reference must
//     resolve to a property in `.testatlas/schemas/workspace-manifest.schema.json`.
//   Invariant 4 — lifecycle-completeness: every command's Lifecycle section
//     calls `update-brain-after-command.js`, with an explicit allowlist for
//     umbrella commands.
//   Invariant 5 — frontmatter-script-form: Phase-17 invariant extended into
//     frontmatter `description:` — bare `scripts/<x>.js` HARD-FAILS.
//
// CLI:
//   node scripts/lint-commands.js [--commands-dir <path>] [--scripts-dir <path>]
//                                 [--schemas-dir <path>] [--quiet] [--json]
//                                 [--help]
//
// Exit codes: 0 = no violations; 1 = violations detected; 2 = bad CLI args.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Lifecycle allowlist — umbrella commands that don't write to brain. Path
// segments after `commands/` (forward-slash). NEVER add per-command exceptions
// for explore-runtime / explore-security / explore-accessibility / explore-
// performance — those commands MUST satisfy the lifecycle invariant; they
// are the targets of Quick 260508-pc0.
const LIFECYCLE_ALLOWLIST = new Set([
  'explore.md',
  'report.md',
  'maintain.md',
  'test.md',
  'init.md',
  'handoff.md',
  // Council umbrella + sub-orchestrator-style commands that compose other
  // commands rather than performing brain-writing work themselves.
  'council.md',
  'council/council.md',
  // Top-level umbrellas under `commands/explore/`, `commands/report/`,
  // `commands/test/`, `commands/maintain/` that are themselves sweeps:
  'explore/explore-all.md',
  'test/test-all.md',
  'core/help.md',
  'core/index.md',
  // Additional command surfaces that legitimately do not write to brain
  // (verification surfaces, documentation surfaces). Add ONLY with rationale.
  'core/status.md', // brain query, read-only — but already calls update-brain elsewhere; keep restrictive
  'core/brain-query.md', // read-only brain query
]);

// ─── Invariant 1: flag-existence ────────────────────────────────────────────

/**
 * Walk command bodies for `node .testatlas/scripts/<x>.js [--flags ...]`
 * invocations; resolve to scripts/<x>.js; cross-check each --flag against
 * the supported set extracted from the script source.
 *
 * @param {{commandsDir:string, scriptsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkFlagExistence({ commandsDir, scriptsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  // Cache: scriptName → Set<supportedFlag> | 'cannot-introspect'
  const flagCache = new Map();

  // Match any `node .testatlas/scripts/<x>.js[ flags...]` token. Stop at
  // newline, backtick, or closing token. We accept either bare or quoted
  // contexts — the regex picks up the script name + flag run after it.
  const RE = /\bnode\s+\.testatlas\/scripts\/([\w-]+)\.js\b([^\n`]*)/g;

  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let m;
      const re = new RegExp(RE.source, 'g');
      while ((m = re.exec(line)) !== null) {
        const scriptName = m[1];
        const flagsBlob = m[2] || '';
        // Extract long-form flags from the blob. Short flags or non-flag
        // tokens are ignored (KNOWN_FLAGS in argv parsers are typically long).
        const flagTokens = [...flagsBlob.matchAll(/(--[\w][\w-]*)(?:=\S+)?/g)].map((x) => x[1]);
        if (flagTokens.length === 0) continue;
        // Resolve script & extract its supported flag set (cached).
        if (!flagCache.has(scriptName)) {
          flagCache.set(
            scriptName,
            await extractSupportedFlags(path.join(scriptsDir, `${scriptName}.js`)),
          );
        }
        const supported = flagCache.get(scriptName);
        if (supported === 'cannot-introspect' || supported === 'missing') {
          // Not a hard fail — emit a warning the operator can act on but
          // don't block the task on it. This is conservative because the
          // regex extractor is best-effort.
          continue;
        }
        for (const flag of flagTokens) {
          if (!supported.has(flag)) {
            violations.push({
              invariant: 'flag-existence',
              file: path.relative(PROJECT_ROOT, file),
              line: lineIdx + 1,
              reason: `flag ${flag} not supported by .testatlas/scripts/${scriptName}.js`,
              detail: `unknown flag ${flag} (supported: ${[...supported].sort().join(', ') || '(none extracted)'})`,
              suggestion: `remove ${flag} or update scripts/${scriptName}.js argv parser`,
            });
          }
        }
      }
    }
  }
  return violations;
}

/**
 * Best-effort extraction of supported argv flags from a script's source.
 *
 * Heuristics:
 *   1. Look for `KNOWN_FLAGS = new Set([...])` style.
 *   2. Look for `parseArgs({ options: { foo: ... } })` shape.
 *   3. Fall back to scanning for `a === '--foo'` / `a.startsWith('--foo=')`
 *      / `argv.includes('--foo')` / `'--foo' || a.startsWith('--foo=')`.
 *
 * Returns a Set<string> of flag tokens (with leading `--`), `'missing'` if
 * the script file doesn't exist, or `'cannot-introspect'` if extraction
 * yielded zero flags (in which case the linter falls back to skip-with-warn
 * rather than block).
 *
 * @param {string} scriptPath absolute path to the script
 * @returns {Promise<Set<string>|'missing'|'cannot-introspect'>}
 */
async function extractSupportedFlags(scriptPath) {
  let src;
  try {
    src = await readFile(scriptPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    return 'cannot-introspect';
  }
  const flags = new Set();
  // 1. KNOWN_FLAGS = new Set([...])
  const setMatch = src.match(/KNOWN_FLAGS\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/);
  if (setMatch) {
    for (const m of setMatch[1].matchAll(/['"`](--[\w-]+)['"`]/g)) flags.add(m[1]);
  }
  // 2. parseArgs({ options: { foo: ... } })
  for (const m of src.matchAll(/parseArgs\s*\(\s*\{\s*options\s*:\s*\{([\s\S]*?)\}\s*[,}]/g)) {
    for (const opt of m[1].matchAll(/['"`]?([\w-]+)['"`]?\s*:\s*\{/g)) {
      // Convert kebab/camel → flag form. parseArgs uses bare keys.
      flags.add(`--${opt[1]}`);
    }
  }
  // 3. a === '--foo'  /  argv.includes('--foo')  /  a.startsWith('--foo=')
  for (const m of src.matchAll(/['"`](--[\w-]+)['"`]/g)) flags.add(m[1]);
  // 4. commander: .option('--foo <bar>', ...) / .option('--foo, -f <bar>', ...)
  //    The literal contains a space + placeholder, so step 3's strict
  //    `'--foo'` form misses it. Catch the bare flag inside the literal.
  for (const m of src.matchAll(/\.option\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
    const spec = m[1]; // e.g. "--target <dir>" or "-f, --foo <bar>"
    for (const f of spec.matchAll(/(--[\w-]+)/g)) flags.add(f[1]);
  }

  if (flags.size === 0) return 'cannot-introspect';
  return flags;
}

// ─── Invariant 2: path-canonicity ───────────────────────────────────────────

/**
 * Detect anti-pattern `_testatlas/...` references in command bodies.
 *
 * @param {{commandsDir:string, canonicalPaths?:object}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkPathCanonicity({ commandsDir, canonicalPaths }) {
  const cfg = canonicalPaths ?? (await loadCanonicalPaths());
  const antiPatterns = cfg.antiPatterns ?? [];
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (const ap of antiPatterns) {
        // ap.match may be a literal substring like `_testatlas/runs/` OR a
        // template like `_testatlas/flows/<slug>/`. We compile each into a
        // regex: `<slug>` (or any `<word>`) → `[^/`'"\s]+`.
        const literal = ap.match
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/<[\w-]+>/g, '[^/`\\s\'"]+');
        const re = new RegExp(literal, 'g');
        const matches = [...line.matchAll(re)];
        if (matches.length === 0) continue;
        for (const _m of matches) {
          violations.push({
            invariant: 'path-canonicity',
            file: path.relative(PROJECT_ROOT, file),
            line: lineIdx + 1,
            reason: ap.reason,
            detail: `anti-pattern ${ap.match} matched on line ${lineIdx + 1}`,
            suggestion: ap.suggest,
          });
        }
      }
    }
  }
  return violations;
}

async function loadCanonicalPaths() {
  const p = path.join(PROJECT_ROOT, 'scripts/lib/canonical-paths.json');
  try {
    const txt = await readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Friendly error rather than a crash — Task 2 ships the file. Until
      // it exists, return an empty config so the linter still runs.
      return { patterns: [], antiPatterns: [] };
    }
    throw err;
  }
}

// ─── Invariant 3: schema-key-existence ──────────────────────────────────────

/**
 * Cross-check `counts.<key>` references against
 * `.testatlas/schemas/workspace-manifest.schema.json`. Other schema/key pairs
 * are out of scope for v1 — Phase-17 has separate validators for richer
 * cross-schema work.
 *
 * @param {{commandsDir:string, schemasDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkSchemaKeyExistence({ commandsDir, schemasDir }) {
  const violations = [];
  const manifestPath = path.join(schemasDir, 'workspace-manifest.schema.json');
  let manifestSchema;
  try {
    manifestSchema = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    // Silently skip — workspace-manifest.schema.json is required infra; if
    // it's missing the linter has bigger problems and other gates will fail.
    return violations;
  }
  const countsProps = manifestSchema?.properties?.counts?.properties ?? {};
  const validKeys = new Set(Object.keys(countsProps));
  if (validKeys.size === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  const RE = /\bcounts\.(\w+)/g;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const re = new RegExp(RE.source, 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        const key = m[1];
        if (validKeys.has(key)) continue;
        violations.push({
          invariant: 'schema-key-existence',
          file: path.relative(PROJECT_ROOT, file),
          line: lineIdx + 1,
          reason: `counts.${key} not in workspace-manifest.schema.json`,
          detail: `missing key counts.${key} (actual: ${[...validKeys].sort().join(', ')})`,
          suggestion: `use one of: ${[...validKeys].sort().join(', ')}`,
        });
      }
    }
  }
  return violations;
}

// ─── Invariant 4: lifecycle-completeness ────────────────────────────────────

/**
 * Lifecycle-completeness rule (refined): a command's Lifecycle section MUST
 * reference `update-brain-after-command.js` IF the section is "brain-touching"
 * — empirically, when it mentions `recompute counts.*` (counts adjustments)
 * OR writes to `_testatlas/evidence/`. Both signals indicate the command
 * mutates brain-tracked state and therefore must trigger the brain refresh.
 *
 * Commands whose Lifecycle is purely housekeeping (only the standard
 * 03_execution_status / 09_artifact_index / 10_command_log / lastUpdatedAt
 * triplet without counts adjustment OR evidence emission) are NOT brain
 * writers in this strict sense and the hook is not required. The umbrella
 * allowlist still skips composition-only commands explicitly.
 *
 * Rationale: the 4 dogfood Round-9 targets (explore-runtime/security/
 * accessibility/performance) all say "recompute counts.evidence" in their
 * Lifecycle — that's the precise signal we want to flag. Pure orchestration
 * commands (cleanup, uninstall, update, bootstrap) don't, and shouldn't
 * trigger.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkLifecycleCompleteness({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const rel = path.relative(commandsDir, file);
    if (LIFECYCLE_ALLOWLIST.has(rel)) continue;
    const text = await readFile(file, 'utf8');
    // Find the Lifecycle section (heading at level 1 or 2). If absent, skip.
    const lines = text.split('\n');
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,2}\s+Lifecycle\s*$/.test(lines[i])) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) continue;
    // Section ends at the next heading at the same level OR EOF.
    let endLine = lines.length;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (/^#{1,2}\s+\S/.test(lines[i])) {
        endLine = i;
        break;
      }
    }
    const section = lines.slice(startLine, endLine).join('\n');
    // Brain-writer signal: Lifecycle mentions `recompute` (counts.*) or
    // `_testatlas/evidence/`. Without one of these signals we treat the
    // command as a non-brain-writer; the hook is not required.
    const brainWriter = /\brecompute\b/i.test(section) || /_testatlas\/evidence\//.test(section);
    if (!brainWriter) continue;
    // Hook may live in the Lifecycle section OR a downstream sibling
    // section like `## Post-Operation Brain Update` (canonical pattern in
    // `commands/core/init.md`). Search the full file so legitimate
    // sibling-section placement isn't mis-flagged.
    if (!text.includes('update-brain-after-command.js')) {
      violations.push({
        invariant: 'lifecycle-completeness',
        file: path.relative(PROJECT_ROOT, file),
        line: startLine + 1,
        reason: `Lifecycle section does not reference update-brain-after-command.js`,
        detail: `command ${rel} has a brain-writing Lifecycle (recompute / evidence) but no brain-update hook (not on umbrella allowlist)`,
        suggestion: `add: \`node .testatlas/scripts/update-brain-after-command.js --command ${rel.replace(/\.md$/, '').split('/').pop()} --actor agent --status completed\``,
      });
    }
  }
  return violations;
}

// ─── Invariant 5: frontmatter-script-form ───────────────────────────────────

/**
 * In each command's YAML-frontmatter `description:` field (or any other
 * frontmatter line containing a script reference), bare `scripts/<x>.js`
 * MUST be `node .testatlas/scripts/<x>.js`. Phase-17 invariant for body text
 * is enforced separately by scripts/lib/validate/check-script-path.js — this
 * extension catches the same pattern in frontmatter only.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkFrontmatterScriptForm({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    if (!lines[0] || lines[0].trim() !== '---') continue; // no frontmatter
    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) continue;
    // Scan frontmatter lines for bare `scripts/<x>.js` references that are
    // NOT preceded by `.testatlas/`.
    const RE = /(?<!\.testatlas\/)\bscripts\/[\w-]+\.js\b/;
    for (let i = 1; i < endIdx; i++) {
      if (RE.test(lines[i])) {
        violations.push({
          invariant: 'frontmatter-script-form',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `frontmatter uses bare scripts/ form (Phase-17 violation)`,
          detail: `frontmatter line ${i + 1}: ${lines[i].trim()}`,
          suggestion: `prefix with node .testatlas/ — e.g. \`node .testatlas/scripts/<x>.js\``,
        });
      }
    }
  }
  return violations;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * @typedef {{
 *   invariant: string,
 *   file: string,
 *   line: number,
 *   reason: string,
 *   detail?: string,
 *   suggestion?: string,
 * }} Violation
 */

/**
 * Run all 5 invariants and return aggregate result.
 *
 * @param {{
 *   commandsDir?: string,
 *   scriptsDir?: string,
 *   schemasDir?: string,
 *   canonicalPaths?: object,
 *   quiet?: boolean,
 * }} [opts]
 * @returns {Promise<{violations:Violation[], exitCode:number}>}
 */
export async function runLinter(opts = {}) {
  const commandsDir = opts.commandsDir ?? path.join(PROJECT_ROOT, '.testatlas/commands');
  const scriptsDir = opts.scriptsDir ?? path.join(PROJECT_ROOT, 'scripts');
  const schemasDir = opts.schemasDir ?? path.join(PROJECT_ROOT, '.testatlas/schemas');
  const canonicalPaths = opts.canonicalPaths ?? (await loadCanonicalPaths());

  const all = [];
  for (const fn of [
    () => checkFlagExistence({ commandsDir, scriptsDir }),
    () => checkPathCanonicity({ commandsDir, canonicalPaths }),
    () => checkSchemaKeyExistence({ commandsDir, schemasDir }),
    () => checkLifecycleCompleteness({ commandsDir }),
    () => checkFrontmatterScriptForm({ commandsDir }),
  ]) {
    const partial = await fn();
    all.push(...partial);
  }
  const exitCode = all.length > 0 ? 1 : 0;
  return { violations: all, exitCode };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function listMarkdownFiles(dir) {
  const out = [];
  await walk(dir, out);
  return out.sort();
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/lint-commands.js [options]

Doc-vs-truth invariant linter for .testatlas/commands/**/*.md.

Options:
  --commands-dir <path>   Commands root (default: .testatlas/commands)
  --scripts-dir <path>    Scripts root (default: scripts)
  --schemas-dir <path>    Schemas root (default: .testatlas/schemas)
  --quiet                 Suppress per-violation output
  --json                  Emit machine-readable JSON
  --help                  Show this message

Exit codes:
  0   no violations
  1   one or more violations
  2   bad CLI args
`;

async function runCli(argv) {
  const opts = { quiet: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commands-dir') opts.commandsDir = path.resolve(argv[++i]);
    else if (a === '--scripts-dir') opts.scriptsDir = path.resolve(argv[++i]);
    else if (a === '--schemas-dir') opts.schemasDir = path.resolve(argv[++i]);
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      process.stderr.write(`lint-commands: unknown arg "${a}"\n${USAGE}`);
      process.exit(2);
    }
  }
  const r = await runLinter(opts);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  } else if (!opts.quiet) {
    if (r.violations.length === 0) {
      process.stdout.write('lint-commands: 0 violations\n');
    } else {
      process.stdout.write(`lint-commands: ${r.violations.length} violation(s)\n\n`);
      for (const v of r.violations) {
        process.stdout.write(`[${v.invariant}] ${v.file}:${v.line} — ${v.reason}\n`);
        if (v.detail) process.stdout.write(`  ${v.detail}\n`);
        if (v.suggestion) process.stdout.write(`  suggestion: ${v.suggestion}\n`);
      }
    }
  }
  process.exit(r.exitCode);
}

const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__thisFile)) {
  await runCli(process.argv.slice(2));
}
