#!/usr/bin/env node
// scripts/lint-commands.js
//
// Quick 260508-pc0 — initial 5 invariants.
// Quick 260508-rqx — extended with 4 new sub-invariants (1.1, 1.2, 6, 7) so the
// linter catches Round-10's drift class structurally.
//
// Doc-vs-truth invariant linter. Runs as part of `pnpm test`
// and is invoked from scripts/validate-workspace.js so workspace validation
// surfaces command-body drift.
//
// The linter prevents the recurring dogfood-round defect class where command
// bodies (`.testatlas/commands/**/*.md`) drift from the scripts/schemas/paths
// they reference. It enforces 9 invariants:
//
//   Invariant 1 — flag-existence: every `node .testatlas/scripts/<x>.js
//     [--flag]` must be a real argv flag of `scripts/<x>.js` (HARD-FAIL).
//   Invariant 1.1 — flag-completeness (NEW Quick-260508-rqx): every required
//     flag for the script (per scripts/lib/script-flag-metadata.js
//     REQUIRED_FLAGS) must appear in each invocation in command bodies.
//   Invariant 1.2 — enum-value-validity (NEW Quick-260508-rqx): every literal
//     value used after an enum-flag must be in the script's enum (per
//     scripts/lib/script-flag-metadata.js ENUM_FLAGS).
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
//   Invariant 6 — vocab-enum-drift (NEW Quick-260508-rqx): for documented
//     enum-aligned lists in command bodies (test types, severities, etc.),
//     listed values MUST be a subset of the corresponding
//     vocabulary.schema.json $defs.<name>.enum.
//   Invariant 7 — lifecycle-position (NEW Quick-260508-rqx): non-allowlisted
//     commands MUST have a `## Lifecycle` heading AND the
//     `update-brain-after-command.js` invocation MUST appear AFTER the
//     heading (catches structural absence + out-of-position drift).
//
// CLI:
//   node scripts/lint-commands.js [--commands-dir <path>] [--scripts-dir <path>]
//                                 [--schemas-dir <path>] [--quiet] [--json]
//                                 [--help]
//
// Exit codes: 0 = no violations; 1 = violations detected; 2 = bad CLI args.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_TOOL_CATALOG } from './lib/mcp-tool-catalog.js';
import {
  ENUM_FLAGS as DEFAULT_ENUM_FLAGS,
  REQUIRED_FLAGS as DEFAULT_REQUIRED_FLAGS,
  getConfigKeys,
  getSchemaFiles,
  getVocabEnums,
} from './lib/script-flag-metadata.js';

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
      const re = new RegExp(RE.source, 'g');
      for (const m of line.matchAll(re)) {
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
      for (const m of line.matchAll(re)) {
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

// ─── Sub-invariant 1.1: flag-completeness (Quick 260508-rqx) ────────────────

/**
 * Walk command bodies for `node .testatlas/scripts/<x>.js [--flags ...]`
 * invocations; for each invocation, look up the script's required flags
 * (default: REQUIRED_FLAGS from scripts/lib/script-flag-metadata.js) and emit
 * a violation for each required flag not present.
 *
 * @param {{commandsDir:string, requiredFlags?:Object<string,string[]>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkRequiredFlags({ commandsDir, requiredFlags }) {
  const violations = [];
  const required = requiredFlags ?? DEFAULT_REQUIRED_FLAGS;
  if (!required || Object.keys(required).length === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  const RE = /\bnode\s+\.testatlas\/scripts\/([\w-]+)\.js\b([^\n`]*)/g;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const re = new RegExp(RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const scriptName = `${m[1]}.js`;
        const reqList = required[scriptName];
        if (!Array.isArray(reqList) || reqList.length === 0) continue;
        const flagsBlob = m[2] || '';
        const presentFlags = new Set(
          [...flagsBlob.matchAll(/(--[\w][\w-]*)(?:=\S+)?/g)].map((x) => x[1]),
        );
        for (const reqFlag of reqList) {
          if (!presentFlags.has(reqFlag)) {
            violations.push({
              invariant: 'flag-completeness',
              file: path.relative(PROJECT_ROOT, file),
              line: lineIdx + 1,
              reason: `invocation of ${scriptName} missing required flag ${reqFlag}`,
              detail: `script ${scriptName} requires ${reqList.join(', ')}; this invocation has ${
                [...presentFlags].sort().join(', ') || '(none)'
              }`,
              suggestion: `add ${reqFlag} "<one-line>" to the invocation`,
            });
          }
        }
      }
    }
  }
  return violations;
}

// ─── Sub-invariant 1.2: enum-value-validity (Quick 260508-rqx) ──────────────

/**
 * Walk command bodies for `node .testatlas/scripts/<x>.js [--flags ...]`
 * invocations. For each `--<flag> <literal>` pair, if the script defines an
 * enum for that flag (per ENUM_FLAGS catalog), assert the literal is in the
 * enum.
 *
 * @param {{commandsDir:string, enumFlags?:Object<string,Object<string,string[]>>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkEnumValueValidity({ commandsDir, enumFlags }) {
  const violations = [];
  const enums = enumFlags ?? DEFAULT_ENUM_FLAGS;
  if (!enums || Object.keys(enums).length === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  const RE = /\bnode\s+\.testatlas\/scripts\/([\w-]+)\.js\b([^\n`]*)/g;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const re = new RegExp(RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const scriptName = `${m[1]}.js`;
        const enumMap = enums[scriptName];
        if (!enumMap || Object.keys(enumMap).length === 0) continue;
        const flagsBlob = m[2] || '';
        // Match `--flag value` pairs (value = next non-flag token, no `--` prefix,
        // optionally quoted). Also match `--flag=value` form.
        const pairRe = /(--[\w][\w-]*)(?:\s+|=)([\w-]+)/g;
        for (const p of flagsBlob.matchAll(pairRe)) {
          const flag = p[1];
          const literal = p[2];
          const allowed = enumMap[flag];
          if (!Array.isArray(allowed) || allowed.length === 0) continue;
          if (allowed.includes(literal)) continue;
          violations.push({
            invariant: 'enum-value-invalid',
            file: path.relative(PROJECT_ROOT, file),
            line: lineIdx + 1,
            reason: `${flag} ${literal} is not in ${scriptName}'s enum`,
            detail: `${scriptName} ${flag} value '${literal}' not in {${allowed.join(', ')}}`,
            suggestion: `use one of: ${allowed.join(', ')} (e.g. ${flag} ${allowed[0]})`,
          });
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 6: vocab-enum-drift (Quick 260508-rqx) ───────────────────────

const DEFAULT_VOCAB_PATTERNS = [
  { enum: 'testType', cuePattern: /\btest\s*types?\b/i },
  { enum: 'severity', cuePattern: /\bseverit(y|ies)\b/i },
  { enum: 'confidence', cuePattern: /\bconfidence\s+levels?\b/i },
  { enum: 'disagreement_type', cuePattern: /\bdisagreement\s+types?\b/i },
  { enum: 'vote_value', cuePattern: /\bvote\s+values?\b/i },
];

/**
 * For documented enum-aligned lists in command bodies, verify each token is a
 * member of the corresponding `vocabulary.schema.json $defs.<enum>.enum`.
 *
 * Conservative parser: only flags tokens matching `/^[a-z][a-z0-9_-]*$/` (the
 * shape of enum-eligible identifiers); ignores prose words.
 *
 * @param {{commandsDir:string, schemasDir:string, vocabPatterns?:Array<{enum:string,cuePattern:RegExp}>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkVocabEnumDrift({ commandsDir, schemasDir, vocabPatterns }) {
  const violations = [];
  const patterns = vocabPatterns ?? DEFAULT_VOCAB_PATTERNS;
  if (!patterns.length) return violations;
  const vocabPath = path.join(schemasDir, 'vocabulary.schema.json');
  let vocab;
  try {
    vocab = JSON.parse(await readFile(vocabPath, 'utf8'));
  } catch {
    return violations;
  }
  const defs = vocab?.$defs ?? {};
  const enumSets = new Map();
  for (const p of patterns) {
    const e = defs?.[p.enum]?.enum;
    if (Array.isArray(e)) enumSets.set(p.enum, new Set(e));
  }
  if (enumSets.size === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  // Token shape that "looks like" an enum member: starts with lowercase
  // letter, kebab- or snake-case slug. Word-boundary anchored so we don't
  // grab parts of CamelCase identifiers.
  const tokenRe = /\b[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*\b/g;
  // Helper: extract contiguous comma-separated token RUNS from text.
  // A run is a sequence like "a, b, c, d" (commas with possible quotes/
  // backticks/whitespace between tokens). Returns each run's enum-eligible
  // tokens as a string[]. This tightly localizes drift detection to actual
  // CSV lists, eliminating false positives from technical prose that
  // happens to mention an enum word.
  const csvRunRe =
    /(?:`?[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*`?\s*,\s*)+`?[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*`?/g;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of patterns) {
        const set = enumSets.get(p.enum);
        if (!set) continue;
        // Cue must appear on the line.
        const cueRe = new RegExp(p.cuePattern.source, p.cuePattern.flags.replace('g', ''));
        if (!cueRe.test(line)) continue;
        // Find comma-separated token runs on this line. For each run, count
        // how many tokens are in this enum's set; if 2+, treat the run as
        // "the author was writing this enum's list" and flag any
        // non-members in that SAME RUN.
        const runs = [...line.matchAll(csvRunRe)].map((m) => m[0]);
        for (const run of runs) {
          const tokensInRun = [...run.matchAll(tokenRe)].map((m) => m[0]);
          const enumLike = tokensInRun.filter((t) => /^[a-z][a-z0-9]*([-_][a-z0-9]+)*$/.test(t));
          if (enumLike.length < 3) continue;
          const inSetCount = enumLike.filter((t) => set.has(t)).length;
          if (inSetCount < 2) continue;
          for (const tok of enumLike) {
            if (set.has(tok)) continue;
            // Skip if member of any other enum (cross-cue false positive).
            let inOther = false;
            for (const [otherName, otherSet] of enumSets) {
              if (otherName === p.enum) continue;
              if (otherSet.has(tok)) {
                inOther = true;
                break;
              }
            }
            if (inOther) continue;
            // Skip pure CSV-list connectives that occasionally squeak in
            // via the inclusive run regex.
            if (['and', 'or'].includes(tok)) continue;
            violations.push({
              invariant: 'vocab-enum-drift',
              file: path.relative(PROJECT_ROOT, file),
              line: i + 1,
              reason: `token '${tok}' not in vocabulary.schema.json $defs.${p.enum}.enum`,
              detail: `'${tok}' in CSV list "${run.slice(0, 80)}" is not a member of ${p.enum} enum (allowed: ${[...set].join(', ')})`,
              suggestion: `use one of: ${[...set].join(', ')} — or extend vocabulary.schema.json $defs.${p.enum}.enum`,
            });
          }
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 7: lifecycle-position (Quick 260508-rqx) ─────────────────────

/**
 * For each non-allowlisted command that contains an
 * `update-brain-after-command.js` invocation: assert (a) a `## Lifecycle`
 * (or `# Lifecycle`) heading exists, AND (b) the FIRST occurrence of the
 * brain-update invocation appears at a line index AFTER the heading.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkLifecyclePosition({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const rel = path.relative(commandsDir, file);
    if (LIFECYCLE_ALLOWLIST.has(rel)) continue;
    const text = await readFile(file, 'utf8');
    if (!text.includes('update-brain-after-command.js')) continue;
    const lines = text.split('\n');
    let headingLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,2}\s+Lifecycle\s*$/.test(lines[i])) {
        headingLine = i;
        break;
      }
    }
    let hookLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('update-brain-after-command.js')) {
        hookLine = i;
        break;
      }
    }
    if (headingLine === -1) {
      violations.push({
        invariant: 'lifecycle-position',
        file: path.relative(PROJECT_ROOT, file),
        line: hookLine + 1,
        reason: `command has update-brain-after-command.js hook but no \`## Lifecycle\` heading`,
        detail: `${rel} contains a brain-update invocation at line ${hookLine + 1} but is missing the structural \`## Lifecycle\` heading`,
        suggestion: `add a \`## Lifecycle\` section ABOVE the brain-update invocation; the hook must live inside the Lifecycle section`,
      });
    } else if (hookLine !== -1 && hookLine < headingLine) {
      violations.push({
        invariant: 'lifecycle-position',
        file: path.relative(PROJECT_ROOT, file),
        line: hookLine + 1,
        reason: `update-brain-after-command.js hook appears BEFORE \`## Lifecycle\` heading (out-of-position)`,
        detail: `${rel} hook at line ${hookLine + 1} precedes Lifecycle heading at line ${headingLine + 1}`,
        suggestion: `move the brain-update invocation inside the \`## Lifecycle\` section`,
      });
    }
  }
  return violations;
}

// ─── Invariant 8: schema-file-existence (Quick 260508-syv) ──────────────────

const SCHEMA_REF_RE = /\b([\w-]+\.schema\.json)\b/g;
// Schema names that are conceptual references in prose (e.g., docs about
// "schema-of-a-schema") rather than claims of file existence. Skip these.
const SCHEMA_REF_ALLOWLIST = new Set([
  'config.schema.json', // self-reference inside default.config.json's $schema
]);

/**
 * For every `<X>.schema.json` token in command bodies, resolve to
 * `<schemasDir>/<X>.schema.json` and HARD-FAIL if the file is missing.
 *
 * @param {{commandsDir:string, schemasDir:string, schemaFiles?:Set<string>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkSchemaFileExistence({ commandsDir, schemasDir, schemaFiles }) {
  const violations = [];
  const known = schemaFiles ?? getSchemaFiles({ schemasDir });
  if (!known || known.size === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const re = new RegExp(SCHEMA_REF_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const ref = m[1];
        if (SCHEMA_REF_ALLOWLIST.has(ref)) continue;
        if (known.has(ref)) continue;
        violations.push({
          invariant: 'schema-file-existence',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `referenced schema file ${ref} does not exist under .testatlas/schemas/`,
          detail: `${ref} not present in schemas dir (sidecar maps are untyped — remove the schema claim or add the schema)`,
          suggestion: `remove the validation claim, or create .testatlas/schemas/${ref}`,
        });
      }
    }
  }
  return violations;
}

// ─── Invariant 9: maps-path-consistency (Quick 260508-syv) ──────────────────

const MAP_PATH_RE = /_testatlas\/maps\/([\w-]+)\.json/g;

/**
 * Within a single command body, all `_testatlas/maps/<X>.json` references
 * must use a consistent X. HARD-FAIL on intra-doc inconsistency where the
 * map names are obvious singular/plural or naming-style variants of one
 * another (e.g., apis vs api, entities vs data, cli-commands vs cli, vs
 * cli_commands).
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkMapsPathConsistency({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    // Collect (mapName, lineIdx) per occurrence.
    const lines = text.split('\n');
    const occurrences = [];
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp(MAP_PATH_RE.source, 'g');
      for (const m of lines[i].matchAll(re)) {
        occurrences.push({ name: m[1], line: i + 1 });
      }
    }
    if (occurrences.length < 2) continue;
    // Group occurrences by an aliased family. We only flag conflicts within
    // a family — cross-domain references (apis vs flows) are legitimate.
    const families = aliasFamilies(occurrences.map((o) => o.name));
    for (const family of families) {
      if (family.size < 2) continue;
      const sortedNames = [...family].sort();
      // Pick the canonical name = the most common variant in this file;
      // ties → the longest/most-descriptive one.
      const counts = new Map();
      for (const o of occurrences) {
        if (family.has(o.name)) counts.set(o.name, (counts.get(o.name) || 0) + 1);
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      const canonical = ranked[0][0];
      for (const o of occurrences) {
        if (!family.has(o.name)) continue;
        if (o.name === canonical) continue;
        violations.push({
          invariant: 'maps-path-consistency',
          file: path.relative(PROJECT_ROOT, file),
          line: o.line,
          reason: `inconsistent map name '${o.name}' vs '${canonical}' within same file`,
          detail: `_testatlas/maps/${o.name}.json conflicts with _testatlas/maps/${canonical}.json (variants in this file: ${sortedNames.join(', ')})`,
          suggestion: `unify on _testatlas/maps/${canonical}.json across this file`,
        });
      }
    }
  }
  return violations;
}

/**
 * Group a list of map names into families of obvious variants.
 *   - singular ↔ plural (api ↔ apis, entity ↔ entities, route ↔ routes)
 *   - kebab vs underscore vs short (cli-commands vs cli_commands vs cli)
 *
 * Returns an array of Set<string>; each set is one family.
 *
 * @param {string[]} names
 * @returns {Array<Set<string>>}
 */
function aliasFamilies(names) {
  const norm = (s) => s.replace(/[-_]/g, '').replace(/s$/, '').toLowerCase();
  const buckets = new Map();
  for (const n of names) {
    const key = norm(n);
    // Also group "cli" with "clicommands" (short ↔ kebab/underscore)
    let bucketKey = key;
    for (const existing of buckets.keys()) {
      if (existing.startsWith(key) || key.startsWith(existing)) {
        bucketKey = existing;
        break;
      }
    }
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Set());
    buckets.get(bucketKey).add(n);
    // The "data" / "entities" pair is a known semantic alias (Round-11
    // ISSUE-123b). Family-merge it explicitly.
  }
  // Explicit alias merge: data ↔ entities
  const dataBucket = [...buckets.entries()].find(
    ([_k, v]) => v.has('data') || v.has('entities') || v.has('entity'),
  );
  if (dataBucket) {
    const [, set] = dataBucket;
    for (const [k, v] of buckets) {
      if (v === set) continue;
      if (v.has('data') || v.has('entities') || v.has('entity')) {
        for (const x of v) set.add(x);
        buckets.delete(k);
      }
    }
  }
  return [...buckets.values()];
}

// ─── Invariant 10: vocabulary-enum-presence (Quick 260508-syv) ──────────────

/**
 * Pattern matchers for common "status / severity / etc." literal claims in
 * command-body prose. Each entry binds a cue+capture to a vocabulary enum
 * name.
 *
 * The cue MUST be one of: `--status <token>`, `status: \`<token>\``,
 * `status="<token>"`, or `set status \`<token>\``. We require the value to
 * be backtick-wrapped or quoted (or follow `--<flag>`) to avoid prose
 * false-positives where words like "the" or "of" follow a cue word like
 * "status".
 */
const VOCAB_LITERAL_PATTERNS = [
  // Note: --status flag literals are owned by sub-invariant 1.2
  // (enum-value-validity), which checks against the per-script enum (e.g.
  // update-brain-after-command.js uses {completed, aborted, in_progress},
  // NOT issueStatus). VOCAB_LITERAL_PATTERNS only inspects prose-form
  // issue/severity/confidence claims via `<cue>: \`<lit>\``.
  //
  // The leading `\b(?<![\w-])` ensures the cue word is the START of an
  // identifier, not the tail (so `skeleton-status:`, `pack-status:`, and
  // `scenario-status:` do NOT trigger the issueStatus check — those are
  // domain-specific status taxonomies, not the workspace issue lifecycle).
  {
    enum: 'issueStatus',
    re: /(?<![\w-])(?:status\s*[=:]\s*|set\s+status\s+to\s+)`([a-z][a-z0-9_-]*)`/gi,
  },
  {
    enum: 'severity',
    re: /(?<![\w-])(?:severity\s*[=:]\s*|set\s+severity\s+to\s+)`([a-z][a-z0-9_-]*)`/gi,
  },
  {
    enum: 'confidence',
    re: /(?<![\w-])(?:confidence\s*[=:]\s*|set\s+confidence\s+to\s+)`([a-z][a-z0-9_-]*)`/gi,
  },
];

const VOCAB_LITERAL_IGNORE = new Set([
  // Words that are not enum literals — these surface from the cue regex when
  // prose says e.g. "status: the result of …".
  'the',
  'a',
  'is',
  'must',
  'should',
  'and',
  'or',
  'one',
  'of',
  'value',
  'string',
  'enum',
  'literal',
  'set',
  'see',
  'either',
  'when',
  'each',
  'this',
  'as',
  'per',
  'for',
  'note',
  'eg',
]);

/**
 * For every status/severity/confidence literal in command bodies, verify the
 * literal is in the corresponding vocabulary enum.
 *
 * @param {{commandsDir:string, schemasDir:string, vocabEnums?:Object<string,Set<string>>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkVocabularyEnumPresence({ commandsDir, schemasDir, vocabEnums }) {
  const violations = [];
  const enums =
    vocabEnums ??
    (() => {
      const fromDisk = getVocabEnums({
        vocabPath: path.join(schemasDir ?? '', 'vocabulary.schema.json'),
      });
      return fromDisk;
    })();
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of VOCAB_LITERAL_PATTERNS) {
        const set = enums?.[p.enum];
        if (!set || (set instanceof Set && set.size === 0)) continue;
        const re = new RegExp(p.re.source, p.re.flags);
        for (const m of line.matchAll(re)) {
          const literal = m[1];
          if (!literal) continue;
          if (VOCAB_LITERAL_IGNORE.has(literal)) continue;
          const allowed = set instanceof Set ? set : new Set(set);
          if (allowed.has(literal)) continue;
          violations.push({
            invariant: 'vocabulary-enum-presence',
            file: path.relative(PROJECT_ROOT, file),
            line: i + 1,
            reason: `literal '${literal}' is not in vocabulary $defs.${p.enum}.enum`,
            detail: `'${literal}' used as ${p.enum} value but not in enum (allowed: ${[...allowed].join(', ')})`,
            suggestion: `use one of: ${[...allowed].join(', ')} — or extend vocabulary.schema.json $defs.${p.enum}.enum`,
          });
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 11: bare-script-path (Quick 260508-syv) ──────────────────────

/**
 * For every `scripts/<X>.js` reference in body prose that is NOT preceded
 * by `.testatlas/`, HARD-FAIL. Extension of the Phase-17 invariant from
 * frontmatter into body text.
 *
 * Allowlisted: documentation contexts that legitimately reference the
 * source-repo dev path. The allowlist is intentionally small — most
 * references must use the canonical `node .testatlas/scripts/<X>.js`
 * form per CLAUDE.md.
 *
 * @param {{commandsDir:string, allowlist?:Array<{file:string,line:RegExp}>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkBareScriptPath({ commandsDir, allowlist }) {
  const violations = [];
  const allow = allowlist ?? [
    // commands/council/council.md line 106 references LIFECYCLE_ALLOWLIST
    // metadata in scripts/lint-commands.js — that line legitimately cites
    // the linter source path itself, not invocation. Explicitly allow.
    { fileRe: /council\/council\.md$/, lineRe: /LIFECYCLE_ALLOWLIST/ },
  ];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  // Negative-lookbehind: bare `scripts/<x>.js` not preceded by `.testatlas/`.
  const RE = /(?<!\.testatlas\/)\bscripts\/([\w-]+)\.js\b/g;
  // INV-G (Quick 260508-u72) — explicit opt-out marker for legitimate
  // source-repo file-location references. Lines carrying this marker are
  // exempt regardless of context (narrative / inline-code / fence).
  const OPT_OUT_RE = /<!--\s*bare-script-path-allowed\s*:[^>]*-->/i;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (OPT_OUT_RE.test(line)) continue;
      const re = new RegExp(RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const scriptName = m[1];
        const allowed = allow.some((a) => a.fileRe.test(file) && a.lineRe?.test(line));
        if (allowed) continue;
        violations.push({
          invariant: 'bare-script-path',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `bare scripts/ form in body prose (Phase-17 violation)`,
          detail: `bare \`scripts/${scriptName}.js\` should be \`node .testatlas/scripts/${scriptName}.js\``,
          suggestion: `prefix with node .testatlas/ — \`node .testatlas/scripts/${scriptName}.js\` (or annotate with <!-- bare-script-path-allowed: <reason> --> for legitimate source-repo references)`,
        });
      }
    }
  }
  return violations;
}

// ─── Invariant 12: lifecycle-heading-strict (Quick 260508-syv) ──────────────

const LIFECYCLE_HEADING_ALIASES = [
  /^#{1,3}\s+Post-Operation\s+Brain\s+Update\s*$/i,
  /^#{1,3}\s+Brain\s+Lifecycle\s*$/i,
  /^#{1,3}\s+Post-Run\s+Lifecycle\s*$/i,
  /^#{1,3}\s+After\s+Operation\s*$/i,
];

/**
 * Heading must be EXACTLY `## Lifecycle` (or `# Lifecycle` / `### Lifecycle`).
 * Aliases like `## Post-Operation Brain Update` HARD-FAIL.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkLifecycleHeadingStrict({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const alias of LIFECYCLE_HEADING_ALIASES) {
        if (alias.test(line)) {
          violations.push({
            invariant: 'lifecycle-heading-strict',
            file: path.relative(PROJECT_ROOT, file),
            line: i + 1,
            reason: `non-canonical lifecycle heading on line ${i + 1}`,
            detail: `"${line.trim()}" should be the canonical "## Lifecycle"`,
            suggestion: `rename to \`## Lifecycle\` (Round-9/10/11 invariant)`,
          });
          break;
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 13: config-key-existence (Quick 260508-syv) ──────────────────

// Two cue forms supported:
//   1. `default.config.json.<key>` (dotted form inside a single backtick span)
//   2. `<cue>` … `\`<key>\`` (cue followed by backtick-wrapped key on same line)
// Both yield exactly one captured key per match. We deliberately keep the
// cues narrow ("default.config.json", "config key", "config setting") so
// prose words like "the Ms suffix" don't false-positive after a config-key
// claim has already been made earlier on the same line.
const CONFIG_KEY_HINT_RES = [
  /default\.config\.json\.([a-z][a-zA-Z0-9_]*)/g,
  /(?:configurable via|config key|config setting)\s+`([a-z][a-zA-Z0-9_]*)`/gi,
  /`\.testatlas\/default\.config\.json`\s+`([a-z][a-zA-Z0-9_]*)`/g,
];

/**
 * For every `<key>` in command bodies that is claimed (via cue prose) as a
 * configuration key, resolve against `.testatlas/default.config.json` and
 * HARD-FAIL if the key doesn't exist.
 *
 * @param {{commandsDir:string, configKeys?:Set<string>}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkConfigKeyExistence({ commandsDir, configKeys }) {
  const violations = [];
  const known = configKeys ?? getConfigKeys();
  if (!known || known.size === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const proto of CONFIG_KEY_HINT_RES) {
        const re = new RegExp(proto.source, proto.flags);
        for (const m of line.matchAll(re)) {
          const key = m[1];
          if (!key) continue;
          if (known.has(key)) continue;
          violations.push({
            invariant: 'config-key-existence',
            file: path.relative(PROJECT_ROOT, file),
            line: i + 1,
            reason: `config key '${key}' not in default.config.json`,
            detail: `claimed config key \`${key}\` does not exist (known keys: ${[...known].sort().slice(0, 8).join(', ')}…)`,
            suggestion: `add ${key} to .testatlas/default.config.json or remove the claim`,
          });
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 14: option-pair-completeness (Quick 260508-syv) ──────────────

const OPTION_LABEL_RE = /\bOption\s+([A-Z])\b/g;

/**
 * If the file mentions Option B / Option C / etc., a preceding Option A
 * (or earlier letter) anchor must exist in the same file. HARD-FAIL on
 * dangling option labels.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkOptionPairCompleteness({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    // Collect all (letter, lineIdx) pairs.
    const lines = text.split('\n');
    const seen = [];
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp(OPTION_LABEL_RE.source, 'g');
      for (const m of lines[i].matchAll(re)) {
        seen.push({ letter: m[1], line: i + 1 });
      }
    }
    if (seen.length === 0) continue;
    // Build the set of letters present in the file. For each letter > A,
    // require all earlier letters (A..letter-1) to be present.
    const letters = new Set(seen.map((s) => s.letter));
    for (const s of seen) {
      const code = s.letter.charCodeAt(0);
      for (let c = 'A'.charCodeAt(0); c < code; c++) {
        const earlier = String.fromCharCode(c);
        if (!letters.has(earlier)) {
          violations.push({
            invariant: 'option-pair-completeness',
            file: path.relative(PROJECT_ROOT, file),
            line: s.line,
            reason: `Option ${s.letter} appears without preceding Option ${earlier}`,
            detail: `dangling Option ${s.letter} on line ${s.line}; no Option ${earlier} anchor in same file`,
            suggestion: `add an Option ${earlier} block above, or rename to a single-path label (e.g., "Fallback Path")`,
          });
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 15: step-cross-reference (Quick 260508-syv) ──────────────────

const STEP_LIST_RE = /^\s*(\d+)\.\s+/;
const STEP_REF_RE = /\bstep\s+(\d+)\b/gi;

/**
 * For every `step N` reference in a command body, parse the document into
 * numbered list steps and assert that step N exists. HARD-FAIL on broken
 * cross-reference. Content-claim mismatch is deferred to future work.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkStepCrossReference({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    // Build the set of numbered step IDs that appear as `^\s*N\.\s+`. We
    // accept any 1-N as a valid step id — collect the union.
    const validSteps = new Set();
    for (const line of lines) {
      const m = STEP_LIST_RE.exec(line);
      if (m) validSteps.add(parseInt(m[1], 10));
    }
    if (validSteps.size === 0) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip the line itself if it's a numbered step heading.
      if (STEP_LIST_RE.test(line)) continue;
      const re = new RegExp(STEP_REF_RE.source, STEP_REF_RE.flags);
      for (const m of line.matchAll(re)) {
        const ref = parseInt(m[1], 10);
        if (validSteps.has(ref)) continue;
        violations.push({
          invariant: 'step-cross-reference',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `step ${ref} reference does not resolve to any numbered step in this file`,
          detail: `"step ${ref}" cited on line ${i + 1}; max step in file is ${Math.max(...validSteps)}`,
          suggestion: `correct the cross-reference to an existing step (1..${Math.max(...validSteps)})`,
        });
      }
    }
  }
  return violations;
}

// ─── Invariant 16: stop-code-existence (Quick 260508-u72 INV-A) ─────────────

// Generic halt-style words that surface in `## Stop Conditions` blocks but
// do NOT correspond to a specific enumerated error code in any script. These
// are descriptive, not enumerated, and must not be flagged.
const STOP_CODE_GENERIC_ALLOWLIST = new Set([
  'STOP',
  'HALT',
  'ERROR',
  'OK',
  'FAIL',
  'EXIT',
  'CRITICAL',
  'WARNING',
  'INFO',
  'NONE',
  'TODO',
  'NOTE',
  'JSON',
  'JSONL',
  'YAML',
  'NULL',
  'UNDEFINED',
  'TRUE',
  'FALSE',
  // POSIX errno codes that surface from Node fs operations — these are
  // emitted by the runtime, not the script, and the script does not define
  // them as throw-strings.
  'EACCES',
  'EROFS',
  'ENOENT',
  'EEXIST',
  'EISDIR',
  'ENOTDIR',
  'EPERM',
  'EBUSY',
  'EMFILE',
]);

// Tokens are extracted ONLY when backtick-wrapped (e.g., `WORKSPACE_MISSING`)
// — that's the convention for citing an enumerated error code in command
// bodies. Bare-prose uppercase words (REFUSE, TESTATLAS, START, BEFORE, …)
// and HTML-comment marker names (TESTATLAS:GENERATED) are NOT codes. The
// backtick gate eliminates the noisy false-positive class.
const STOP_CODE_TOKEN_RE = /`([A-Z][A-Z0-9_]{4,})`/g;

/**
 * Parse `## Stop Conditions` blocks for uppercase enum-style error codes
 * (e.g., WORKSPACE_MISSING, BACKUP_FAILED). For each code, verify it appears
 * in the source of at least one script invoked in the same command body
 * (`node .testatlas/scripts/<x>.js`). Codes that exist in NO referenced
 * script are flagged as fictional.
 *
 * Conservative — only triggers when:
 *   1. A `## Stop Conditions` (level 1 or 2) heading exists.
 *   2. The token matches the enum shape (≥5 chars, uppercase + digits + _).
 *   3. The token is not on the generic allowlist (STOP/HALT/ERROR/etc).
 *   4. The body contains at least one `node .testatlas/scripts/<x>.js`
 *      invocation (otherwise the check cannot resolve and is silently skipped).
 *
 * @param {{commandsDir:string, scriptsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkStopCodeExistence({ commandsDir, scriptsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  // Cache: scriptName → string source (or null if missing/unreadable)
  const scriptSrcCache = new Map();
  async function loadScript(name) {
    if (scriptSrcCache.has(name)) return scriptSrcCache.get(name);
    let src = null;
    try {
      src = await readFile(path.join(scriptsDir, `${name}.js`), 'utf8');
    } catch {
      src = null;
    }
    scriptSrcCache.set(name, src);
    return src;
  }
  const SCRIPT_INVOKE_RE = /\bnode\s+\.testatlas\/scripts\/([\w-]+)\.js\b/g;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    // Locate `## Stop Conditions` (or `# Stop Conditions`) heading.
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,2}\s+Stop\s+Conditions\s*$/i.test(lines[i])) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) continue;
    // Section ends at next H1/H2 heading.
    let endLine = lines.length;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (/^#{1,2}\s+\S/.test(lines[i])) {
        endLine = i;
        break;
      }
    }
    // Collect all script invocations in the body (any section).
    const referencedScripts = new Set();
    {
      const re = new RegExp(SCRIPT_INVOKE_RE.source, 'g');
      for (const m of text.matchAll(re)) referencedScripts.add(m[1]);
    }
    if (referencedScripts.size === 0) continue;
    // Load each referenced script's source — combined haystack.
    let combined = '';
    for (const name of referencedScripts) {
      const src = await loadScript(name);
      if (src) combined += `\n${src}`;
    }
    if (combined.length === 0) continue;
    // For each enum-shaped token in the section, verify presence in haystack.
    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i];
      const tokens = new Set();
      const re = new RegExp(STOP_CODE_TOKEN_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const tok = m[1];
        if (STOP_CODE_GENERIC_ALLOWLIST.has(tok)) continue;
        tokens.add(tok);
      }
      for (const code of tokens) {
        // Look for the code as a string-literal anywhere in the haystack
        // (within throw new Error / return { code } / err.code = '<X>' /
        // code: '<X>' / status: '<X>'). The simplest robust match is the
        // token-as-substring with word-boundary; scripts use it as a string.
        const codeRe = new RegExp(`\\b${code}\\b`);
        if (codeRe.test(combined)) continue;
        violations.push({
          invariant: 'stop-code-existence',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `stop code "${code}" not found in any referenced script`,
          detail: `${code} cited in ## Stop Conditions but absent from sources of scripts: ${[...referencedScripts].sort().join(', ')}`,
          suggestion: `verify against actual throw/return statements; remove the citation if fictional, or align the script to emit the code`,
        });
      }
    }
  }
  return violations;
}

// ─── Invariant 17: outputs-vs-required-actions (Quick 260508-u72 INV-B) ─────

// Capture `_testatlas/<path>` references with backtick or bare form. The
// regex stops at whitespace, backtick, paren, or quote — capturing the path
// portion. We allow a trailing punctuation strip via a post-process.
const TESTATLAS_PATH_RE = /_testatlas\/[\w./_-]+/g;

/**
 * Extract a section's body lines by H2 heading name (case-insensitive,
 * exact match on the heading text). Returns `null` if not found.
 *
 * @param {string} text full file contents
 * @param {string} heading e.g. "Required Actions"
 * @returns {{startLine:number,endLine:number,body:string,lines:string[]}|null}
 */
function extractH2Section(text, heading) {
  const lines = text.split('\n');
  const headRe = new RegExp(`^#{1,2}\\s+${heading}\\s*$`, 'i');
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headRe.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) return null;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+\S/.test(lines[i])) {
      endLine = i;
      break;
    }
  }
  return {
    startLine,
    endLine,
    body: lines.slice(startLine + 1, endLine).join('\n'),
    lines: lines.slice(startLine + 1, endLine),
  };
}

// Write-verb cues that signal a line is asserting a write of the cited
// path. Conservative gate — only paths in a write-verb context count as
// "Required Actions wrote X". Anything else is treated as a read/reference.
const WRITE_VERB_RE =
  /\b(write|writes|written|append|appends|appended|emit|emits|emitted|update|updates|updated|create|creates|created|produce|produces|produced|generate|generates|generated|render|renders|rendered|persist|persists|persisted|save|saves|saved|output|outputs|store|stores|stored|bump|bumps|recompute|recomputes|increment|increments|publish|publishes)\b/i;

// Read-verb cues that mark a line as input-only (Read / Open / See / Load /
// for-each-loop). Even if a write-verb appears nearby, a read-verb cue on the
// same line takes precedence — these are inputs, not outputs.
const READ_VERB_RE =
  /\b(read|reads|open|opens|see|load|loads|for\s+each|input|consume|consumes|cross-?reference|consult|reference|inspect|verify|check)\b/i;

/**
 * Collect every `_testatlas/...` path in a section that is in a clear
 * write-verb context. Returns each occurrence with its file-line and a
 * deferred flag.
 *
 * Conservative — skips
 *   - directory references (path ends in `/`)
 *   - JSON-property paths (strips to the file portion)
 *   - lines without a write-verb cue OR with a read-verb cue
 *   - non-content extensions (only .json/.jsonl/.md/.txt/.yml/.yaml count)
 *
 * @param {{startLine:number, lines:string[]}} section as returned by extractH2Section
 * @param {{writeOnly:boolean}} [opts] — if true, only return paths in write-verb context
 * @returns {Array<{path:string,line:number,deferred:boolean}>}
 */
function collectTestatlasPaths(section, { writeOnly = false } = {}) {
  if (!section) return [];
  const out = [];
  for (let i = 0; i < section.lines.length; i++) {
    const line = section.lines[i];
    const deferred = /<!--\s*output-deferred\s*:[^>]*-->/i.test(line);
    if (writeOnly) {
      const isRead = READ_VERB_RE.test(line);
      const isWrite = WRITE_VERB_RE.test(line);
      // If line is read-only or has no write verb, skip.
      if (isRead || !isWrite) continue;
    }
    const re = new RegExp(TESTATLAS_PATH_RE.source, 'g');
    for (const m of line.matchAll(re)) {
      let p = m[0];
      p = p.replace(/[.,;:)\]]+$/, '');
      const fileSuffixMatch = p.match(
        /^(_testatlas\/[\w./_-]+?\.(?:json|jsonl|md|txt|yml|yaml))(?:\.[\w_-]+)?$/,
      );
      if (fileSuffixMatch) p = fileSuffixMatch[1];
      if (p.endsWith('/')) continue;
      if (!/\.(?:json|jsonl|md|txt|yml|yaml)$/.test(p)) continue;
      out.push({
        path: p,
        line: section.startLine + 1 + i + 1,
        deferred,
      });
    }
  }
  return out;
}

/**
 * Within each command body, every `_testatlas/...` path that appears in
 * `## Required Actions` MUST also appear in `## Outputs` (or carry an
 * `<!-- output-deferred: <reason> -->` marker on the same line).
 *
 * Skipped when either section is absent — structural-section presence is
 * out-of-scope for INV-B (other invariants own that).
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkOutputsVsRequiredActions({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const requiredSection = extractH2Section(text, 'Required Actions');
    const outputsSection = extractH2Section(text, 'Outputs');
    if (!requiredSection || !outputsSection) continue;
    // Required Actions: only paths in write-verb context count as outputs.
    // Outputs section: any path is an output (it's a list, not prose).
    const requiredPaths = collectTestatlasPaths(requiredSection, { writeOnly: true });
    const outputPaths = collectTestatlasPaths(outputsSection, { writeOnly: false });
    if (requiredPaths.length === 0) continue;
    const outputSet = new Set(outputPaths.map((o) => o.path));
    // De-duplicate by path within Required Actions — only emit one
    // violation per missing path even if it's mentioned multiple times.
    const seen = new Set();
    for (const r of requiredPaths) {
      if (r.deferred) continue;
      if (outputSet.has(r.path)) continue;
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      violations.push({
        invariant: 'outputs-missing-path',
        file: path.relative(PROJECT_ROOT, file),
        line: r.line,
        reason: `Required Actions writes ${r.path} but Outputs section omits it`,
        detail: `${r.path} cited in ## Required Actions; not present in ## Outputs (and no <!-- output-deferred: ... --> marker)`,
        suggestion: `append ${r.path} to ## Outputs (or annotate with <!-- output-deferred: <reason> -->)`,
      });
    }
  }
  return violations;
}

// ─── Invariant 18: numerical-claim-vs-script (Quick 260508-u72 INV-C) ───────

// Pattern: `<n> JSON + <m> JSONL = <total>` (or " = <total>" omitted; or
// "checks N artifacts/schemas/files"). High-confidence-only — we only flag
// when at least one referenced script defines a static `[ ... ]` array
// literal whose length we can extract.
const NUM_CLAIM_RE_PAIR = /(\d+)\s*JSON\s*\+\s*(\d+)\s*JSONL(?:\s*=\s*(\d+))?/g;
const NUM_CLAIM_RE_CHECKS = /\bchecks\s+(\d+)\s+(?:artifacts|schemas|files)\b/gi;

/**
 * Parse a script source for arrays of brain-file constants.
 *
 * Heuristic — find lines like `const REQUIRED_JSON_FILES = [ ... ]` (or
 * `JSON_FILES`, `BRAIN_JSON_FILES`, etc.) and `..._JSONL_FILES = [...]`.
 * Returns `{ jsonCount, jsonlCount }` only when both arrays are
 * statically determinable (the regex captures a balanced literal). When
 * indeterminate, returns `null` (caller silently skips — no flag).
 *
 * @param {string} src
 * @returns {{ jsonCount:number, jsonlCount:number }|null}
 */
function staticBrainFileCounts(src) {
  function arrayLen(name) {
    const re = new RegExp(`\\b${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
    const m = re.exec(src);
    if (!m) return null;
    const body = m[1];
    // Sanity — must look like a literal array of strings (no nested brackets,
    // no `await`, no template literals; commas separate strings).
    if (/[[\]]|\bawait\b|\$\{/.test(body)) return null;
    // Count single/double/backtick-quoted strings.
    const items = [...body.matchAll(/['"`][^'"`]*['"`]/g)];
    if (items.length === 0) return null;
    return items.length;
  }
  const candidatesJson = ['REQUIRED_JSON_FILES', 'BRAIN_JSON_FILES', 'JSON_FILES'];
  const candidatesJsonl = ['REQUIRED_JSONL_FILES', 'BRAIN_JSONL_FILES', 'JSONL_FILES'];
  let jsonCount = null;
  for (const c of candidatesJson) {
    const n = arrayLen(c);
    if (n !== null) {
      jsonCount = n;
      break;
    }
  }
  let jsonlCount = null;
  for (const c of candidatesJsonl) {
    const n = arrayLen(c);
    if (n !== null) {
      jsonlCount = n;
      break;
    }
  }
  if (jsonCount === null || jsonlCount === null) return null;
  return { jsonCount, jsonlCount };
}

/**
 * High-confidence linter for numerical drift between command-body claims
 * and the cited script's static array lengths. Specifically:
 *   - "<n> JSON + <m> JSONL = <total>" must match the union of static
 *     arrays in any referenced script.
 *   - "checks <N> artifacts/schemas/files" must match the total of those
 *     same arrays.
 *
 * Only fires when the script's array length is statically determinable.
 * Lines carrying `<!-- count-not-verified: <reason> -->` are skipped.
 *
 * @param {{commandsDir:string, scriptsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkNumericalClaimVsScript({ commandsDir, scriptsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  const SCRIPT_INVOKE_RE = /\bnode\s+\.testatlas\/scripts\/([\w-]+)\.js\b/g;
  // Cache: scriptName → static counts | null
  const cache = new Map();
  async function counts(name) {
    if (cache.has(name)) return cache.get(name);
    let result = null;
    try {
      const src = await readFile(path.join(scriptsDir, `${name}.js`), 'utf8');
      result = staticBrainFileCounts(src);
    } catch {
      result = null;
    }
    cache.set(name, result);
    return result;
  }
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    // Collect referenced scripts (any section).
    const refs = new Set();
    {
      const re = new RegExp(SCRIPT_INVOKE_RE.source, 'g');
      for (const m of text.matchAll(re)) refs.add(m[1]);
    }
    if (refs.size === 0) continue;
    // Resolve to first script with statically-known counts. If none, skip.
    let truth = null;
    let truthScript = null;
    for (const name of refs) {
      const c = await counts(name);
      if (c) {
        truth = c;
        truthScript = name;
        break;
      }
    }
    if (!truth) continue;
    // Walk lines for claim patterns.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<!--\s*count-not-verified\s*:[^>]*-->/i.test(line)) continue;
      // Pair pattern: "n JSON + m JSONL [ = total ]"
      {
        const re = new RegExp(NUM_CLAIM_RE_PAIR.source, 'g');
        for (const m of line.matchAll(re)) {
          const j = parseInt(m[1], 10);
          const jl = parseInt(m[2], 10);
          const total = m[3] != null ? parseInt(m[3], 10) : null;
          const okJ = j === truth.jsonCount;
          const okJL = jl === truth.jsonlCount;
          const okTotal = total == null || total === truth.jsonCount + truth.jsonlCount;
          if (okJ && okJL && okTotal) continue;
          violations.push({
            invariant: 'numerical-claim-mismatch',
            file: path.relative(PROJECT_ROOT, file),
            line: i + 1,
            reason: `numerical claim "${j} JSON + ${jl} JSONL${total != null ? ` = ${total}` : ''}" diverges from script truth (${truth.jsonCount} JSON + ${truth.jsonlCount} JSONL = ${truth.jsonCount + truth.jsonlCount})`,
            detail: `script ${truthScript}.js defines ${truth.jsonCount} JSON + ${truth.jsonlCount} JSONL static array entries`,
            suggestion: `align doc to ${truth.jsonCount} JSON + ${truth.jsonlCount} JSONL = ${truth.jsonCount + truth.jsonlCount}, OR mark with <!-- count-not-verified: <reason> -->`,
          });
        }
      }
      // Checks pattern: "checks N artifacts"
      {
        const re = new RegExp(NUM_CLAIM_RE_CHECKS.source, NUM_CLAIM_RE_CHECKS.flags);
        for (const m of line.matchAll(re)) {
          const n = parseInt(m[1], 10);
          const expected = truth.jsonCount + truth.jsonlCount;
          if (n === expected) continue;
          violations.push({
            invariant: 'numerical-claim-mismatch',
            file: path.relative(PROJECT_ROOT, file),
            line: i + 1,
            reason: `claim "checks ${n} artifacts" diverges from script truth (${expected})`,
            detail: `script ${truthScript}.js defines ${expected} static artifact entries`,
            suggestion: `align doc to ${expected}, OR mark with <!-- count-not-verified: <reason> -->`,
          });
        }
      }
    }
  }
  return violations;
}

// ─── Invariant 19: capability-stopcondition-contradiction (u72 INV-D) ───────

// Cues that signal the section is talking about a capability behavior.
// "halt" / "halts" / "halting" → stop-condition outcome
// "degrade" / "degrades" / "fall back" / "skip if missing" → degrade outcome
const HALT_VERB_RE = /\b(halt|halts|halted|halting|abort|aborts|aborted|stop|stops|stopped)\b/i;
const DEGRADE_VERB_RE =
  /\b(degrade|degrades|degraded|fall\s*back|fallback|fall\s*through|skip|skips|skipped|tolerated|tolerate|continues?\s*without)\b/i;

/**
 * Per command body, scan `## Capability Degradation` for capability tokens
 * appearing in degrade-verb context, and `## Stop Conditions` for the same
 * capability tokens in halt-verb context. If a capability appears in BOTH
 * with the contradictory verb pair, emit a violation.
 *
 * Capability vocabulary is sourced from
 * `vocabulary.schema.json $defs.capability.enum`.
 *
 * @param {{commandsDir:string, schemasDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkCapabilityStopNonContradiction({ commandsDir, schemasDir }) {
  const violations = [];
  // Load capability vocabulary.
  let caps = [];
  try {
    const vocab = JSON.parse(
      await readFile(path.join(schemasDir, 'vocabulary.schema.json'), 'utf8'),
    );
    caps = vocab?.$defs?.capability?.enum ?? [];
  } catch {
    return violations;
  }
  if (!Array.isArray(caps) || caps.length === 0) return violations;
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const capSec = extractH2Section(text, 'Capability Degradation');
    const stopSec = extractH2Section(text, 'Stop Conditions');
    if (!capSec || !stopSec) continue;
    for (const cap of caps) {
      // Word-boundary regex — match the capability as a whole token only.
      // Allow optional surrounding backticks for `shell` etc.
      const capRe = new RegExp(`(?:\\b|\`)${cap.replace(/[-/]/g, '[-/]?')}(?:\\b|\`)`, 'i');
      // Find lines in each section that mention the capability.
      let degradeLine = -1;
      for (let i = 0; i < capSec.lines.length; i++) {
        const line = capSec.lines[i];
        if (capRe.test(line) && DEGRADE_VERB_RE.test(line)) {
          degradeLine = capSec.startLine + 1 + i + 1;
          break;
        }
      }
      let haltLine = -1;
      for (let i = 0; i < stopSec.lines.length; i++) {
        const line = stopSec.lines[i];
        if (!capRe.test(line)) continue;
        if (!HALT_VERB_RE.test(line)) continue;
        // Skip negated halt verbs ("do NOT halt", "not a halt", "never halt").
        if (/\b(do\s*not|don't|never|not\s+a)\s+halt/i.test(line)) continue;
        // Skip lines that also explicitly degrade for the same capability —
        // those are degrade outcomes phrased in negative-halt form.
        if (DEGRADE_VERB_RE.test(line)) continue;
        haltLine = stopSec.startLine + 1 + i + 1;
        break;
      }
      if (degradeLine !== -1 && haltLine !== -1) {
        violations.push({
          invariant: 'capability-stopcondition-contradiction',
          file: path.relative(PROJECT_ROOT, file),
          line: haltLine,
          reason: `capability "${cap}" appears in both ## Capability Degradation (line ${degradeLine}) and ## Stop Conditions (line ${haltLine})`,
          detail: `degrade verb on L${degradeLine}; halt verb on L${haltLine} — internal contradiction`,
          suggestion: `pick ONE outcome — either degrade or halt — for missing ${cap}; remove the other or qualify with a precondition`,
        });
      }
    }
  }
  return violations;
}

// ─── Invariant 20: mcp-tool-param-validity (Quick 260508-u72 INV-E) ─────────

// Map bare tool name → namespaced catalog key. Real-world command bodies
// cite the bare form (e.g., `wait_for({text:[...]})`); the catalog uses the
// canonical namespaced form (`mcp__chrome-devtools__wait_for`).
const MCP_BARE_TO_NAMESPACED = (() => {
  const out = new Map();
  for (const k of Object.keys(MCP_TOOL_CATALOG)) {
    const bare = k.replace(/^mcp__chrome-devtools__/, '');
    out.set(bare, k);
  }
  return out;
})();

// Tool-call pattern: `<tool>({<param>: ..., <param2>: ..., ...})`
//   - tool name must be a known bare form (we restrict to catalogued tools
//     to keep the matcher cheap; uncatalogued tools are lenient anyway)
//   - object literal body captured non-greedily; param keys parsed by a
//     follow-up regex
const MCP_CALL_RE = /\b([a-z][a-z0-9_]*)\s*\(\s*\{([^}]*)\}/g;
const MCP_PARAM_KEY_RE = /(?:^|[\s,{])([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/g;

/**
 * Scan command bodies for `<tool>({...})` invocations of catalogued
 * mcp__chrome-devtools__* tools; flag invalid params (params not in the
 * catalog's allowlist for that tool). Tools NOT in the catalog are silently
 * passed.
 *
 * Both inline backtick and code-fence contexts are scanned.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkMcpToolParamValidity({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const re = new RegExp(MCP_CALL_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const tool = m[1];
        const body = m[2];
        const namespaced = MCP_BARE_TO_NAMESPACED.get(tool);
        if (!namespaced) continue; // uncatalogued — lenient skip
        const entry = MCP_TOOL_CATALOG[namespaced];
        const allowed = new Set(entry.params);
        // Extract param keys from the object literal.
        const keys = new Set();
        const kre = new RegExp(MCP_PARAM_KEY_RE.source, 'g');
        for (const km of body.matchAll(kre)) keys.add(km[1]);
        const invalid = [...keys].filter((k) => !allowed.has(k));
        if (invalid.length === 0) continue;
        violations.push({
          invariant: 'mcp-tool-param-invalid',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `${tool} does not accept params: ${invalid.join(', ')}`,
          detail: `${namespaced} catalog: { ${entry.params.join(', ')} }`,
          suggestion: `valid params are ${entry.params.join(', ')}; remove ${invalid.join(', ')} or update scripts/lib/mcp-tool-catalog.js if upstream added them`,
        });
      }
      // Note: bare-token form `tool(<arg>)` (e.g. `click(submit)`) is
      // intentionally NOT linted — corpus convention uses these as
      // pseudocode placeholders, not literal param-value claims. Only the
      // object-literal form `tool({<param>: ...})` is checked.
    }
  }
  return violations;
}

// ─── Invariant 21: duplicate-section-headings (Quick 260508-u72 INV-F) ──────

/**
 * Any `^## <heading>$` heading (case-insensitive on the text after `## `)
 * appearing more than once in the same file is a HARD-FAIL. Generalizes
 * the Round-11 `lifecycle-heading-strict` invariant — the latter remains
 * registered for the alias-rename rule (e.g., `## Post-Operation Brain
 * Update` -> `## Lifecycle`) but no longer covers H2-duplication, which
 * is owned by INV-F.
 *
 * H3+ headings are NOT included — only level-2 (`## `) duplication is
 * structurally meaningful for command bodies.
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkDuplicateSectionHeadings({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    const seen = new Map(); // headingTextLower → first 1-based line
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^##\s+(.+?)\s*$/);
      if (!m) continue;
      const key = m[1].toLowerCase().trim();
      if (seen.has(key)) {
        violations.push({
          invariant: 'duplicate-section-heading',
          file: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          reason: `## ${m[1]} appears more than once (first at line ${seen.get(key)})`,
          detail: `H2 heading "${m[1]}" duplicated at L${i + 1} (first appearance L${seen.get(key)})`,
          suggestion: `merge the two sections into one, OR rename one to a distinct heading`,
        });
      } else {
        seen.set(key, i + 1);
      }
    }
  }
  return violations;
}

// ─── INV-H: missing-canonical-section (Round-13 follow-up, Quick 260508-u72) ─

/**
 * Every command body MUST have a `## Lifecycle` H2 section. The earlier
 * `lifecycle-heading-strict` invariant (Quick 260508-syv) only catches
 * misnamed lifecycle headings; if the section is **absent entirely**,
 * that invariant emits no violation. INV-H closes that gap.
 *
 * Allow opt-out via `<!-- no-lifecycle: <reason> -->` placed anywhere in
 * the file body (e.g., for read-only documentation surfaces with no
 * brain-write side-effects).
 *
 * @param {{commandsDir:string}} ctx
 * @returns {Promise<Array<Violation>>}
 */
export async function checkMissingCanonicalSection({ commandsDir }) {
  const violations = [];
  const cmdFiles = await listMarkdownFiles(commandsDir);
  const OPT_OUT_RE = /<!--\s*no-lifecycle\s*:[^>]*-->/i;
  // H2-only: `## Lifecycle` (case-insensitive, trailing whitespace tolerated).
  const LIFECYCLE_H2_RE = /^##\s+Lifecycle\s*$/i;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    if (OPT_OUT_RE.test(text)) continue;
    const lines = text.split('\n');
    let found = false;
    for (const line of lines) {
      if (LIFECYCLE_H2_RE.test(line)) {
        found = true;
        break;
      }
    }
    if (!found) {
      violations.push({
        invariant: 'missing-canonical-section',
        file: path.relative(PROJECT_ROOT, file),
        line: 1,
        reason: 'command body has no `## Lifecycle` H2 section',
        detail:
          'Every command MUST declare a `## Lifecycle` section (H2) describing its post-run brain-update behavior. Absence indicates the command body lost or never had its lifecycle contract.',
        suggestion:
          'add a `## Lifecycle` H2 with the canonical brain-update hook, OR annotate the file with `<!-- no-lifecycle: <reason> -->` for legitimate read-only doc surfaces',
      });
    }
  }
  return violations;
}

// ─── Audit-manifest mode (Quick 260508-syv) ─────────────────────────────────

/**
 * Walk every command body, extract every claim, attempt resolution against
 * ground truth, and write a single JSON file at `outPath` with the
 * documented manifest shape.
 *
 * Resolution is non-blocking — `emitManifest` does not throw on unresolved
 * claims; it just records `resolution: "missing" | "unresolved"`.
 *
 * @param {{
 *   commandsDir:string,
 *   scriptsDir:string,
 *   schemasDir:string,
 *   configKeys?:Set<string>,
 *   schemaFiles?:Set<string>,
 *   vocabEnums?:Object<string,Set<string>>,
 *   outPath:string,
 * }} ctx
 * @returns {Promise<{summary:object, commands:object}>}
 */
export async function emitManifest(ctx) {
  const { commandsDir, scriptsDir, schemasDir, configKeys, schemaFiles, vocabEnums, outPath } = ctx;
  const knownSchemas = schemaFiles ?? getSchemaFiles({ schemasDir });
  const knownConfigKeys = configKeys ?? getConfigKeys();
  const knownVocab =
    vocabEnums ?? getVocabEnums({ vocabPath: path.join(schemasDir, 'vocabulary.schema.json') });
  const cmdFiles = await listMarkdownFiles(commandsDir);
  const commands = {};
  let extracted = 0;
  let resolved = 0;
  for (const file of cmdFiles) {
    const text = await readFile(file, 'utf8');
    const claims = await extractClaims({
      file,
      text,
      scriptsDir,
      knownSchemas,
      knownConfigKeys,
      knownVocab,
    });
    for (const c of claims) {
      extracted += 1;
      if (c.resolution === 'valid') resolved += 1;
    }
    const rel = path.relative(commandsDir, file);
    commands[rel] = { claims };
  }
  const unresolved = extracted - resolved;
  const rate = extracted === 0 ? '100%' : `${((resolved / extracted) * 100).toFixed(1)}%`;
  const manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    summary: {
      commands_scanned: cmdFiles.length,
      claims_extracted: extracted,
      claims_resolved: resolved,
      claims_unresolved: unresolved,
      resolution_rate: rate,
    },
    commands,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/**
 * Extract every claim per command body. Returns array of
 * `{type, value, location, resolution}`.
 *
 * @param {{file:string, text:string, scriptsDir:string, knownSchemas:Set<string>, knownConfigKeys:Set<string>, knownVocab:Object<string,Set<string>>}} ctx
 * @returns {Promise<Array<{type:string,value:string,location:string,resolution:string}>>}
 */
async function extractClaims({
  file: _file,
  text,
  scriptsDir,
  knownSchemas,
  knownConfigKeys,
  knownVocab,
}) {
  const claims = [];
  const lines = text.split('\n');
  // Cache for script-file existence.
  const scriptExists = new Map();
  async function existsScript(name) {
    if (scriptExists.has(name)) return scriptExists.get(name);
    let ok = false;
    try {
      await stat(path.join(scriptsDir, `${name}.js`));
      ok = true;
    } catch {
      ok = false;
    }
    scriptExists.set(name, ok);
    return ok;
  }
  const SCRIPT_INVOKE_RE = /\bnode\s+\.testatlas\/scripts\/([\w-]+)\.js\b([^\n`]*)/g;
  const SLASH_CMD_RE = /(?:^|\s)(\/atlas:[\w/-]+)/g;
  const MCP_TOOL_RE = /\b(chrome-devtools|context7|serena|playwright|brain)[:.]([\w_]+)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const loc = `L${i + 1}`;
    // script-invocation + script-flag claims
    {
      const re = new RegExp(SCRIPT_INVOKE_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const scriptName = m[1];
        const ok = await existsScript(scriptName);
        claims.push({
          type: 'script-invocation',
          value: `${scriptName}.js`,
          location: loc,
          resolution: ok ? 'valid' : 'missing',
        });
        const flagsBlob = m[2] || '';
        for (const fm of flagsBlob.matchAll(/(--[\w][\w-]*)/g)) {
          claims.push({
            type: 'script-flag',
            value: `${scriptName}.js ${fm[1]}`,
            location: loc,
            resolution: 'unresolved', // future: resolve via flag-existence map
          });
        }
      }
    }
    // schema-file claims
    {
      const re = new RegExp(SCHEMA_REF_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        const ref = m[1];
        if (SCHEMA_REF_ALLOWLIST.has(ref)) continue;
        claims.push({
          type: 'schema-file',
          value: ref,
          location: loc,
          resolution: knownSchemas.has(ref) ? 'valid' : 'missing',
        });
      }
    }
    // map-path claims
    {
      const re = new RegExp(MAP_PATH_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        claims.push({
          type: 'map-path',
          value: `_testatlas/maps/${m[1]}.json`,
          location: loc,
          resolution: 'valid', // syntactic-form check only at this layer
        });
      }
    }
    // vocab-enum-value claims (status / severity / confidence)
    for (const p of VOCAB_LITERAL_PATTERNS) {
      const set = knownVocab?.[p.enum];
      if (!set) continue;
      const re = new RegExp(p.re.source, p.re.flags);
      for (const m of line.matchAll(re)) {
        const lit = m[1];
        if (!lit || VOCAB_LITERAL_IGNORE.has(lit)) continue;
        const allowed = set instanceof Set ? set : new Set(set);
        claims.push({
          type: 'vocab-enum-value',
          value: `${p.enum}:${lit}`,
          location: loc,
          resolution: allowed.has(lit) ? 'valid' : 'missing',
        });
      }
    }
    // config-key claims
    for (const proto of CONFIG_KEY_HINT_RES) {
      const re = new RegExp(proto.source, proto.flags);
      for (const m of line.matchAll(re)) {
        const k = m[1];
        if (!k) continue;
        claims.push({
          type: 'config-key',
          value: k,
          location: loc,
          resolution: knownConfigKeys.has(k) ? 'valid' : 'missing',
        });
      }
    }
    // slash-command references
    {
      const re = new RegExp(SLASH_CMD_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        claims.push({
          type: 'slash-command',
          value: m[1],
          location: loc,
          resolution: 'unresolved', // resolver deferred; emit for retro-resolution
        });
      }
    }
    // step-cross-reference claims (recorded; resolution computed per file)
    {
      const re = new RegExp(STEP_REF_RE.source, STEP_REF_RE.flags);
      for (const m of line.matchAll(re)) {
        claims.push({
          type: 'step-cross-reference',
          value: `step ${m[1]}`,
          location: loc,
          resolution: 'unresolved', // checked by invariant 15; manifest records raw
        });
      }
    }
    // mcp-tool claims (deferred resolver per CONTEXT.md)
    {
      const re = new RegExp(MCP_TOOL_RE.source, 'g');
      for (const m of line.matchAll(re)) {
        claims.push({
          type: 'mcp-tool',
          value: `${m[1]}:${m[2]}`,
          location: loc,
          resolution: 'unresolved',
        });
      }
    }
  }
  return claims;
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
    () => checkRequiredFlags({ commandsDir }),
    () => checkEnumValueValidity({ commandsDir }),
    () => checkPathCanonicity({ commandsDir, canonicalPaths }),
    () => checkSchemaKeyExistence({ commandsDir, schemasDir }),
    () => checkLifecycleCompleteness({ commandsDir }),
    () => checkFrontmatterScriptForm({ commandsDir }),
    () => checkVocabEnumDrift({ commandsDir, schemasDir }),
    () => checkLifecyclePosition({ commandsDir }),
    // Round-11 (Quick 260508-syv) — 8 new invariants:
    () => checkSchemaFileExistence({ commandsDir, schemasDir }),
    () => checkMapsPathConsistency({ commandsDir }),
    () => checkVocabularyEnumPresence({ commandsDir, schemasDir }),
    () => checkBareScriptPath({ commandsDir }),
    () => checkLifecycleHeadingStrict({ commandsDir }),
    () => checkConfigKeyExistence({ commandsDir }),
    () => checkOptionPairCompleteness({ commandsDir }),
    () => checkStepCrossReference({ commandsDir }),
    // Round-12 (Quick 260508-u72) — 7 new invariants:
    () => checkStopCodeExistence({ commandsDir, scriptsDir }),
    () => checkOutputsVsRequiredActions({ commandsDir }),
    () => checkNumericalClaimVsScript({ commandsDir, scriptsDir }),
    () => checkCapabilityStopNonContradiction({ commandsDir, schemasDir }),
    () => checkMcpToolParamValidity({ commandsDir }),
    () => checkDuplicateSectionHeadings({ commandsDir }),
    // Round-13 follow-up (Quick 260508-u72) — 4 new invariants:
    () => checkMissingCanonicalSection({ commandsDir }),
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
    } else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md') {
      // README.md mirrors scripts/lib/list-command-files.js — it is suite
      // documentation, not a canonical command body, so exclude from lint.
      out.push(full);
    }
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/lint-commands.js [options]

Doc-vs-truth invariant linter for .testatlas/commands/**/*.md.

Invariants:
  1   flag-existence            (HARD) every cited --flag is a real argv flag
  1.1 flag-completeness         (HARD) every required flag is present (rqx)
  1.2 enum-value-validity       (HARD) literal value is in script's enum (rqx)
  2   path-canonicity           (HARD) no anti-pattern _testatlas/ paths
  3   schema-key-existence      (HARD) every counts.<key> exists in schema
  4   lifecycle-completeness    (HARD) brain-writers call update-brain
  5   frontmatter-script-form   (HARD) no bare scripts/ in frontmatter
  6   vocab-enum-drift          (HARD) doc lists are subsets of vocab enums (rqx)
  7   lifecycle-position        (HARD) ## Lifecycle precedes brain-update hook (rqx)
  8   schema-file-existence     (HARD) referenced .schema.json file exists (syv)
  9   maps-path-consistency     (HARD) intra-doc map names consistent (syv)
  10  vocabulary-enum-presence  (HARD) status/severity literals in vocab enum (syv)
  11  bare-script-path          (HARD) no bare scripts/ in body prose (syv)
  12  lifecycle-heading-strict  (HARD) heading is exactly \`## Lifecycle\` (syv)
  13  config-key-existence      (HARD) cited config keys exist in default.config.json (syv)
  14  option-pair-completeness  (HARD) Option B implies Option A precedes (syv)
  15  step-cross-reference      (HARD) "step N" references resolve (syv)
  16  stop-code-existence       (HARD) ## Stop Conditions codes exist in script (u72)
  17  outputs-vs-required-actions (HARD) Required Actions paths covered in Outputs (u72)
  18  numerical-claim-vs-script (HARD) "<n> JSON + <m> JSONL" matches script arrays (u72)
  19  capability-stopcondition-contradiction (HARD) capability isn't both degraded+halted (u72)
  20  mcp-tool-param-invalid    (HARD) MCP tool params match curated catalog (u72)
  21  duplicate-section-heading (HARD) any H2 appearing more than once in a file (u72)
  22  bare-script-path-everywhere (HARD) opt-out marker honors source-repo refs (u72)
        (extends invariant 11 with <!-- bare-script-path-allowed: <reason> --> support)
  23  missing-canonical-section (HARD) every command body has a \`## Lifecycle\` H2 (u72/Round-13)

Options:
  --commands-dir <path>   Commands root (default: .testatlas/commands)
  --commands-root <path>  Alias for --commands-dir
  --scripts-dir <path>    Scripts root (default: scripts)
  --schemas-dir <path>    Schemas root (default: .testatlas/schemas)
  --manifest <path>       Emit audit-manifest JSON to <path> (skips lint)
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
  let manifestOut = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commands-dir' || a === '--commands-root')
      opts.commandsDir = path.resolve(argv[++i]);
    else if (a === '--scripts-dir') opts.scriptsDir = path.resolve(argv[++i]);
    else if (a === '--schemas-dir') opts.schemasDir = path.resolve(argv[++i]);
    else if (a === '--manifest') manifestOut = path.resolve(argv[++i]);
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
  if (manifestOut) {
    const commandsDir = opts.commandsDir ?? path.join(PROJECT_ROOT, '.testatlas/commands');
    const scriptsDir = opts.scriptsDir ?? path.join(PROJECT_ROOT, 'scripts');
    const schemasDir = opts.schemasDir ?? path.join(PROJECT_ROOT, '.testatlas/schemas');
    const manifest = await emitManifest({
      commandsDir,
      scriptsDir,
      schemasDir,
      outPath: manifestOut,
    });
    if (!opts.quiet) {
      process.stdout.write(
        `lint-commands: manifest written to ${manifestOut} (${manifest.summary.commands_scanned} commands, ${manifest.summary.claims_extracted} claims, ${manifest.summary.resolution_rate} resolved)\n`,
      );
    }
    process.exit(0);
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
