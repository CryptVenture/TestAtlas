#!/usr/bin/env node
// scripts/validate-brain.js
//
// Plan 14-01 Task 3 — validate the V2 brain skeleton.
//
// This is a STUB validator (Wave 1). It enforces:
//   1. Every required brain file exists (19 JSON + 3 JSONL = 22 total).
//   2. Every JSON file is parseable.
//   3. Every JSONL line is parseable as a JSON object.
//   4. manifest.json has required top-level fields (schema_version, project_name).
//   5. state.json has required top-level fields (schema_version, project, status,
//      counts, confidence).
//
// Wave 2 will replace this stub with full AJV validation against the V2 schema
// suite (PRD §22 / §32). For now, we want a fast smoke check that fresh
// installs and migrations leave the brain in a parseable, structurally-correct
// state.
//
// Usage:
//   node scripts/validate-brain.js           # validate ./_testatlas/brain
//   node scripts/validate-brain.js --cwd /x  # validate /x/_testatlas/brain
//
// Exit codes:
//   0 — brain is healthy
//   1 — at least one finding (missing file, parse error, missing required field)
//
// Programmatic API:
//   import { validateBrain } from './validate-brain.js';
//   const { ok, findings } = await validateBrain({ cwd });

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Required JSON brain files (19). */
export const REQUIRED_JSON_FILES = [
  'manifest.json',
  'state.json',
  'agent_sessions.json',
  'assumptions.json',
  'commands.json',
  'components.json',
  'coverage.json',
  'decisions.json',
  'domains.json',
  'drift.json',
  'embeddings_manifest.json',
  'evidence.json',
  'flows.json',
  'graph.json',
  'issues.json',
  'open_questions.json',
  'personas.json',
  'quality_scores.json',
  'risks.json',
  'routes.json',
];

/** Required JSONL brain files (3). */
export const REQUIRED_JSONL_FILES = ['claims.jsonl', 'events.jsonl', 'observations.jsonl'];

/**
 * Required top-level fields per file. Stub-level only — Wave 2 replaces with
 * full AJV validation.
 */
const REQUIRED_FIELDS = {
  'manifest.json': ['schema_version'],
  'state.json': ['schema_version', 'project', 'status', 'counts', 'confidence'],
};

/**
 * @typedef {{ file: string; severity: 'error'; code: string; message: string }} Finding
 */

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a JSON file: must exist, parse, and (if required-fields are
 * declared for it) contain those keys at the top level.
 *
 * @param {string} brainDir
 * @param {string} fileName
 * @returns {Promise<Finding[]>}
 */
async function validateJsonFile(brainDir, fileName) {
  const findings = [];
  const full = path.join(brainDir, fileName);
  if (!(await fileExists(full))) {
    findings.push({
      file: fileName,
      severity: 'error',
      code: 'BRAIN_FILE_MISSING',
      message: `Required brain file missing: ${fileName}`,
    });
    return findings;
  }
  let text;
  try {
    text = await readFile(full, 'utf8');
  } catch (err) {
    findings.push({
      file: fileName,
      severity: 'error',
      code: 'BRAIN_FILE_UNREADABLE',
      message: `Could not read ${fileName}: ${err.message}`,
    });
    return findings;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    findings.push({
      file: fileName,
      severity: 'error',
      code: 'BRAIN_JSON_PARSE_ERROR',
      message: `Invalid JSON in ${fileName}: ${err.message}`,
    });
    return findings;
  }
  const required = REQUIRED_FIELDS[fileName];
  if (required && (typeof parsed !== 'object' || parsed === null)) {
    findings.push({
      file: fileName,
      severity: 'error',
      code: 'BRAIN_REQUIRED_FIELD_MISSING',
      message: `${fileName} top-level value must be an object`,
    });
    return findings;
  }
  if (required) {
    for (const key of required) {
      if (!(key in parsed)) {
        findings.push({
          file: fileName,
          severity: 'error',
          code: 'BRAIN_REQUIRED_FIELD_MISSING',
          message: `${fileName} missing required field: ${key}`,
        });
      }
    }
  }
  return findings;
}

/**
 * Validate a JSONL file: must exist, every non-empty line must be a JSON
 * object. Empty file is acceptable (event log starts empty).
 *
 * @param {string} brainDir
 * @param {string} fileName
 * @returns {Promise<Finding[]>}
 */
async function validateJsonlFile(brainDir, fileName) {
  const findings = [];
  const full = path.join(brainDir, fileName);
  if (!(await fileExists(full))) {
    findings.push({
      file: fileName,
      severity: 'error',
      code: 'BRAIN_FILE_MISSING',
      message: `Required brain file missing: ${fileName}`,
    });
    return findings;
  }
  let text;
  try {
    text = await readFile(full, 'utf8');
  } catch (err) {
    findings.push({
      file: fileName,
      severity: 'error',
      code: 'BRAIN_FILE_UNREADABLE',
      message: `Could not read ${fileName}: ${err.message}`,
    });
    return findings;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        findings.push({
          file: fileName,
          severity: 'error',
          code: 'BRAIN_JSONL_LINE_NOT_OBJECT',
          message: `${fileName} line ${i + 1} is not a JSON object`,
        });
      }
    } catch (err) {
      findings.push({
        file: fileName,
        severity: 'error',
        code: 'BRAIN_JSONL_PARSE_ERROR',
        message: `${fileName} line ${i + 1} is not valid JSON: ${err.message}`,
      });
    }
  }
  return findings;
}

/**
 * Validate the V2 brain at `<cwd>/_testatlas/brain/`.
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<{ ok: boolean; findings: Finding[]; brainDir: string }>}
 */
export async function validateBrain({ cwd = process.cwd() } = {}) {
  const brainDir = path.join(cwd, '_testatlas', 'brain');
  const allFindings = [];

  if (!(await fileExists(brainDir))) {
    return {
      ok: false,
      findings: [
        {
          file: '_testatlas/brain',
          severity: 'error',
          code: 'BRAIN_DIR_MISSING',
          message: `Brain directory missing: ${brainDir}`,
        },
      ],
      brainDir,
    };
  }

  for (const f of REQUIRED_JSON_FILES) {
    allFindings.push(...(await validateJsonFile(brainDir, f)));
  }
  for (const f of REQUIRED_JSONL_FILES) {
    allFindings.push(...(await validateJsonlFile(brainDir, f)));
  }

  return { ok: allFindings.length === 0, findings: allFindings, brainDir };
}

/**
 * Parse `--cwd <dir>` from argv. Defaults to `process.cwd()`.
 *
 * @param {string[]} argv
 * @returns {{ cwd: string }}
 */
function parseArgs(argv) {
  let cwd = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cwd' && i + 1 < argv.length) {
      cwd = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return { cwd };
}

// CLI entrypoint — run only when invoked as the main module.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { cwd } = parseArgs(process.argv.slice(2));
  const { ok, findings, brainDir } = await validateBrain({ cwd });
  if (ok) {
    console.log(`validate-brain: OK (${brainDir})`);
    process.exit(0);
  }
  console.error(`validate-brain: ${findings.length} finding(s) in ${brainDir}`);
  for (const f of findings) {
    console.error(`  [${f.code}] ${f.file}: ${f.message}`);
  }
  process.exit(1);
}
