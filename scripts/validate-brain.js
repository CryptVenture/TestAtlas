#!/usr/bin/env node
// scripts/validate-brain.js
//
// Plan 14-01 Task 3 (stub) → Plan 14-02 Task 1 (full AJV).
//
// Validates the V2 brain at `<cwd>/_testatlas/brain/` (or --brain-dir):
//   1. Every required brain file exists (19 JSON + 3 JSONL = 22 total).
//   2. Every JSON file is parseable.
//   3. Every JSONL line is parseable as a JSON object.
//   4. Each file's parsed value is validated against its V2 schema via AJV
//      when a schema is registered for it.
//   5. JSONL lines are validated line-by-line against their schema (event,
//      claim, observation/transcript).
//
// Exit codes:
//   0 — brain is healthy
//   1 — at least one finding
//
// Programmatic API:
//   import { validateBrain } from './validate-brain.js';
//   const { ok, findings } = await validateBrain({ cwd, brainDir, suiteCwd });

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { formatErrors } from './lib/ajv-instance.js';
import { loadAllSchemas } from './lib/schema-loader.js';

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
 * Map filename → V2 schema $id (when one exists). Files NOT in this map are
 * still presence-+-parse checked but not AJV-validated (they're free-form
 * brain indexes whose internal shape will be locked in later waves).
 */
const SCHEMA_MAP = {
  'manifest.json': 'https://testatlas.dev/schemas/v2/manifest.schema.json',
  'state.json': 'https://testatlas.dev/schemas/v2/state.schema.json',
  'graph.json': 'https://testatlas.dev/schemas/v2/relationship.schema.json',
  'coverage.json': 'https://testatlas.dev/schemas/v2/coverage.schema.json',
};

/**
 * For JSONL: filename → schema $id used per-line.
 */
const JSONL_SCHEMA_MAP = {
  'events.jsonl': 'https://testatlas.dev/schemas/v2/event.schema.json',
  'claims.jsonl': 'https://testatlas.dev/schemas/v2/claim.schema.json',
  // observations.jsonl: no schema yet (Wave 4+ extends).
};

/** Stub-style required-fields fallback when no $id is mapped. */
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

function makeFinding(file, code, message) {
  return { file, severity: 'error', code, message };
}

/**
 * @param {string} brainDir
 * @param {string} fileName
 * @param {ReturnType<import('./lib/ajv-instance.js').getAjv> | null} ajv
 * @returns {Promise<Finding[]>}
 */
async function validateJsonFile(brainDir, fileName, ajv) {
  const findings = [];
  const full = path.join(brainDir, fileName);
  if (!(await fileExists(full))) {
    findings.push(
      makeFinding(fileName, 'BRAIN_FILE_MISSING', `Required brain file missing: ${fileName}`),
    );
    return findings;
  }
  let text;
  try {
    text = await readFile(full, 'utf8');
  } catch (err) {
    findings.push(
      makeFinding(fileName, 'BRAIN_FILE_UNREADABLE', `Could not read ${fileName}: ${err.message}`),
    );
    return findings;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    findings.push(
      makeFinding(
        fileName,
        'BRAIN_JSON_PARSE_ERROR',
        `Invalid JSON in ${fileName}: ${err.message}`,
      ),
    );
    return findings;
  }

  // AJV validation when a schema is registered for this file.
  const schemaId = SCHEMA_MAP[fileName];
  if (schemaId && ajv) {
    const validate = ajv.getSchema(schemaId);
    if (validate) {
      if (!validate(parsed)) {
        for (const line of formatErrors(validate.errors, fileName)) {
          findings.push(makeFinding(fileName, 'BRAIN_SCHEMA_VIOLATION', line));
        }
        return findings;
      }
      return findings;
    }
    // Schema not registered (e.g. running in a tree without .testatlas/) —
    // fall through to required-fields stub.
  }

  // Stub-level required-fields fallback.
  const required = REQUIRED_FIELDS[fileName];
  if (required) {
    if (typeof parsed !== 'object' || parsed === null) {
      findings.push(
        makeFinding(
          fileName,
          'BRAIN_REQUIRED_FIELD_MISSING',
          `${fileName} top-level value must be an object`,
        ),
      );
      return findings;
    }
    for (const key of required) {
      if (!(key in parsed)) {
        findings.push(
          makeFinding(
            fileName,
            'BRAIN_REQUIRED_FIELD_MISSING',
            `${fileName} missing required field: ${key}`,
          ),
        );
      }
    }
  }
  return findings;
}

/**
 * @param {string} brainDir
 * @param {string} fileName
 * @param {ReturnType<import('./lib/ajv-instance.js').getAjv> | null} ajv
 * @returns {Promise<Finding[]>}
 */
async function validateJsonlFile(brainDir, fileName, ajv) {
  const findings = [];
  const full = path.join(brainDir, fileName);
  if (!(await fileExists(full))) {
    findings.push(
      makeFinding(fileName, 'BRAIN_FILE_MISSING', `Required brain file missing: ${fileName}`),
    );
    return findings;
  }
  let text;
  try {
    text = await readFile(full, 'utf8');
  } catch (err) {
    findings.push(
      makeFinding(fileName, 'BRAIN_FILE_UNREADABLE', `Could not read ${fileName}: ${err.message}`),
    );
    return findings;
  }
  const lines = text.split('\n');
  const schemaId = JSONL_SCHEMA_MAP[fileName];
  const validate = schemaId && ajv ? ajv.getSchema(schemaId) : null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      findings.push(
        makeFinding(
          fileName,
          'BRAIN_JSONL_PARSE_ERROR',
          `${fileName} line ${i + 1} is not valid JSON: ${err.message}`,
        ),
      );
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      findings.push(
        makeFinding(
          fileName,
          'BRAIN_JSONL_LINE_NOT_OBJECT',
          `${fileName} line ${i + 1} is not a JSON object`,
        ),
      );
      continue;
    }
    if (validate && !validate(parsed)) {
      for (const errLine of formatErrors(validate.errors, `${fileName}:${i + 1}`)) {
        findings.push(makeFinding(fileName, 'BRAIN_SCHEMA_VIOLATION', errLine));
      }
    }
  }
  return findings;
}

/**
 * Validate the V2 brain.
 *
 * @param {{ cwd?: string, brainDir?: string, suiteCwd?: string }} [opts]
 *   - cwd: workspace root (defaults to process.cwd()). Brain dir is
 *     `<cwd>/_testatlas/brain` unless brainDir is given.
 *   - brainDir: explicit brain directory (overrides cwd-derived path).
 *   - suiteCwd: where to load schemas from (defaults to cwd). Lets tests
 *     point at the live repo's .testatlas/ tree while validating a temp brain.
 * @returns {Promise<{ ok: boolean; findings: Finding[]; brainDir: string }>}
 */
export async function validateBrain({ cwd = process.cwd(), brainDir, suiteCwd } = {}) {
  const resolvedBrainDir = brainDir
    ? path.resolve(brainDir)
    : path.join(cwd, '_testatlas', 'brain');
  const allFindings = [];

  if (!(await fileExists(resolvedBrainDir))) {
    return {
      ok: false,
      findings: [
        makeFinding(
          '_testatlas/brain',
          'BRAIN_DIR_MISSING',
          `Brain directory missing: ${resolvedBrainDir}`,
        ),
      ],
      brainDir: resolvedBrainDir,
    };
  }

  // Load schemas best-effort. If no .testatlas/ available, AJV won't be set up
  // but we still do presence/parse/required-fields validation.
  let ajv = null;
  try {
    ajv = await loadAllSchemas({ cwd: suiteCwd ?? cwd });
  } catch {
    ajv = null;
  }

  for (const f of REQUIRED_JSON_FILES) {
    allFindings.push(...(await validateJsonFile(resolvedBrainDir, f, ajv)));
  }
  for (const f of REQUIRED_JSONL_FILES) {
    allFindings.push(...(await validateJsonlFile(resolvedBrainDir, f, ajv)));
  }

  return { ok: allFindings.length === 0, findings: allFindings, brainDir: resolvedBrainDir };
}

/**
 * Parse `--cwd <dir>`, `--brain-dir <dir>`, `--suite-cwd <dir>` from argv.
 *
 * @param {string[]} argv
 */
function parseArgs(argv) {
  let cwd = process.cwd();
  let brainDir;
  let suiteCwd;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd' && i + 1 < argv.length) {
      cwd = path.resolve(argv[++i]);
    } else if (a === '--brain-dir' && i + 1 < argv.length) {
      brainDir = path.resolve(argv[++i]);
    } else if (a === '--suite-cwd' && i + 1 < argv.length) {
      suiteCwd = path.resolve(argv[++i]);
    }
  }
  return { cwd, brainDir, suiteCwd };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const { ok, findings, brainDir } = await validateBrain(args);
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
